// 3製品共通のHook処理。使い方: node orchestration/hooks/hook.ts <claude|codex|antigravity> <Event>
// 軽量化: LLMは呼ばない（再帰しない）。プロンプト本文は保存せず、ハッシュと長さだけを残す。
// 失敗時: AI起動やサブエージェント起動に関わる判定はFail Closed（拒否）、それ以外は通常処理を妨げない。
import {appendFileSync,existsSync,mkdirSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPolicy,loadRegistry,newId,now,paths,sha256,tierIndex,ROOT,type Policy,type Product,type Provider,type Tier} from '../gateway/config.ts';
import {mint} from '../gateway/approval.ts';
import {logEvent,openDb,type DB} from '../telemetry/db.ts';
import {claudeTranscriptUsage,codexRolloutUsage,readJsonlFrom,recordUnavailable,recordUsage,refreshMetering} from '../telemetry/monitor.ts';
import {agyLastUserInput,agyTranscriptPath,agyTranscriptUsage,fromAnthropic} from '../telemetry/normalize.ts';
import {classifyPrompt,nextTier,route,type Decision,type Env,type Task} from '../router/router.ts';
import {classifyCommand,isProtectedFile,patchPaths} from './detect.ts';
import {normalizeModel,verifyChild} from './child.ts';

export type HookOut={stdout:string;exitCode:number};
type N={product:Product;event:string;raw:Record<string,unknown>;session_id:string|null;model:string|null;transcript_path:string|null;tool_name:string|null;tool_input:Record<string,unknown>;tool_use_id:string|null;tool_response:unknown;agent_id:string|null;agent_type:string|null;agent_transcript_path:string|null;prompt:string|null;parent_session_id:string|null};
const str=(v:unknown)=>typeof v==='string'&&v?v:null;
export function normalizeInput(product:Product,eventArg:string,raw:Record<string,unknown>):N{
 if(product==='antigravity'){const tc=(raw.toolCall??{}) as Record<string,unknown>;
  return {product,event:eventArg,raw,session_id:str(raw.conversationId),model:str(raw.modelName),transcript_path:str(raw.transcriptPath),tool_name:str(tc.name),tool_input:(tc.args??{}) as Record<string,unknown>,tool_use_id:raw.stepIdx!==undefined?String(raw.stepIdx):null,tool_response:raw.result??raw.error??null,agent_id:str(raw.executionId),agent_type:str(raw.agentName),agent_transcript_path:null,prompt:str(raw.lastUserInput),parent_session_id:str(raw.parentConversationId)}}
 return {product,event:str(raw.hook_event_name)??eventArg,raw,session_id:str(raw.session_id),model:str(raw.model),transcript_path:str(raw.transcript_path),tool_name:str(raw.tool_name),tool_input:(raw.tool_input??{}) as Record<string,unknown>,tool_use_id:str(raw.tool_use_id),tool_response:raw.tool_response??null,agent_id:str(raw.agent_id),agent_type:str(raw.agent_type),agent_transcript_path:str(raw.agent_transcript_path),prompt:str(raw.prompt),parent_session_id:null};
}
const SHELL:Record<Product,RegExp>={claude:/^Bash$/,codex:/^(Bash|exec_command|shell|local_shell|unified_exec)$/,antigravity:/^run_command$/};
const EDIT:Record<Product,RegExp>={claude:/^(Edit|Write|MultiEdit|NotebookEdit)$/,codex:/^(apply_patch|Edit|Write)$/,antigravity:/^(write_to_file|replace_file_content|multi_replace_file_content)$/};
const READ:Record<Product,RegExp>={claude:/^Read$/,codex:/^$/,antigravity:/^view_file$/};
const KEY_FILE=/(\/\.config\/agentctl\/|approval\.key$)/;
// Codexの協調ツールは名前空間つきで、Hookには区切りなしの collaborationspawn_agent として届く（2026-10-11の実機で確認）。末尾一致で判定する。
const SPAWN:Record<Product,RegExp>={claude:/^(Agent|Task)$/,codex:/spawn_agent$|^Agent$/,antigravity:/^(invoke_subagent|define_subagent)$/};
const commandOf=(n:N)=>{const i=n.tool_input;const c=i.command??i.cmd??i.CommandLine??i.commandLine;return Array.isArray(c)?c.join(' '):String(c??'')};
const filesOf=(n:N):string[]=>{const i=n.tool_input;const direct=[i.file_path,i.path,i.notebook_path,i.TargetFile,i.targetFile,i.AbsolutePath].filter((x):x is string=>typeof x==='string');const patch=typeof i.input==='string'?patchPaths(i.input):typeof i.patch==='string'?patchPaths(i.patch):[];return [...direct,...patch]};

