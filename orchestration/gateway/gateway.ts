// Execution Gateway: 管理対象のエージェント実行を1か所から開始する。
// 1受付 2ルーティング 3判断の検証 4権限・予算・承認 5実行 6結果取得 7計測 8成果物検証 9状態更新（失敗時は上限つきで再試行・上位切替え）。
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {isAbsolute,join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {ROOT,fail,loadPolicy,loadRegistry,newId,now,paths,sha256,tierIndex,type AuthMode,type FailureCause,type Initiator,type Provider,type Tier} from './config.ts';
import {consume,hasHumanApproval,mint,verify,ApprovalError} from './approval.ts';
import {validate} from './schema.ts';
import {logEvent,openDb,type DB} from '../telemetry/db.ts';
import {meteringOf,readJsonlFrom,recordCumulative,recordUnavailable,recordUsage,refreshMetering} from '../telemetry/monitor.ts';
import {agyTranscriptPath,agyTranscriptUsage} from '../telemetry/normalize.ts';
import {nextAction,nextTier,route,type Decision,type Env,type Task} from '../router/router.ts';
import {childEnv,type Adapter,type AdapterResult} from '../adapters/types.ts';
import {claudeAdapter} from '../adapters/claude.ts';
import {codexAdapter} from '../adapters/codex.ts';
import {antigravityAdapter} from '../adapters/antigravity.ts';
import {geminiAdapter} from '../adapters/gemini-api.ts';
import {mockAdapter,programAdapter} from '../adapters/local.ts';

export const DEFAULT_ADAPTERS:Record<Provider,Adapter>={claude:claudeAdapter,codex:codexAdapter,antigravity:antigravityAdapter,'gemini-api':geminiAdapter(),local:programAdapter,mock:mockAdapter};
export type ExecSummary={execution_id:string;decision_id:string|null;provider:string|null;model_id:string|null;tier:string|null;status:string;metering_status:string;failure_cause:FailureCause|null;message:string|null;retry_count:number;escalation_count:number};
export type RunReport={task_id:string;status:'completed'|'failed'|'rejected'|'unmetered'|'awaiting_human_approval';executions:ExecSummary[];message:string;review:ExecSummary|null};
export type RunOptions={adapters?:Partial<Record<Provider,Adapter>>;env?:NodeJS.ProcessEnv;db?:DB;authOverride?:Env['authenticated']};

// 実行元の製品を環境変数から推定する（申告と異なれば記録する）。
export function detectProduct(env:NodeJS.ProcessEnv):Initiator|null{
 if(env.CLAUDECODE==='1'||env.CLAUDE_CODE_SESSION_ID)return 'claude';
 if(env.ANTIGRAVITY_CONVERSATION_ID)return 'antigravity';
 if(Object.keys(env).some(k=>/^CODEX_(THREAD_ID|SESSION_ID|SANDBOX|CI)$/.test(k)))return 'codex';
 return null;
}
// 認証状態（秘密値は読まない。ファイルの有無・状態コマンドの結果だけ）。
export function authStatus(env:NodeJS.ProcessEnv):Env['authenticated']{
 if(env.AGENTCTL_ALLOW_MOCK==='1'&&env.AGENTCTL_AUTH_OVERRIDE)return JSON.parse(env.AGENTCTL_AUTH_OVERRIDE);
 const a:Env['authenticated']={local:['none']};
 const codexHome=env.CODEX_HOME??join(homedir(),'.codex');
 if(existsSync(join(codexHome,'auth.json'))){const s=spawnSync('codex',['login','status'],{encoding:'utf8',timeout:15000,env:childEnv(env,'subscription',{})});if(/ChatGPT/i.test(s.stdout+s.stderr))a.codex=['subscription']}
 const c=spawnSync('claude',['auth','status'],{encoding:'utf8',timeout:15000,env:childEnv(env,'subscription',{})});
 try{const j=JSON.parse(c.stdout);if(j.loggedIn===true)a.claude=[j.authMethod==='api_key'?'api_key':'subscription']}catch{/* 未ログイン扱い */}
 const agySettings=join(homedir(),'.gemini','antigravity-cli','settings.json');
 let agyApiMode=false;try{agyApiMode=/"modelProvider"\s*:/.test(readFileSync(agySettings,'utf8'))}catch{/* 設定なし＝アカウント認証 */}
 if(!agyApiMode&&agyAuthenticated(env))a.antigravity=['subscription'];
 if(env.GEMINI_API_KEY)a['gemini-api']=['api_key'];
 if(env.AGENTCTL_ALLOW_MOCK==='1')a.mock=['none'];
 return a;
}
// Antigravityの子エージェントの会話は親の結果JSONの usage に含まれない（2026-10-12に実データで確認）。
// 同じ実行の承認で動いた別の会話（＝子の会話）を見つけ、その会話記録から使用量を子の実行に記録する。
export function linkAgyChildren(db:DB,exe:string,parentConv:string,home?:string):number{
 const kids=db.prepare("SELECT session_id,model_id,transcript_path FROM sessions WHERE product='antigravity' AND managed_execution_id=? AND session_id<>? ORDER BY started_at").all(exe,parentConv) as {session_id:string;model_id:string|null;transcript_path:string|null}[];
 const rows=db.prepare("SELECT execution_id FROM executions WHERE parent_execution_id=? AND route='native_subagent' AND session_product='antigravity' ORDER BY COALESCE(start_time,updated_at)").all(exe) as {execution_id:string}[];
 let n=0;
 kids.forEach((k,i)=>{
  const target=rows[i]?.execution_id;if(!target){logEvent(db,'agy_child_unmatched',{conversation:k.session_id},{execution_id:exe});return}
  const path=k.transcript_path&&existsSync(k.transcript_path)?k.transcript_path:agyTranscriptPath(k.session_id,home);
  if(!existsSync(path))return;
  const usage=agyTranscriptUsage(readJsonlFrom(path,0).records,k.session_id,k.model_id);
  if(!usage.length)return;
  db.prepare("DELETE FROM usage WHERE execution_id=? AND dedupe_key=?").run(target,`unavailable:${target}`);
  for(const u of usage)recordUsage(db,target,u,'subscription');
  db.prepare("UPDATE executions SET agent_id=COALESCE(agent_id,?),model_id=COALESCE(?,model_id),metering_status='missing' WHERE execution_id=?").run(k.session_id,k.model_id,target);
  refreshMetering(db,target);n++;
  logEvent(db,'agy_child_usage_linked',{conversation:k.session_id,steps:usage.length},{execution_id:target});
 });
 return n;
}
// Antigravityのアカウント認証。資格情報の保存場所は版で変わる（2026-10-11にトークンファイルが無くなった）ため、
// モデルのターンを使わない `agy models` の成功で判定し、10分間キャッシュする。
function agyAuthenticated(env:NodeJS.ProcessEnv):boolean{
 const cache=join(paths().data,'auth-agy.json');
 try{const c=JSON.parse(readFileSync(cache,'utf8')) as {at:string;ok:boolean};if(Date.now()-Date.parse(c.at)<10*60_000)return c.ok}catch{/* キャッシュなし */}
 const r=spawnSync('agy',['models'],{encoding:'utf8',timeout:60_000,env:childEnv(env,'subscription',{})});
 const ok=r.status===0&&/\bgemini-/.test(r.stdout);
 try{mkdirSync(paths().data,{recursive:true});writeFileSync(cache,JSON.stringify({at:now(),ok})+'\n')}catch{/* 保存できなくても続行 */}
 return ok;
}
type ExecRow={execution_id:string;task_id:string;status:string;decision_id:string|null;retry_count:number;escalation_count:number;metering_status:string;provider:string|null;model_id:string|null};
function insertExecution(db:DB,task:Task&{task_id:string},executionId:string,parentExecutionId:string|null,retry:number,escalation:number){
 db.prepare(`INSERT INTO executions(execution_id,task_id,parent_task_id,parent_execution_id,decision_id,initiator,agent_name,provider,model_id,reasoning_level,task_type,difficulty,routing_reason,status,managed,route,auth_mode,start_time,end_time,duration_ms,retry_count,escalation_count,metering_status,updated_at)
  VALUES(?,?,?,?,NULL,?,?,NULL,NULL,NULL,?,?,NULL,'planned',1,NULL,'unknown',NULL,NULL,NULL,?,?,'missing',?)`).run(executionId,task.task_id,task.parent_task_id,parentExecutionId,task.initiator,task.agent_name,task.task_type,task.difficulty,retry,escalation,now());
}
function applyDecision(db:DB,d:Decision){
 db.prepare(`INSERT INTO decisions(decision_id,task_id,execution_id,provider,model_id,reasoning_level,tier,route,auth_mode,difficulty,difficulty_source,task_type,routing_reason,used_llm,policy_version,escalation_from,escalation_cause,requires_human_approval,created_at,json)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(d.decision_id,d.task_id,d.execution_id,d.selected?.provider??null,d.selected?.model_id??null,d.selected?.reasoning_level??null,d.selected?.tier??null,d.selected?.route??null,d.selected?.auth_mode??null,d.difficulty,d.difficulty_source,d.task_type,d.routing_reason,d.used_llm?1:0,d.policy_version,d.escalation.from_decision_id,d.escalation.cause,d.requires_human_approval?1:0,d.created_at,JSON.stringify(d));
 db.prepare('UPDATE executions SET decision_id=?,provider=?,model_id=?,reasoning_level=?,difficulty=?,routing_reason=?,route=?,auth_mode=?,metering_status=?,updated_at=? WHERE execution_id=?')
  .run(d.decision_id,d.selected?.provider??null,d.selected?.model_id??null,d.selected?.reasoning_level??null,d.difficulty,d.routing_reason,d.selected?.route??null,d.selected?.auth_mode??'unknown',d.selected?.route==='program'?'not_applicable':'missing',now(),d.execution_id);
}
function setStatus(db:DB,id:string,status:string,extra:{cause?:FailureCause|null;message?:string|null}={}){
 db.prepare('UPDATE executions SET status=?,error_cause=COALESCE(?,error_cause),error_message=COALESCE(?,error_message),updated_at=? WHERE execution_id=?').run(status,extra.cause??null,extra.message??null,now(),id);
}
// 判断の検証: 登録簿に存在し選択可能、方針ファイルが判断時と同一、認証経路あり、品質の下限を満たす。
export function validateDecision(d:Decision,env:Env):void{
 validate('routing-decision',d);
 const {policy,sha256:psha}=loadPolicy(),reg=loadRegistry();
 if(d.policy_sha256!==psha)fail('判断後にルーティング方針が変更された');
 const s=d.selected;if(!s)fail(`実行可能なモデルがない: ${d.routing_reason}`);
 if(s.route==='program')return;
 const m=reg.models.find(x=>x.provider===s.provider&&x.model_id===s.model_id);
 if(!m)fail(`登録簿にないモデル: ${s.provider}:${s.model_id}`);
 if(!m.selectable)fail(`自動選択の対象外のモデル: ${s.model_id}`);
 if(m.tier!==s.tier)fail('判断のtierと登録簿が一致しない');
 if(!(env.authenticated[s.provider]??[]).includes(s.auth_mode))fail(`認証経路がない: ${s.provider}/${s.auth_mode}`);
 if(s.auth_mode==='api_key'&&!policy.auth.allow_api_billing)fail('API課金は方針で無効');
 if(tierIndex(s.tier)<tierIndex(policy.quality_floor[d.quality_requirement]))fail('品質要求の下限を満たさない');
}
function summary(db:DB,id:string):ExecSummary{
 const r=db.prepare('SELECT e.*,d.tier FROM executions e LEFT JOIN decisions d ON d.decision_id=e.decision_id WHERE e.execution_id=?').get(id) as Record<string,unknown>;
 return {execution_id:id,decision_id:(r.decision_id as string)??null,provider:(r.provider as string)??null,model_id:(r.model_id as string)??null,tier:(r.tier as string)??null,status:String(r.status),metering_status:String(r.metering_status),failure_cause:(r.error_cause as FailureCause)??null,message:(r.error_message as string)??null,retry_count:Number(r.retry_count),escalation_count:Number(r.escalation_count)};
}
function writeRunFile(task:string,exe:string,name:string,value:unknown){const dir=join(paths().runs,task,exe);mkdirSync(dir,{recursive:true});writeFileSync(join(dir,name),JSON.stringify(value,null,2)+'\n');return dir}

export function prepareTask(raw:unknown,env:NodeJS.ProcessEnv):Task&{task_id:string}{
 const t=validate<Task>('task',raw);
 const product=detectProduct(env);
 return {...t,task_id:t.task_id??newId('tsk'),parent_task_id:t.parent_task_id??env.AGENTCTL_TASK_ID??null,initiator:t.initiator==='unknown'&&product?product:t.initiator};
}
export async function runTask(raw:unknown,opts:RunOptions={}):Promise<RunReport>{
 const env=opts.env??process.env,db=opts.db??openDb();
 const task=prepareTask(raw,env);
 const {policy,sha256:psha}=loadPolicy(),registry=loadRegistry();
 const product=detectProduct(env);
 if(product&&task.initiator!==product&&task.initiator!=='human')logEvent(db,'initiator_mismatch',{declared:task.initiator,detected:product},{});
 const parentExecution=env.AGENTCTL_EXECUTION_ID??null,depth=Number(env.AGENTCTL_DEPTH??'0');
 const reject=(msg:string,cause:FailureCause='policy'):RunReport=>{logEvent(db,'gateway_reject',{task_id:task.task_id,message:msg,cause});return {task_id:task.task_id,status:'rejected',executions:[],message:msg,review:null}};
 // 計測が動かない状態では管理対象の実行を開始しない（Fail Closed）。
 if(env.AGENTCTL_TELEMETRY==='off')return reject('Token Monitorが無効（AGENTCTL_TELEMETRY=off）のため実行しない','tooling');
 if(depth>=policy.limits.max_depth)return reject(`入れ子の深さが上限 ${policy.limits.max_depth} に達した（再帰防止）`);
 const promptPath=task.input.prompt_file?resolve(ROOT,task.input.prompt_file):null;
 if(promptPath&&!existsSync(promptPath))return reject(`prompt_fileがない: ${task.input.prompt_file}`,'input');
 const prompt=promptPath?readFileSync(promptPath,'utf8'):null;
 const workdir=task.input.workdir?(isAbsolute(task.input.workdir)?task.input.workdir:resolve(ROOT,task.input.workdir)):ROOT;
 if(!existsSync(workdir))return reject(`workdirがない: ${workdir}`,'input');
 db.prepare('INSERT INTO tasks(task_id,parent_task_id,title,task_type,difficulty,quality_requirement,initiator,agent_name,audit,origin,prompt_sha256,prompt_chars,created_at,json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(task_id) DO NOTHING')
  .run(task.task_id,task.parent_task_id,task.title,task.task_type,task.difficulty,task.quality_requirement,task.initiator,task.agent_name,task.audit?1:0,'gateway',prompt?sha256(prompt):null,prompt?.length??null,now(),JSON.stringify(task));
 const routeEnv:Env={authenticated:opts.authOverride??authStatus(env),allowMock:env.AGENTCTL_ALLOW_MOCK==='1'};
 const adapters={...DEFAULT_ADAPTERS,...opts.adapters};
 const executions:string[]=[];
 let prev:Decision|undefined,cause:FailureCause|null=null,retries=0,escalations=0,minTier:Tier|undefined;
 for(let attempt=0;attempt<1+policy.limits.max_retries+policy.limits.max_escalations;attempt++){
  const exe=newId('exe');executions.push(exe);
  insertExecution(db,task,exe,parentExecution,retries,escalations);
  const decision=route({task,execution_id:exe,policy,policy_sha256:psha,registry,env:routeEnv,minTier,escalation:prev&&cause&&minTier?{from:prev,cause}:undefined});
  applyDecision(db,decision);writeRunFile(task.task_id,exe,'routing-decision.json',decision);
  try{validateDecision(decision,routeEnv)}catch(e){setStatus(db,exe,'rejected',{cause:'policy',message:(e as Error).message});break}
  if(decision.requires_human_approval&&!hasHumanApproval(db,decision.decision_id)){
   setStatus(db,exe,'planned',{message:`人の承認待ち: ${decision.human_approval_reason}`});
   return {task_id:task.task_id,status:'awaiting_human_approval',executions:executions.map(x=>summary(db,x)),message:`人が端末で agentctl approve ${decision.decision_id} を実行してから agentctl run --resume ${exe}`,review:null};
  }
  const r=await execute(db,task,exe,decision,{env,adapters,prompt,workdir,parentExecution,depth,policy});
  if(r.final==='completed'||r.final==='unmetered'){
   const review=r.final==='completed'&&decision.review.required?await runReview(db,task,exe,decision,r.output,{env,adapters,workdir,depth,routeEnv}):null;
   return {task_id:task.task_id,status:r.final,executions:executions.map(x=>summary(db,x)),message:r.final==='unmetered'?'処理は終了したが計測できなかったため正常完了にしない':'完了',review};
  }
  if(r.final==='rejected')break;
  cause=r.cause??'unknown';
  const next=nextAction(cause,{retries,escalations,tier:decision.selected!.tier},task,policy);
  logEvent(db,'gateway_next',{execution_id:exe,cause,next},{execution_id:exe});
  if(next.action==='stop'){db.prepare('UPDATE executions SET error_message=? WHERE execution_id=?').run(`${r.message??''} / ${next.reason}`.slice(0,800),exe);break}
  if(next.action==='retry_same'){retries++;minTier=decision.selected!.tier}
  else{escalations++;minTier=nextTier(decision.selected!.tier)}
  prev=decision;
 }
 const last=summary(db,executions.at(-1)!);
 return {task_id:task.task_id,status:last.status==='rejected'?'rejected':'failed',executions:executions.map(x=>summary(db,x)),message:last.message??'失敗',review:null};
}
type ExecCtx={env:NodeJS.ProcessEnv;adapters:Record<Provider,Adapter>;prompt:string|null;workdir:string;parentExecution:string|null;depth:number;policy:ReturnType<typeof loadPolicy>['policy']};
async function execute(db:DB,task:Task&{task_id:string},exe:string,d:Decision,ctx:ExecCtx):Promise<{final:'completed'|'failed'|'rejected'|'unmetered';cause:FailureCause|null;message:string|null;output:string|null}>{
 const s=d.selected!,adapter=ctx.adapters[s.provider];
 if(!adapter){setStatus(db,exe,'rejected',{cause:'tooling',message:`アダプタなし: ${s.provider}`});return {final:'rejected',cause:'tooling',message:'アダプタなし',output:null}}
 const {token}=mint(db,{execution_id:exe,decision_id:d.decision_id,task_id:task.task_id,provider:s.provider,model_id:s.model_id,reasoning_level:s.reasoning_level,initiator:task.initiator,issuer:'gateway'},ctx.policy.limits.approval_ttl_seconds);
 // 起動直前に、承認と実際に起動するモデル・実行主体を照合し、1回限りで消費する。
 try{const a=verify(db,token,{execution_id:exe,provider:s.provider,model_id:s.model_id,reasoning_level:s.reasoning_level,initiator:task.initiator});consume(db,a)}
 catch(e){setStatus(db,exe,'rejected',{cause:'policy',message:(e as Error).message});return {final:'rejected',cause:'policy',message:(e as Error).message,output:null}}
 const start=Date.now(),runDir=join(paths().runs,task.task_id,exe);
 db.prepare("UPDATE executions SET status='running',start_time=?,updated_at=? WHERE execution_id=?").run(new Date(start).toISOString(),now(),exe);
 const env=childEnv(ctx.env,s.auth_mode,{AGENTCTL_EXECUTION_ID:exe,AGENTCTL_TASK_ID:task.task_id,AGENTCTL_APPROVAL:token,AGENTCTL_PROVIDER:s.provider,AGENTCTL_MODEL:s.model_id??'',AGENTCTL_DEPTH:String(ctx.depth+1),AGENTCTL_DATA_DIR:paths().data,AGENTCTL_KEY_DIR:paths().keyDir,...(ctx.parentExecution?{AGENTCTL_PARENT_EXECUTION_ID:ctx.parentExecution}:{})});
 let r:AdapterResult;
 try{r=await adapter.execute({execution_id:exe,task,selected:s,prompt:ctx.prompt,workdir:ctx.workdir,timeoutMs:ctx.policy.limits.timeout_seconds[d.difficulty]*1000,env,runDir})}
 catch(e){r={status:'failed',failure_cause:'tooling',message:String(e).slice(0,500),exit_code:null,usage:[],usage_mode:'delta',usage_unavailable_reason:'アダプタ例外',reported_models:[],model_check:'unverifiable',session_id:null,output_text:null}}
 const end=Date.now();
 db.prepare('UPDATE executions SET end_time=?,duration_ms=?,session_product=?,session_id=?,updated_at=? WHERE execution_id=?').run(new Date(end).toISOString(),end-start,s.provider,r.session_id,now(),exe);
 // 計測（失敗した実行の消費も記録する）。取得できなければunavailableを明示する。
 const billing:'subscription'|'api_key'|'none'=s.auth_mode==='api_key'?'api_key':s.route==='program'?'none':'subscription';
 if(s.route!=='program'){
  if(r.usage.length)for(const u of r.usage)(r.usage_mode==='cumulative'?recordCumulative:recordUsage)(db,exe,u,billing);
  else recordUnavailable(db,exe,s.provider,s.model_id,r.usage_unavailable_reason??'使用量なし',billing);
  refreshMetering(db,exe);
  if(s.provider==='antigravity'&&r.session_id)linkAgyChildren(db,exe,r.session_id);
 }
 let status:'completed'|'failed'=r.status,cause=r.failure_cause,message=r.message;
 // 結果にモデルIDがない製品（Antigravity）は、子セッションのHookが記録した照合（製品が通知した実モデル）を使う。
 if(r.model_check==='unverifiable'){
  const ev=db.prepare("SELECT kind,detail_json FROM events WHERE execution_id=? AND kind IN ('child_session_verified','child_session_rejected') ORDER BY id DESC LIMIT 1").get(exe) as {kind:string;detail_json:string}|undefined;
  const reported=ev?(JSON.parse(ev.detail_json) as {model?:string|null}).model:null;
  if(ev?.kind==='child_session_rejected'){r.model_check='mismatch';r.reported_models=reported?[reported]:[]}
  else if(ev&&reported){r.model_check='verified';r.reported_models=[reported]}
 }
 if(r.model_check==='mismatch'){status='failed';cause='model_mismatch';message=`承認モデル ${s.model_id} と実際のモデル ${r.reported_models.join(',')} が異なる`;logEvent(db,'model_mismatch',{approved:s.model_id,reported:r.reported_models},{execution_id:exe})}
 else if(r.model_check==='unverifiable'&&s.route!=='program')logEvent(db,'model_unverifiable',{provider:s.provider,model:s.model_id},{execution_id:exe});
 // 成果物と試験
 const artifacts=task.expected_artifacts.map(p=>{const abs=resolve(ctx.workdir,p),ok=existsSync(abs);return {path:p,exists:ok,sha256:ok?sha256(readFileSync(abs)):null}});
 const tests:{name:string;status:'passed'|'failed'|'skipped'|'not_run';detail:string|null}[]=[];
 if(status==='completed'&&artifacts.some(a=>!a.exists)){status='failed';cause='quality';message=`成果物がない: ${artifacts.filter(a=>!a.exists).map(a=>a.path).join(', ')}`}
 if(task.test_command){
  if(status!=='completed')tests.push({name:task.test_command.join(' '),status:'not_run',detail:'実行が失敗したため未実施'});
  else{const t=spawnSync(task.test_command[0]!,task.test_command.slice(1),{cwd:ctx.workdir,encoding:'utf8',timeout:600000,env:childEnv(ctx.env,'subscription',{AGENTCTL_IN_TEST:'1'})});
   const ok=t.status===0;tests.push({name:task.test_command.join(' '),status:ok?'passed':'failed',detail:(t.stdout+t.stderr).slice(-400)||null});
   if(!ok){status='failed';cause='quality';message='試験に失敗'}}
 }
 db.prepare('UPDATE executions SET artifacts_json=?,test_results_json=? WHERE execution_id=?').run(JSON.stringify(artifacts),JSON.stringify(tests),exe);
 // 自動の評価（試験・成果物がある場合だけ。なければ未評価のまま＝合格扱いにしない）
 if(task.test_command||task.expected_artifacts.length){
  const ev={schema_version:'1',evaluation_id:newId('evl'),execution_id:exe,task_id:task.task_id,evaluator:{kind:task.test_command?'test':'program',name:'gateway-auto',provider:null,model_id:null},passed:status==='completed',score:null,
   criteria:[...artifacts.map(a=>({name:`artifact:${a.path}`,passed:a.exists,detail:null})),...tests.map(t=>({name:`test:${t.name}`,passed:t.status==='passed'?true:t.status==='failed'?false:null,detail:null}))],failure_cause:status==='completed'?null:cause,independent:true,notes:null,created_at:now()};
  recordEvaluation(db,ev);
 }
 const metering=s.route==='program'?'not_applicable':meteringOf(db,exe);
 let final:'completed'|'failed'|'unmetered'=status;
 if(status==='completed'&&task.audit&&ctx.policy.metering.required_when_audit&&(metering==='missing'||metering==='unavailable'))final='unmetered';
 setStatus(db,exe,final,{cause:final==='completed'?null:final==='unmetered'?'tooling':cause,message:final==='unmetered'?`計測なし（${r.usage_unavailable_reason??metering}）`:message});
 writeRunFile(task.task_id,exe,'execution.json',executionDoc(db,exe));
 return {final,cause,message,output:r.output_text};
}
// L4の独立レビュー。別製品（なければ別モデル）の高性能モデルが VERDICT: PASS|FAIL を返す。
async function runReview(db:DB,task:Task&{task_id:string},exe:string,d:Decision,output:string|null,ctx:{env:NodeJS.ProcessEnv;adapters:Record<Provider,Adapter>;workdir:string;depth:number;routeEnv:Env}):Promise<ExecSummary|null>{
 if(!d.review.provider||!d.review.model_id){logEvent(db,'review_unavailable',{task_id:task.task_id},{execution_id:exe});return null}
 const reviewTask:Task&{task_id:string}={...task,task_id:newId('tsk'),parent_task_id:task.task_id,title:`独立レビュー: ${task.title}`.slice(0,200),task_type:'review',difficulty:'L3',quality_requirement:'high',preferred_provider:d.review.provider,agent_name:'independent-reviewer',expected_artifacts:[],test_command:null,input:{...task.input,prompt_file:null,program:null}};
 const prompt=`次のタスク結果を独立にレビューし、最後の行に VERDICT: PASS または VERDICT: FAIL だけを書いてください。\nタスク: ${task.title}\n---\n${(output??'(出力なし)').slice(0,20000)}`;
 const rexe=newId('exe');
 db.prepare('INSERT INTO tasks(task_id,parent_task_id,title,task_type,difficulty,quality_requirement,initiator,agent_name,audit,origin,prompt_sha256,prompt_chars,created_at,json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
  .run(reviewTask.task_id,task.task_id,reviewTask.title,'review','L3','high','gateway','independent-reviewer',task.audit?1:0,'gateway-review',sha256(prompt),prompt.length,now(),JSON.stringify(reviewTask));
 insertExecution(db,{...reviewTask,initiator:'gateway'},rexe,exe,0,0);
 const {policy,sha256:psha}=loadPolicy();
 const rd=route({task:{...reviewTask,initiator:'gateway'},execution_id:rexe,policy,policy_sha256:psha,registry:loadRegistry(),env:{...ctx.routeEnv,restrictProvider:d.review.provider},minTier:'high'});
 applyDecision(db,rd);
 try{validateDecision(rd,ctx.routeEnv)}catch(e){setStatus(db,rexe,'rejected',{cause:'policy',message:(e as Error).message});return summary(db,rexe)}
 const r=await execute(db,{...reviewTask,initiator:'gateway'},rexe,rd,{env:ctx.env,adapters:ctx.adapters,prompt,workdir:ctx.workdir,parentExecution:exe,depth:ctx.depth,policy});
 const verdict=/VERDICT:\s*(PASS|FAIL)\s*$/i.exec((r.output??'').trim())?.[1]?.toUpperCase();
 recordEvaluation(db,{schema_version:'1',evaluation_id:newId('evl'),execution_id:exe,task_id:task.task_id,evaluator:{kind:'agent',name:'independent-reviewer',provider:rd.selected?.provider??null,model_id:rd.selected?.model_id??null},passed:verdict==='PASS'?true:verdict==='FAIL'?false:null,score:null,criteria:[],failure_cause:verdict==='FAIL'?'quality':null,independent:true,notes:verdict?null:'レビュー結果にVERDICT行がない',created_at:now()});
 return summary(db,rexe);
}
export function recordEvaluation(db:DB,ev:Record<string,unknown>){
 const e=validate<{evaluation_id:string;execution_id:string;task_id:string;evaluator:{kind:string;name:string};passed:boolean|null;score:number|null;failure_cause:string|null;independent:boolean;created_at:string}>('evaluation',ev);
 if(!db.prepare('SELECT 1 FROM executions WHERE execution_id=?').get(e.execution_id))fail(`実行がない: ${e.execution_id}`);
 db.prepare('INSERT INTO evaluations(evaluation_id,execution_id,task_id,evaluator_kind,evaluator_name,passed,score,failure_cause,independent,created_at,json) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
  .run(e.evaluation_id,e.execution_id,e.task_id,e.evaluator.kind,e.evaluator.name,e.passed===null?null:e.passed?1:0,e.score,e.failure_cause,e.independent?1:0,e.created_at,JSON.stringify(e));
}
export function executionDoc(db:DB,id:string){
 const r=db.prepare('SELECT * FROM executions WHERE execution_id=?').get(id) as Record<string,unknown>|undefined;if(!r)fail(`実行がない: ${id}`);
 const doc={schema_version:'1',task_id:r.task_id,parent_task_id:r.parent_task_id??null,execution_id:r.execution_id,parent_execution_id:r.parent_execution_id??null,decision_id:r.decision_id??null,initiator:r.initiator,agent_name:r.agent_name??null,
  provider:r.provider??null,model_id:r.model_id??null,reasoning_level:r.reasoning_level??null,task_type:r.task_type,difficulty:r.difficulty??null,routing_reason:r.routing_reason??null,status:r.status,managed:r.managed===1,route:r.route??null,auth_mode:r.auth_mode,
  start_time:r.start_time??null,end_time:r.end_time??null,duration_ms:r.duration_ms??null,retry_count:r.retry_count,escalation_count:r.escalation_count,artifacts:JSON.parse(String(r.artifacts_json)),test_results:JSON.parse(String(r.test_results_json)),
  metering_status:r.metering_status,session_ref:{product:r.session_product??null,session_id:r.session_id??null,agent_id:r.agent_id??null},error:r.error_cause||r.error_message?{cause:r.error_cause??null,message:String(r.error_message??'')}:null};
 return validate('execution',doc);
}
// 人の承認後に、承認された判断（同じ実行ID・モデル）のまま計画済みの実行を再開する。
// 有料経路の再試行・上位切替えは新しい承認が要るため、ここでは自動で行わない。
export async function resume(executionId:string,opts:RunOptions={}):Promise<RunReport>{
 const env=opts.env??process.env,db=opts.db??openDb();
 const row=db.prepare('SELECT e.status,t.json AS task,d.json AS decision FROM executions e JOIN tasks t ON t.task_id=e.task_id JOIN decisions d ON d.decision_id=e.decision_id WHERE e.execution_id=?').get(executionId) as {status:string;task:string;decision:string}|undefined;
 if(!row)fail(`実行がない: ${executionId}`);
 if(row.status!=='planned')fail(`再開できる状態ではない: ${row.status}`);
 const task=JSON.parse(row.task) as Task&{task_id:string},decision=JSON.parse(row.decision) as Decision,{policy}=loadPolicy();
 if(env.AGENTCTL_TELEMETRY==='off')fail('Token Monitorが無効のため実行しない');
 if(!hasHumanApproval(db,decision.decision_id))fail(`人の承認がない、または期限切れ: ${decision.decision_id}`);
 const routeEnv:Env={authenticated:opts.authOverride??authStatus(env),allowMock:env.AGENTCTL_ALLOW_MOCK==='1'};
 validateDecision(decision,routeEnv);
 const prompt=task.input.prompt_file?readFileSync(resolve(ROOT,task.input.prompt_file),'utf8'):null;
 const workdir=task.input.workdir?(isAbsolute(task.input.workdir)?task.input.workdir:resolve(ROOT,task.input.workdir)):ROOT;
 const r=await execute(db,task,executionId,decision,{env,adapters:{...DEFAULT_ADAPTERS,...opts.adapters},prompt,workdir,parentExecution:env.AGENTCTL_EXECUTION_ID??null,depth:Number(env.AGENTCTL_DEPTH??'0'),policy});
 return {task_id:task.task_id,status:r.final,executions:[summary(db,executionId)],message:r.message??(r.final==='completed'?'完了':r.final),review:null};
}
export {ApprovalError,type ExecRow,type AuthMode};