// 出力（製品ごとの形式）。
function out(product:Product,v:Record<string,unknown>|null):HookOut{return {stdout:v?JSON.stringify(v):'',exitCode:0}}
// Antigravityの PreToolUse は decision が必須で「判断なし」がない。拒否しない操作は allow（常に許可）を返す
// （2026-10-11、利用者の指示で ask から変更。AI CLIの直接起動・保護対象への操作は引き続き deny）。
const pass=(n:N)=>n.product==='antigravity'?out(n.product,n.event==='PreToolUse'?{decision:'allow'}:n.event==='Stop'?{decision:'stop'}:{}):out(n.product,null);
const deny=(n:N,reason:string)=>n.product==='antigravity'?out(n.product,{decision:'deny',reason:`[agentctl] ${reason}`}):out(n.product,{hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',permissionDecisionReason:`[agentctl] ${reason}`}});
const rewrite=(n:N,input:Record<string,unknown>,reason:string)=>n.product==='antigravity'?out(n.product,{decision:'allow',overwrite:input,reason:`[agentctl] ${reason}`}):out(n.product,{hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'allow',permissionDecisionReason:`[agentctl] ${reason}`,updatedInput:input}});
const context=(n:N,text:string)=>n.product==='antigravity'?out(n.product,{injectSteps:[{ephemeralMessage:text}]}):out(n.product,{hookSpecificOutput:{hookEventName:n.event,additionalContext:text}});
const blockPrompt=(n:N,reason:string)=>n.product==='antigravity'?out(n.product,{terminationBehavior:'terminate'}):out(n.product,{decision:'block',reason:`[agentctl] ${reason}`});

type Session={product:string;session_id:string;model_id:string|null;managed_execution_id:string|null;current_task_id:string|null;current_execution_id:string|null;transcript_path:string|null;transcript_offset:number};
function session(db:DB,n:N):Session|null{if(!n.session_id)return null;return (db.prepare('SELECT * FROM sessions WHERE product=? AND session_id=?').get(n.product,n.session_id) as Session|undefined)??null}
// 入れ子の未承認実行: 親のエージェントセッションから起動されたのに、Gatewayの承認がない。
function nestedMarker(n:N,env:NodeJS.ProcessEnv):string|null{
 if(env.AGENTCTL_APPROVAL)return null;
 const own=`${n.product}:${n.session_id}`;
 if(env.AGENTCTL_PARENT_SESSION&&env.AGENTCTL_PARENT_SESSION!==own)return env.AGENTCTL_PARENT_SESSION;
 // 各製品がシェル実行に付ける環境変数（Codex: CODEX_THREAD_ID、Antigravity: ANTIGRAVITY_CONVERSATION_ID、Claude Code: CLAUDE_CODE_SESSION_ID）。
 // 付与されるかは製品の版に依存し、実機で未確認のものがある（docs/agent-routing/verification-report.md）。
 // Antigravity自身の会話（サブエージェントを含む）はこの値で判定しない。Antigravity内からのCLI直接起動はrun_commandの判定で拒否する（2026-10-12）。
 if(n.product!=='antigravity'&&env.ANTIGRAVITY_CONVERSATION_ID)return `antigravity:${env.ANTIGRAVITY_CONVERSATION_ID}`;
 if(n.product!=='codex'&&env.CODEX_THREAD_ID)return `codex:${env.CODEX_THREAD_ID}`;
 if(env.CLAUDE_CODE_SESSION_ID&&!(n.product==='claude'&&env.CLAUDE_CODE_SESSION_ID===n.session_id)&&n.product!=='claude')return `claude:${env.CLAUDE_CODE_SESSION_ID}`;
 return null;
}
function registerSession(db:DB,n:N,env:NodeJS.ProcessEnv):Session|null{
 if(!n.session_id)return null;
 const existing=session(db,n);
 if(existing){db.prepare('UPDATE sessions SET last_seen_at=?,model_id=COALESCE(?,model_id),transcript_path=COALESCE(?,transcript_path) WHERE product=? AND session_id=?').run(now(),normalizeModel(n.product,n.model),n.transcript_path,n.product,n.session_id);return session(db,n)}
 const check=verifyChild(db,env,{provider:n.product,model:n.model});
 let managed:string|null=null;
 if(check.managed){
  managed=check.ok?check.execution_id:`REJECTED:${check.reason}`;
  logEvent(db,check.ok?'child_session_verified':'child_session_rejected',{reason:check.reason,model:n.model},{product:n.product,session_id:n.session_id,execution_id:check.execution_id});
  if(check.execution_id){
   db.prepare('UPDATE executions SET session_product=?,session_id=?,updated_at=? WHERE execution_id=? AND session_id IS NULL').run(n.product,n.session_id,now(),check.execution_id);
   if(!check.ok)db.prepare("UPDATE executions SET status='failed',error_cause='model_mismatch',error_message=?,updated_at=? WHERE execution_id=?").run(check.reason,now(),check.execution_id);
  }
 }else{
  const parent=nestedMarker(n,env);
  if(parent){managed=`REJECTED:未承認の入れ子実行（親 ${parent}）。agentctl run を使う`;logEvent(db,'nested_unmanaged_session',{parent},{product:n.product,session_id:n.session_id})}
 }
 const envConv=env.ANTIGRAVITY_CONVERSATION_ID??null;
 if(n.product==='antigravity')logEvent(db,'agy_payload_keys',{event:n.event,keys:Object.keys(n.raw).sort(),env_markers:Object.keys(env).filter(k=>/^(ANTIGRAVITY_|AGENTCTL_)/.test(k)).sort(),env_conversation_is_self:envConv===null?null:envConv===n.session_id},{product:n.product,session_id:n.session_id});
 // 対話中のAntigravityのサブエージェント: 環境変数の会話IDが親の会話で、親に未着手の子があれば、その子として結び付ける。
 let childExe:string|null=null;
 if(n.product==='antigravity'&&!managed&&envConv&&envConv!==n.session_id){
  const c=db.prepare("SELECT execution_id,task_id FROM executions WHERE session_product='antigravity' AND session_id=? AND route='native_subagent' AND status='approved' AND agent_id IS NULL ORDER BY updated_at LIMIT 1").get(envConv) as {execution_id:string;task_id:string}|undefined;
  if(c){childExe=c.execution_id;db.prepare("UPDATE executions SET agent_id=?,status='running',start_time=?,updated_at=? WHERE execution_id=?").run(n.session_id,now(),now(),c.execution_id);logEvent(db,'agy_child_session_bound',{parent:envConv},{product:n.product,session_id:n.session_id,execution_id:c.execution_id})}
 }
 db.prepare('INSERT INTO sessions(product,session_id,model_id,managed_execution_id,current_task_id,current_execution_id,transcript_path,transcript_offset,started_at,last_seen_at) VALUES(?,?,?,?,?,?,?,0,?,?) ON CONFLICT(product,session_id) DO NOTHING')
  .run(n.product,n.session_id,normalizeModel(n.product,n.model),managed,null,childExe,n.transcript_path,now(),now());
 return session(db,n);
}
const rejected=(s:Session|null)=>!!s?.managed_execution_id?.startsWith('REJECTED:');
const managedExe=(s:Session|null)=>s?.managed_execution_id&&!rejected(s)?s.managed_execution_id:null;
function sessionAuth(n:N):Env['authenticated']{
 // Hookでは外部コマンドを起動しない。実行中の製品と、登録簿で確認済みの購読経路だけを認証済みとみなす（推奨の算出用）。
 const a:Env['authenticated']={[n.product]:['subscription']};
 for(const [p,v] of Object.entries(loadRegistry().providers))if(v.auth_modes.subscription?.verified)a[p as Provider]=['subscription'];
 return a;
}
function baseTask(policy:Policy,over:Partial<Task>&{task_id:string;title:string}):Task&{task_id:string}{
 return {schema_version:'1',parent_task_id:null,task_type:'general',difficulty:null,quality_requirement:'normal',initiator:'unknown',agent_name:null,required_capabilities:[],preferred_provider:null,
  budget:{max_usd:null,max_total_tokens:null,max_retries:policy.limits.max_retries,max_escalations:policy.limits.max_escalations},input:{prompt_file:null,program:null,workdir:null,permission_profile:'workspace_write'},expected_artifacts:[],test_command:null,audit:false,...over};
}
function saveTask(db:DB,t:Task&{task_id:string},origin:string,prompt:string|null){
 db.prepare('INSERT INTO tasks(task_id,parent_task_id,title,task_type,difficulty,quality_requirement,initiator,agent_name,audit,origin,prompt_sha256,prompt_chars,created_at,json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(task_id) DO NOTHING')
  .run(t.task_id,t.parent_task_id,t.title,t.task_type,t.difficulty,t.quality_requirement,t.initiator,t.agent_name,t.audit?1:0,origin,prompt?sha256(prompt):null,prompt?.length??null,now(),JSON.stringify(t));
}
function saveDecisionAndExecution(db:DB,d:Decision,t:Task&{task_id:string},e:{execution_id:string;parent_execution_id:string|null;provider:Provider;model_id:string|null;route:string;managed:boolean;status:string;session:N;agent_name:string|null;tool_use_id?:string|null;escalation_count?:number}){
 db.prepare(`INSERT INTO decisions(decision_id,task_id,execution_id,provider,model_id,reasoning_level,tier,route,auth_mode,difficulty,difficulty_source,task_type,routing_reason,used_llm,policy_version,escalation_from,escalation_cause,requires_human_approval,created_at,json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,0,?,?)`)
  .run(d.decision_id,d.task_id,d.execution_id,d.selected?.provider??null,d.selected?.model_id??null,d.selected?.reasoning_level??null,d.selected?.tier??null,d.selected?.route??null,d.selected?.auth_mode??null,d.difficulty,d.difficulty_source,d.task_type,d.routing_reason,d.policy_version,d.escalation.from_decision_id,d.escalation.cause,d.created_at,JSON.stringify(d));
 db.prepare(`INSERT INTO executions(execution_id,task_id,parent_task_id,parent_execution_id,decision_id,initiator,agent_name,provider,model_id,reasoning_level,task_type,difficulty,routing_reason,status,managed,route,auth_mode,start_time,metering_status,session_product,session_id,tool_use_id,escalation_count,updated_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'subscription',?,'missing',?,?,?,?,?)`).run(e.execution_id,t.task_id,t.parent_task_id,e.parent_execution_id,d.decision_id,t.initiator,e.agent_name,e.provider,e.model_id,d.selected?.reasoning_level??null,t.task_type,d.difficulty,d.routing_reason,e.status,e.managed?1:0,e.route,e.status==='running'?now():null,e.session.product,e.session.session_id,e.tool_use_id??null,e.escalation_count??0,now());
}
function finishExecution(db:DB,id:string|null,status:'completed'|'failed'){
 if(!id)return;
 db.prepare("UPDATE executions SET status=CASE WHEN status IN ('running','approved') THEN ? ELSE status END,end_time=COALESCE(end_time,?),duration_ms=COALESCE(duration_ms,CAST((julianday(?)-julianday(start_time))*86400000 AS INTEGER)),updated_at=? WHERE execution_id=?").run(status,now(),now(),now(),id);
 refreshMetering(db,id);
}

// ---- イベントごとの処理 ----
function onSessionStart(db:DB,n:N,env:NodeJS.ProcessEnv):HookOut{
 const s=registerSession(db,n,env);
 if(n.product==='claude'&&env.CLAUDE_ENV_FILE&&n.session_id&&!managedExe(s))try{appendFileSync(env.CLAUDE_ENV_FILE,`export AGENTCTL_PARENT_SESSION=claude:${n.session_id}\n`)}catch{/* 書けなくても続行 */}
 if(rejected(s))return context(n,`[agentctl] このセッションは拒否されています: ${s!.managed_execution_id!.slice(9)}`);
 if(managedExe(s))return pass(n);
 return context(n,'[agentctl] AI CLI（claude/codex/agy/gemini）の直接起動は禁止。別モデルへの委譲は scripts/agentctl run --task <task.json>。サブエージェントのモデルはModel Routerが決める。');
}
function onPrompt(db:DB,n:N,env:NodeJS.ProcessEnv):HookOut{
 const s=registerSession(db,n,env);
 if(rejected(s))return blockPrompt(n,s!.managed_execution_id!.slice(9));
 if(!s||managedExe(s))return pass(n);
 const {policy,sha256:psha}=loadPolicy(),registry=loadRegistry();
 finishExecution(db,s.current_execution_id,'completed');
 const prompt=n.prompt??'';const c=classifyPrompt(prompt,policy);
 const t=baseTask(policy,{task_id:newId('tsk'),title:`${n.product}対話: ${c.task_type}`,task_type:c.task_type,difficulty:c.difficulty,initiator:n.product,agent_name:'main'});
 saveTask(db,t,'hook-prompt',prompt);
 const exe=newId('exe');
 const d=route({task:t,execution_id:exe,policy,policy_sha256:psha,registry,env:{authenticated:sessionAuth(n),allowMock:false,route:'interactive'}});
 d.rule_ids.push(...c.rules);
 const actual=normalizeModel(n.product,n.model??s.model_id);
 saveDecisionAndExecution(db,d,t,{execution_id:exe,parent_execution_id:null,provider:n.product,model_id:actual,route:'interactive',managed:false,status:'running',session:n,agent_name:'main'});
 db.prepare('UPDATE sessions SET current_task_id=?,current_execution_id=?,last_seen_at=? WHERE product=? AND session_id=?').run(t.task_id,exe,now(),n.product,n.session_id);
 const actTier=registry.models.find(m=>m.provider===n.product&&m.model_id===actual)?.tier;
 const sel=d.selected;let hint='';
 if(sel&&actTier&&tierIndex(sel.tier)<tierIndex(actTier))hint=' 軽い作業はサブエージェント（Routerが選ぶモデル）か agentctl run へ委譲できる。';
 if(sel&&actTier&&tierIndex(sel.tier)>tierIndex(actTier))hint=' 難度が高い。agentctl run で推奨モデルへ委譲を検討。';
 return context(n,`[agentctl] ${t.task_id} ${d.difficulty}/${d.task_type} 推奨 ${sel?`${sel.provider}:${sel.model_id}`:'なし'}（現在 ${actual??'不明'}）。${hint}`.trim());
}
function definitionModel(product:Product,agentType:string):string|null{
 try{
  if(product==='claude'){const f=join(ROOT,'.claude','agents',`${agentType}.md`);if(existsSync(f)){const m=/^model:\s*["']?([^"'\n]+)["']?$/m.exec(readFileSync(f,'utf8').split('---')[1]??'');return m?.[1]?.trim()??null}}
  if(product==='codex'){const f=join(ROOT,'.codex','agents',`${agentType}.toml`);if(existsSync(f)){const m=/^model\s*=\s*"([^"]+)"/m.exec(readFileSync(f,'utf8'));return m?.[1]??null}}
  if(product==='antigravity'){for(const f of [join(ROOT,'.agents','agents',agentType,'agent.md'),join(ROOT,'.agents','agents',`${agentType}.md`)])if(existsSync(f)){const m=/^model:\s*["']?([^"'\n]+)["']?$/m.exec(readFileSync(f,'utf8').split('---')[1]??'');return m?.[1]?.trim()??null}}
 }catch{/* 不明 */}
 return null;
}
function onSpawn(db:DB,n:N,s:Session|null):HookOut{
 const {policy,sha256:psha}=loadPolicy(),registry=loadRegistry();
 const i=n.tool_input,provider=n.product as Provider;
 const agentType=String((n.product==='claude'?i.subagent_type:n.product==='codex'?i.agent_type:(i.agentName??i.name??i.subagent))??'default');
 const cap=registry.providers[provider]?.native_subagents;
 // 起動引数の項目名だけを記録する（値は記録しない）。製品の引数にモデル指定があるかの確認用。
 const nested=Array.isArray(i.Subagents)&&i.Subagents[0]&&typeof i.Subagents[0]==='object'?Object.keys(i.Subagents[0] as object).sort():null;
 logEvent(db,'spawn_args',{tool:n.tool_name,keys:Object.keys(i).sort(),...(nested?{subagent_keys:nested,subagents:(i.Subagents as unknown[]).length}:{})},{product:n.product,session_id:n.session_id});
 const requestedRaw=str(i[cap?.model_param??'model']);
 const requested=requestedRaw?normalizeModel(provider,requestedRaw):null;
 const parentExe=managedExe(s)??s?.current_execution_id??null;
 const prof=policy.agents[agentType]??policy.agents.default!;
 // 同じセッション・同じ種類の子が直前に失敗していれば、上限内で1段上の枠を許す。
 const failed=db.prepare("SELECT d.tier,e.escalation_count FROM executions e JOIN decisions d ON d.decision_id=e.decision_id WHERE e.session_product=? AND e.session_id=? AND e.agent_name=? AND e.status='failed' AND e.route='native_subagent' ORDER BY e.updated_at DESC LIMIT 1").get(n.product,n.session_id,agentType) as {tier:Tier;escalation_count:number}|undefined;
 const escalate=failed&&failed.escalation_count<policy.limits.max_escalations&&failed.tier!=='high'?nextTier(failed.tier):undefined;
 const t=baseTask(policy,{task_id:newId('tsk'),parent_task_id:s?.current_task_id??(process.env.AGENTCTL_TASK_ID||null),title:`subagent:${agentType}`,task_type:prof.task_type,difficulty:prof.difficulty,initiator:n.product,agent_name:agentType});
 const exe=newId('exe');
 const d=route({task:t,execution_id:exe,policy,policy_sha256:psha,registry,env:{authenticated:{[provider]:['subscription']},allowMock:false,route:'native_subagent',restrictProvider:provider},minTier:escalate});
 if(escalate)d.escalation={from_decision_id:null,attempt:1,cause:'capability'};
 const sel=d.selected;
 if(!sel?.model_id){logEvent(db,'subagent_denied',{agentType,reason:d.routing_reason},{product:n.product,session_id:n.session_id});return deny(n,`サブエージェントに使えるモデルがない: ${d.routing_reason}`)}
 const record=(status:string)=>{saveTask(db,t,'hook-subagent',null);saveDecisionAndExecution(db,d,t,{execution_id:exe,parent_execution_id:parentExe,provider,model_id:sel.model_id,route:'native_subagent',managed:true,status,session:n,agent_name:agentType,tool_use_id:n.tool_use_id,escalation_count:escalate?1:0});
  mint(db,{execution_id:exe,decision_id:d.decision_id,task_id:t.task_id,provider,model_id:sel.model_id,reasoning_level:sel.reasoning_level,initiator:n.product,issuer:'hook'},policy.limits.approval_ttl_seconds);};
 const alias=registry.models.find(m=>m.provider===provider&&m.model_id===sel.model_id)?.aliases.claude_code_agent_tool;
 // モデルを指定できない製品: 子は親（または定義）のモデルで動く。推奨と同じなら許可し、違えば拒否して agentctl run へ案内する。
 if(!cap||cap.model_override==='unsupported'||!cap.model_param){
  const def=definitionModel(n.product,agentType),explicit=def&&def!=='inherit';
  const effective=explicit?(registry.models.some(m=>m.provider===provider&&m.model_id===normalizeModel(provider,def))?normalizeModel(provider,def):null):normalizeModel(provider,s?.model_id??n.model);
  if(effective&&effective===sel.model_id){record('approved');logEvent(db,'subagent_parent_model_allowed',{agentType,model:effective},{product:n.product,session_id:n.session_id,execution_id:exe});return pass(n)}
  logEvent(db,'subagent_denied_unenforceable',{agentType,effective,selected:sel.model_id},{product:n.product,session_id:n.session_id});
  return deny(n,`この製品のサブエージェントはモデルを指定できず、${explicit?`定義のモデル ${def}`:`親のモデル ${effective??'不明'}`} で動く。Model Routerの推奨は ${sel.model_id}（${d.difficulty}/${d.task_type}）。別モデルや計測が必要な子作業は scripts/agentctl run --task <task.json>（task_type: ${t.task_type}、difficulty: ${d.difficulty}）で起動する。`);
 }
 if(requested){
  if(requested===sel.model_id){record('approved');return pass(n)}
  logEvent(db,'subagent_model_denied',{agentType,requested,selected:sel.model_id},{product:n.product,session_id:n.session_id});
  return deny(n,`Model Routerの選択は ${sel.model_id}${alias?`（model: "${alias}"）`:''}。理由: ${d.routing_reason}。そのモデルで再実行するか、上位が必要なら agentctl run を使う。`);
 }
 if(policy.native_subagents.missing_model==='inject'){
  record('approved');
  // Codexの新しいspawn_agentの引数は task_name・agent_type・fork_turns・message・model。未知の引数で失敗しないよう、能力に記録したモデルの引数だけを入れる。
  const updated={...i,[cap.model_param]:n.product==='claude'?alias??sel.model_id:sel.model_id};
  return rewrite(n,updated,`Model Routerが ${sel.model_id} を指定（${d.difficulty}/${d.task_type}）`);
 }
 record('approved');logEvent(db,'subagent_model_unenforced',{agentType,selected:sel.model_id,definition:definitionModel(n.product,agentType)},{product:n.product,session_id:n.session_id,execution_id:exe});
 return pass(n);
}
function onPreTool(db:DB,n:N,env:NodeJS.ProcessEnv):HookOut{
 const tool=n.tool_name??'';
 const s=registerSession(db,n,env);
 // サブエージェント内のツール呼出し: そのサブエージェントの実行が拒否済みなら止める。
 if(n.agent_id){const c=db.prepare("SELECT status,error_cause FROM executions WHERE session_id=? AND agent_id=?").get(n.session_id,n.agent_id) as {status:string;error_cause:string|null}|undefined;if(c?.error_cause==='model_mismatch')return deny(n,'このサブエージェントは承認と異なるモデルで動いている')}
 if(rejected(s))return deny(n,s!.managed_execution_id!.slice(9));
 if(SHELL[n.product].test(tool)){
  const v=classifyCommand(commandOf(n));
  if(v.kind==='ok')return pass(n);
  if(v.kind==='managed'){logEvent(db,'managed_call',{},{product:n.product,session_id:n.session_id});return pass(n)}
  // 改善案の確認・適用・復元はCodexのPMにも許す（agentctl側でもCodexのセッションとreviewer名を確認する）。approveは人だけ。
  if(v.kind==='human_only'&&n.product==='codex'&&/\boptimize\s+(review|apply|rollback)\b/.test(commandOf(n))){logEvent(db,'pm_command_allowed',{},{product:n.product,session_id:n.session_id});return pass(n)}
  logEvent(db,`deny_${v.kind}`,{reason:v.reason,program:v.program??null,command_sha256:sha256(commandOf(n))},{product:n.product,session_id:n.session_id});
  return deny(n,v.reason);
 }
 if(EDIT[n.product].test(tool)||READ[n.product].test(tool)){
  const edit=EDIT[n.product].test(tool);
  const hit=filesOf(n).map(f=>{const abs=f.startsWith('/')?f:resolve(ROOT,f);return {f,key:KEY_FILE.test(abs),...isProtectedFile(abs)}}).find(x=>edit?x.protected:x.key);
  if(!hit)return pass(n);
  if(env.AGENTCTL_MAINTENANCE==='1'&&!hit.key&&!/telemetry\.db/.test(hit.f)){logEvent(db,'maintenance_edit',{file:hit.f},{product:n.product,session_id:n.session_id});return pass(n)}
  logEvent(db,'deny_protected_file',{file:hit.f,tool},{product:n.product,session_id:n.session_id});
  return deny(n,`${hit.f}: ${hit.reason}`);
 }
 if(SPAWN[n.product].test(tool))return onSpawn(db,n,s);
 // 製品がサブエージェント系のツールをどの名前で渡すかの確認用（名前だけを記録）。
 if(/agent|spawn|collab/i.test(tool))logEvent(db,'agent_tool_seen',{tool},{product:n.product,session_id:n.session_id});
 return pass(n);
}
function onPostTool(db:DB,n:N):HookOut{
 if(!SPAWN[n.product].test(n.tool_name??'')||!n.tool_use_id)return pass(n);
 const row=db.prepare('SELECT execution_id FROM executions WHERE session_product=? AND session_id=? AND tool_use_id=?').get(n.product,n.session_id,n.tool_use_id) as {execution_id:string}|undefined;
 if(!row)return pass(n);
 const resp=n.tool_response as Record<string,unknown>|string|null;
 const isErr=typeof resp==='string'?/^error|failed/i.test(resp):!!resp&&(resp.is_error===true||resp.status==='error'||!!resp.error);
 // Codexのspawn_agentは非同期で、完了はSubagentStopで記録する。
 if(n.product==='codex')return pass(n);
 // 子単独の使用量を出さない製品は、取得不能を明示する（推測で補完しない）。
 const cap=loadRegistry().providers[n.product]?.native_subagents;
 const already=(db.prepare('SELECT COUNT(*) AS c FROM usage WHERE execution_id=?').get(row.execution_id) as {c:number}).c;
 if(cap?.child_usage==='unavailable'&&!already)recordUnavailable(db,row.execution_id,n.product as Provider,null,`${n.product}のサブエージェントは子単独の使用量を出さない（models.json native_subagents.child_usage）`,'subscription');
 else if(cap?.child_usage==='included_in_parent')db.prepare("UPDATE executions SET metering_status='included_in_parent' WHERE execution_id=?").run(row.execution_id);
 const s=session(db,n);
 const counted=(db.prepare('SELECT COUNT(*) AS c FROM usage WHERE execution_id=?').get(row.execution_id) as {c:number}).c;
 const u=resp&&typeof resp==='object'?(resp.usage as Record<string,unknown>|undefined):undefined;
 if(!counted&&u&&n.product==='claude'&&!managedExe(s))recordUsage(db,row.execution_id,{provider:'claude',model_id:null,...fromAnthropic(u),source:{kind:'hook_payload',dedupe_key:`claude:agent:${n.session_id}:${n.tool_use_id}`,session_id:n.session_id,cumulative:false},provider_reported_usd:null},'subscription');
 finishExecution(db,row.execution_id,isErr?'failed':'completed');
 return pass(n);
}
function onSubagentStart(db:DB,n:N):HookOut{
 const row=db.prepare("SELECT execution_id,model_id FROM executions WHERE session_product=? AND session_id=? AND agent_name=? AND status='approved' AND agent_id IS NULL ORDER BY updated_at LIMIT 1").get(n.product,n.session_id,n.agent_type??'default') as {execution_id:string;model_id:string|null}|undefined;
 if(!row){
  // PreToolUseを通らずに起動した子（製品内部の子エージェントなど）。管理外として記録する。
  const {policy}=loadPolicy();const s=session(db,n);
  const t=baseTask(policy,{task_id:newId('tsk'),parent_task_id:s?.current_task_id??null,title:`subagent:${n.agent_type}`,initiator:n.product,agent_name:n.agent_type});saveTask(db,t,'hook-subagent-unmanaged',null);
  db.prepare(`INSERT INTO executions(execution_id,task_id,parent_task_id,parent_execution_id,initiator,agent_name,provider,model_id,task_type,status,managed,route,auth_mode,start_time,metering_status,session_product,session_id,agent_id,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'running',0,'native_subagent','subscription',?,'missing',?,?,?,?)`)
   .run(newId('exe'),t.task_id,t.parent_task_id,managedExe(s)??s?.current_execution_id??null,n.product,n.agent_type,n.product,normalizeModel(n.product as Provider,n.model),t.task_type,now(),n.product,n.session_id,n.agent_id,now());
  logEvent(db,'unmanaged_subagent',{agent_type:n.agent_type},{product:n.product,session_id:n.session_id});
  return pass(n);
 }
 db.prepare("UPDATE executions SET agent_id=?,status='running',start_time=?,updated_at=? WHERE execution_id=?").run(n.agent_id,now(),now(),row.execution_id);
 const actual=normalizeModel(n.product as Provider,n.model);
 if(actual&&row.model_id&&actual!==row.model_id){
  const cap=loadRegistry().providers[n.product]?.native_subagents;
  if(cap?.model_override==='enforced'){
   db.prepare("UPDATE executions SET status='failed',error_cause='model_mismatch',error_message=?,updated_at=? WHERE execution_id=?").run(`承認 ${row.model_id} / 実際 ${actual}`,now(),row.execution_id);
   logEvent(db,'model_mismatch',{approved:row.model_id,actual},{product:n.product,session_id:n.session_id,execution_id:row.execution_id});
  }else{
   // 指定が実機で未確認の製品では止めずに事実を記録する（能力の確認材料にする）。
   db.prepare('UPDATE executions SET model_id=?,error_message=?,updated_at=? WHERE execution_id=?').run(actual,`Routerの指定 ${row.model_id} が適用されず ${actual} で起動（model_override=${cap?.model_override??'不明'}）`,now(),row.execution_id);
   logEvent(db,'subagent_model_not_applied',{requested:row.model_id,actual,capability:cap?.model_override??null},{product:n.product,session_id:n.session_id,execution_id:row.execution_id});
  }
 }
 return pass(n);
}
function ingestTranscript(db:DB,n:N,path:string|null,executionId:string,kind:'main'|'agent'){
 if(!path||!existsSync(path))return 0;
 const key=kind==='main'?n.session_id!:`${n.session_id}:${n.agent_id}`;
 const row=db.prepare('SELECT transcript_offset FROM sessions WHERE product=? AND session_id=?').get(`${n.product}:${kind}`,key) as {transcript_offset:number}|undefined;
 const {records,next}=readJsonlFrom(path,row?.transcript_offset??0);
 const usage=n.product==='claude'?claudeTranscriptUsage(records,{sessionId:n.session_id!,skipSidechain:kind==='main'}):n.product==='antigravity'?agyTranscriptUsage(records,n.session_id!,normalizeModel('antigravity',n.model)):codexRolloutUsage(records).usage.filter(u=>kind==='agent'||u.source.session_id===n.session_id);
 for(const u of usage)recordUsage(db,executionId,u,'subscription');
 // セッション開始時のHookを観測できなかった（Hook導入前に始まった等）場合、実モデルを記録から補う。
 const seen=usage.map(u=>u.model_id).filter((m):m is string=>!!m),top=seen.sort((a,b)=>seen.filter(x=>x===b).length-seen.filter(x=>x===a).length)[0];
 if(top){const m=normalizeModel(n.product as Provider,top);db.prepare('UPDATE executions SET model_id=COALESCE(model_id,?) WHERE execution_id=?').run(m,executionId);if(kind==='main')db.prepare('UPDATE sessions SET model_id=COALESCE(model_id,?) WHERE product=? AND session_id=?').run(m,n.product,n.session_id)}
 db.prepare('INSERT INTO sessions(product,session_id,transcript_path,transcript_offset,started_at,last_seen_at) VALUES(?,?,?,?,?,?) ON CONFLICT(product,session_id) DO UPDATE SET transcript_offset=excluded.transcript_offset,last_seen_at=excluded.last_seen_at')
  .run(`${n.product}:${kind}`,key,path,next,now(),now());
 return usage.length;
}
function onSubagentStop(db:DB,n:N):HookOut{
 const row=db.prepare('SELECT execution_id FROM executions WHERE session_product=? AND session_id=? AND agent_id=?').get(n.product,n.session_id,n.agent_id) as {execution_id:string}|undefined;
 if(!row)return pass(n);
 const s=session(db,n);
 // Gatewayが起動したClaudeの子セッションでは、結果JSONのmodelUsageがサブエージェント分を含むため二重計上しない。
 if(n.product==='claude'&&managedExe(s))db.prepare("UPDATE executions SET metering_status='included_in_parent' WHERE execution_id=?").run(row.execution_id);
 else ingestTranscript(db,n,n.agent_transcript_path,row.execution_id,'agent');
 finishExecution(db,row.execution_id,'completed');
 return pass(n);
}
// Antigravityの対話中のサブエージェント: 子の会話の環境変数 ANTIGRAVITY_CONVERSATION_ID は子自身のID（2026-10-12実機）で親を示さず、
// invoke_subagent は非同期で、PostToolUseの時点では子はまだ動いている。そこで親のStopで、親の会話記録の
// 「Created the following subagents」にある子の会話IDを、親の未結び付けの子の実行へ順に結び付け、
// 子の会話が独立の対話タスクとして記録した使用量をその子の実行へ移し、子の会話記録から残りを実測する。何度呼んでも同じ結果になる。
export function agyCreatedChildren(records:Record<string,unknown>[]):string[]{
 const ids:string[]=[];
 for(const r of records){const c=r.content;if(typeof c!=='string'||!c.includes('Created the following subagents'))continue;
  for(const m of c.matchAll(/"conversationId"\s*:\s*"([0-9a-fA-F-]{8,64})"/g))if(!ids.includes(m[1]!))ids.push(m[1]!)}
 return ids;
}
export function linkAgyInteractiveChildren(db:DB,n:Pick<N,'product'|'session_id'|'transcript_path'>){
 const path=n.transcript_path&&existsSync(n.transcript_path)?n.transcript_path:agyTranscriptPath(n.session_id!);
 if(!existsSync(path))return;
 for(const id of agyCreatedChildren(readJsonlFrom(path,0).records)){
  let target=(db.prepare("SELECT execution_id FROM executions WHERE session_product='antigravity' AND session_id=? AND route='native_subagent' AND agent_id=?").get(n.session_id,id) as {execution_id:string}|undefined)?.execution_id;
  if(!target){
   target=(db.prepare("SELECT execution_id FROM executions WHERE session_product='antigravity' AND session_id=? AND route='native_subagent' AND managed=1 AND agent_id IS NULL ORDER BY rowid LIMIT 1").get(n.session_id) as {execution_id:string}|undefined)?.execution_id;
   if(!target){logEvent(db,'agy_child_unmatched',{conversation:id},{product:n.product,session_id:n.session_id});continue}
   db.prepare('UPDATE executions SET agent_id=?,updated_at=? WHERE execution_id=?').run(id,now(),target);
   logEvent(db,'agy_child_session_bound',{parent:n.session_id,via:'parent_transcript'},{product:n.product,session_id:id,execution_id:target});
  }
  // 子の会話が独立の対話タスクとして記録したもの（使用量）をこの子の実行へ移し、二重に数えない。
  const orphans=db.prepare("SELECT execution_id FROM executions WHERE session_product='antigravity' AND session_id=? AND route='interactive' AND managed=0").all(id) as {execution_id:string}[];
  for(const o of orphans){db.prepare('UPDATE usage SET execution_id=? WHERE execution_id=?').run(target,o.execution_id);
   db.prepare("UPDATE executions SET parent_execution_id=?,metering_status='included_in_parent',updated_at=? WHERE execution_id=?").run(target,now(),o.execution_id)}
  const cpath=agyTranscriptPath(id);
  const childModel=(db.prepare("SELECT model_id FROM sessions WHERE product='antigravity' AND session_id=?").get(id) as {model_id:string|null}|undefined)?.model_id??null;
  const usage=existsSync(cpath)?agyTranscriptUsage(readJsonlFrom(cpath,0).records,id,childModel):[];
  for(const u of usage)recordUsage(db,target,u,'subscription');
  const counted=(db.prepare("SELECT COUNT(*) AS c FROM usage WHERE execution_id=? AND dedupe_key<>?").get(target,`unavailable:${target}`) as {c:number}).c;
  if(!counted)continue;
  db.prepare('DELETE FROM usage WHERE execution_id=? AND dedupe_key=?').run(target,`unavailable:${target}`);
  if(childModel)db.prepare('UPDATE executions SET model_id=? WHERE execution_id=?').run(childModel,target);
  db.prepare("UPDATE executions SET metering_status='missing' WHERE execution_id=?").run(target);
  refreshMetering(db,target);
  logEvent(db,'agy_child_usage_linked',{conversation:id,steps:usage.length,moved_from:orphans.length},{product:n.product,session_id:n.session_id,execution_id:target});
 }
}
function onStop(db:DB,n:N,env:NodeJS.ProcessEnv):HookOut{
 const s=registerSession(db,n,env);
 if(!s)return pass(n);
 const target=managedExe(s)??s.current_execution_id;
 if(target){
  // Antigravity 1.3.3 の会話記録にはステップごとの使用量がある（2026-10-12確認）。Gatewayが起動した子は結果JSONで計測するため取り込まない。
  if(n.product==='antigravity'){if(!managedExe(s)){const path=n.transcript_path&&existsSync(n.transcript_path)?n.transcript_path:agyTranscriptPath(n.session_id!);
   if(!ingestTranscript(db,n,path,target,'main')&&!(db.prepare('SELECT COUNT(*) AS c FROM usage WHERE execution_id=?').get(target) as {c:number}).c)recordUnavailable(db,target,'antigravity',s.model_id,'Antigravityの会話記録に使用量が見つからない','subscription')}}
  else if(!(n.product==='claude'&&managedExe(s)))ingestTranscript(db,n,n.transcript_path,target,'main');
  if(!managedExe(s))finishExecution(db,target,'completed');
  if(n.product==='antigravity')db.prepare('DELETE FROM usage WHERE execution_id=? AND dedupe_key=? AND EXISTS (SELECT 1 FROM usage WHERE execution_id=? AND dedupe_key<>?)').run(target,`unavailable:${target}`,target,`unavailable:${target}`);
  if(n.product==='antigravity')refreshMetering(db,target);
  // Antigravityは発言ごとのHookがないため、実行ループの終了（Stop）で区切り、次のPreInvocationで新しいタスクにする。
  if(n.product==='antigravity'&&!managedExe(s))db.prepare('UPDATE sessions SET current_execution_id=NULL,current_task_id=NULL WHERE product=? AND session_id=?').run(n.product,n.session_id);
 }
 // 子の結び付けは親の実行の有無に依らない（親の発言がなくても、Stopのたびに未結び付けの子を処理する）。
 if(n.product==='antigravity'&&!managedExe(s))linkAgyInteractiveChildren(db,n);
 const open=db.prepare("SELECT COUNT(*) AS c FROM executions WHERE session_product=? AND session_id=? AND managed=1 AND status='completed' AND metering_status='missing'").get(n.product,n.session_id) as {c:number};
 if(open.c){logEvent(db,'stop_with_unmetered',{count:open.c},{product:n.product,session_id:n.session_id});if(n.product==='claude')return out('claude',{systemMessage:`[agentctl] 計測のない管理対象実行が ${open.c} 件あります（agentctl status で確認）`})}
 return pass(n);
}
export function handle(product:Product,eventArg:string,stdin:string,env:NodeJS.ProcessEnv=process.env):HookOut{
 let raw:Record<string,unknown>={};
 try{raw=JSON.parse(stdin||'{}')}catch{/* 下で空入力として扱う */}
 const n=normalizeInput(product,eventArg,raw);
 const risky=n.event==='PreToolUse'&&(SPAWN[product].test(n.tool_name??'')||(SHELL[product].test(n.tool_name??'')&&/\b(claude|codex|agy|gemini|ant)\b|anthropic\.com|openai\.com|googleapis\.com|agentctl|telemetry\.db|hooks\.json|settings(\.local)?\.json/.test(commandOf(n))));
 try{
  const db=openDb();
  try{
   switch(n.event){
    case 'SessionStart':return onSessionStart(db,n,env);
    case 'UserPromptSubmit':return onPrompt(db,n,env);
    case 'PreToolUse':return onPreTool(db,n,env);
    case 'PostToolUse':return onPostTool(db,n);
    case 'SubagentStart':return onSubagentStart(db,n);
    case 'SubagentStop':return onSubagentStop(db,n);
    case 'Stop':return onStop(db,n,env);
    case 'PreInvocation':{const s=registerSession(db,n,env);if(rejected(s))return context(n,`[agentctl] このセッションは拒否されています: ${s!.managed_execution_id!.slice(9)}`);
     // 発言の本文はHookに来ないため、会話記録の最後の利用者の発言で分類する（本文は保存しない）。
     if(s&&!managedExe(s)&&!s.current_execution_id){const path=n.transcript_path&&existsSync(n.transcript_path)?n.transcript_path:agyTranscriptPath(n.session_id!);const prompt=n.prompt??(existsSync(path)?agyLastUserInput(readJsonlFrom(path,0).records):null);return onPrompt(db,{...n,prompt,event:'PreInvocation'},env)}
     return pass(n)}
    case 'PostInvocation':{const s=session(db,n);return rejected(s)?blockPrompt(n,s!.managed_execution_id!.slice(9)):pass(n)}
    default:return pass(n);
   }
  }finally{db.close()}
 }catch(e){
  try{mkdirSync(paths().data,{recursive:true});appendFileSync(join(paths().data,'hook-errors.log'),`${now()} ${product} ${n.event} ${String((e as Error).stack??e).slice(0,600)}\n`)}catch{/* 記録できなくても続行 */}
  return risky?deny(n,`Hookの内部エラーのため安全側で拒否（${String((e as Error).message).slice(0,120)}）`):pass(n);
 }
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 const [product,event]=process.argv.slice(2) as [Product,string];
 const chunks:Buffer[]=[];process.stdin.on('data',c=>chunks.push(c));
 process.stdin.on('end',()=>{const r=handle(product,event,Buffer.concat(chunks).toString('utf8'));if(r.stdout)process.stdout.write(r.stdout+'\n');process.exitCode=r.exitCode});
}
