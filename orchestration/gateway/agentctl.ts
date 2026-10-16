// agentctl: 3製品共通のExecution GatewayのCLI（新規実装）。scripts/agentctl から起動する。
import {readFileSync,writeFileSync} from 'node:fs';
import {createInterface} from 'node:readline/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPolicy,paths} from './config.ts';
import {ensureKey,recordHumanApproval} from './approval.ts';
import {detectProduct,executionDoc,prepareTask,recordEvaluation,resume,runTask,authStatus,validateDecision,type RunReport} from './gateway.ts';
import {audit,doctor,recordBaseline} from './doctor.ts';
import {maintenanceApply} from './maintenance.ts';
import {newId,now,loadRegistry} from './config.ts';
import {openDb,type DB} from '../telemetry/db.ts';
import {fromAnthropic,fromAntigravity,fromGemini,fromOpenAI} from '../telemetry/normalize.ts';
import {meteringOf,recordUsage,repriceUsage,summarize,treeUsage} from '../telemetry/monitor.ts';
import {route} from '../router/router.ts';
import {analyze,apply,checkRegression,propose,renderReport,review,rollback} from '../optimizer/optimizer.ts';
import {handle} from '../hooks/hook.ts';

const USAGE=`agentctl <command>
  init                                   承認鍵・DB・Hook基準ハッシュを用意
  plan --task FILE                       ルーティングだけを確認（実行しない）
  run --task FILE | --resume EXECUTION   Model Router→承認→実行→計測→検証
  status [TASK|EXECUTION] [--session ID] [--require-metered]
  usage [--by model|task_type|provider|initiator] [--since ISO]
  events [--kind K] [--session ID] [--limit N]   Hookなどの記録（読取りのみ。秘密値は記録しない設計）
  reprice                                単価の登録後に、API相当額が未計算の使用量を計算し直す
  report [--since ISO] [--out FILE]      モデル別・タスク種別別の効率
  optimize [propose] [--min-samples N]   改善案（設定は変えない）
  optimize due                           実績が一定件数たまったか
  optimize review ID --decision approve|reject --reviewer NAME [--note T]   PM（Codex）または人
  optimize apply ID | rollback [--to VERSION] --reason T | check [--auto-rollback]
  approve DECISION --reason T            従量課金などの人の承認（端末で対話確認）
  evaluate --execution ID --passed true|false [--score 0-1] [--kind human|agent|program|test] [--evaluator NAME] [--cause C] [--note T]
  ingest --execution ID --provider claude|codex|antigravity|gemini-api --file JSON [--key DEDUPE]
  doctor [--audit] [--since ISO]
  maintenance apply PATCH                保護対象の検証済みパッチを、一時コピーで全試験に通してから適用（利用者の包括許可）
  hook <claude|codex|antigravity> <Event>   各製品のHookから呼ばれる`;
type Flags=Map<string,string|true>;
function parse(args:string[]):{pos:string[];flags:Flags}{const pos:string[]=[],flags:Flags=new Map();for(let i=0;i<args.length;i++){const a=args[i]!;if(a.startsWith('--')){const n=args[i+1];if(n!==undefined&&!n.startsWith('--')){flags.set(a,n);i++}else flags.set(a,true)}else pos.push(a)}return {pos,flags}}
const need=(f:Flags,k:string)=>{const v=f.get(k);if(typeof v!=='string')throw new Error(`${k} が必要`);return v};
const print=(v:unknown)=>console.log(JSON.stringify(v,null,2));
// 人の端末か（AIのツール実行はTTYを持たず、製品の環境変数を持つ）。
function isHumanTerminal(){return !!process.stdin.isTTY&&!!process.stdout.isTTY&&!detectProduct(process.env)}
async function confirm(expect:string,label:string){
 const rl=createInterface({input:process.stdin,output:process.stdout});
 const a=await rl.question(`${label}\n確認のため「${expect}」と入力: `);rl.close();
 if(a.trim()!==expect)throw new Error('確認が一致しないため中止');
}
function pmCaller(reviewer:string){
 if(isHumanTerminal())return `human:${reviewer}`;
 if(detectProduct(process.env)==='codex'&&/codex|pm|orchestrator/i.test(reviewer))return `codex-pm:${reviewer}`;
 throw new Error('この操作は人の端末、またはCodexのPM（project-orchestrator）だけが実行できる');
}
const exitFor=(r:RunReport)=>({completed:0,failed:1,rejected:2,awaiting_human_approval:3,unmetered:4}[r.status]);
function statusOf(db:DB,id?:string,sessionId?:string){
 if(!id&&sessionId)return db.prepare('SELECT execution_id,task_id,parent_execution_id,initiator,agent_name,provider,model_id,route,status,metering_status,managed,session_id,agent_id,updated_at FROM executions WHERE session_id=? OR agent_id=? ORDER BY updated_at').all(sessionId,sessionId);
 if(!id)return db.prepare('SELECT execution_id,task_id,parent_execution_id,initiator,agent_name,provider,model_id,route,status,metering_status,managed,updated_at FROM executions ORDER BY updated_at DESC LIMIT 20').all();
 const ids=id.startsWith('tsk_')?(db.prepare('SELECT execution_id FROM executions WHERE task_id=? OR parent_task_id=? ORDER BY updated_at').all(id,id) as {execution_id:string}[]).map(r=>r.execution_id):[id];
 return ids.map(x=>({...(executionDoc(db,x) as Record<string,unknown>),tree:treeUsage(db,x),usage:db.prepare('SELECT provider,model_id,source_kind,input_total,cache_read,cache_write,output_total,reasoning,total,methods_json,billing_mode,api_equivalent_usd FROM usage WHERE execution_id=?').all(x)}));
}
export async function main(argv:string[]):Promise<number>{
 const [cmd,...rest]=argv,{pos,flags}=parse(rest);
 if(cmd==='hook'){const chunks:Buffer[]=[];for await(const c of process.stdin)chunks.push(c as Buffer);const r=handle(pos[0] as never,pos[1]!,Buffer.concat(chunks).toString('utf8'));if(r.stdout)process.stdout.write(r.stdout+'\n');return r.exitCode}
 if(!cmd||cmd==='help'||cmd==='--help'){console.log(USAGE);return 0}
 const db=openDb();
 switch(cmd){
  case 'init':{ensureKey();const h=recordBaseline(db);writeFileSync(join(paths().data,'auth-cache.json'),JSON.stringify({at:now(),auth:authStatus(process.env)},null,2)+'\n');print({key:paths().key,db:paths().db,hook_baseline:h});return 0}
  case 'plan':{const raw=JSON.parse(readFileSync(need(flags,'--task'),'utf8'));const t=prepareTask(raw,process.env);const {policy,sha256}=loadPolicy();
   const env={authenticated:authStatus(process.env),allowMock:process.env.AGENTCTL_ALLOW_MOCK==='1'};const d=route({task:t,execution_id:newId('exe'),policy,policy_sha256:sha256,registry:loadRegistry(),env});
   let valid:string='ok';try{validateDecision(d,env)}catch(e){valid=(e as Error).message}print({decision:d,validation:valid});return valid==='ok'?0:2}
  case 'run':{const r=flags.has('--resume')?await resume(need(flags,'--resume'),{db}):await runTask(JSON.parse(readFileSync(need(flags,'--task'),'utf8')),{db});print(r);return exitFor(r)}
  case 'status':{const s=statusOf(db,pos[0],flags.get('--session') as string|undefined);print(s);
   if(flags.has('--require-metered')&&pos[0]){const bad=(s as {execution_id:string;status:string;metering_status:string}[]).filter(x=>!['rejected','planned','cancelled'].includes(x.status)&&['missing','unavailable'].includes(meteringOf(db,x.execution_id))&&x.metering_status!=='not_applicable'&&x.metering_status!=='included_in_parent');if(bad.length){console.error(`未計測: ${bad.map(b=>b.execution_id).join(', ')}`);return 4}}return 0}
  case 'events':{const w:string[]=[],a:string[]=[];if(flags.has('--kind')){w.push('kind=?');a.push(String(flags.get('--kind')))}if(flags.has('--session')){w.push('session_id=?');a.push(String(flags.get('--session')))}
   const lim=Math.min(Number(flags.get('--limit')??50)||50,500);
   print((db.prepare(`SELECT id,at,kind,product,session_id,execution_id,detail_json FROM events${w.length?' WHERE '+w.join(' AND '):''} ORDER BY id DESC LIMIT ${lim}`).all(...a) as {detail_json:string}[]).map(r=>({...r,detail_json:undefined,detail:JSON.parse(r.detail_json)})));return 0}
  case 'reprice':{print(repriceUsage(db));return 0}
  case 'usage':{print(summarize(db,(flags.get('--by') as never)??'model',flags.get('--since') as string|undefined));return 0}
  case 'report':{const since=flags.get('--since') as string|undefined;const md=['# モデル利用・効率レポート',`- 作成 ${now()}${since?` / 対象 ${since} 以降`:''}`,'- 費用はAPI相当額の推定（購読枠の実請求額ではない）。','','## モデル別','','```json',JSON.stringify(summarize(db,'model',since),null,1),'```','','## タスク種別別','','```json',JSON.stringify(summarize(db,'task_type',since),null,1),'```','',renderReport({proposal_id:'(report)',created_at:now(),base_policy_version:loadPolicy().policy.version,base_policy_sha256:'',status:'no_change',min_samples:loadPolicy().policy.optimizer.min_samples_per_group,changes:[],insufficient:[],notes:['このレポートは集計だけで、改善案は agentctl optimize で作る'],strategies:analyze(db,since)})].join('\n');
   const out=flags.get('--out');if(typeof out==='string'){writeFileSync(out,md);console.log(out)}else console.log(md);return 0}
  case 'optimize':{
   const sub=pos[0]??'propose';
   if(sub==='propose'){const m=flags.get('--min-samples');const p=propose(db,{minSamples:typeof m==='string'?Number(m):undefined,since:flags.get('--since') as string|undefined});print({proposal_id:p.proposal_id,status:p.status,changes:p.changes.map(c=>({...c,evidence:undefined})),insufficient:p.insufficient,notes:p.notes,report:join(paths().proposals,`${p.proposal_id}.md`)});return 0}
   if(sub==='due'){const last=(db.prepare("SELECT MAX(created_at) AS t FROM proposals").get() as {t:string|null}).t;const n=(db.prepare("SELECT COUNT(*) AS n FROM executions e JOIN tasks t ON t.task_id=e.task_id WHERE t.origin='gateway' AND e.status IN ('completed','failed','unmetered') AND (? IS NULL OR e.updated_at>?)").get(last,last) as {n:number}).n;const every=loadPolicy().policy.optimizer.trigger_every_n_executions;print({since_last_proposal:n,threshold:every,due:n>=every});return 0}
   if(sub==='review'){const reviewer=need(flags,'--reviewer');const by=pmCaller(reviewer);const d=need(flags,'--decision');if(!['approve','reject'].includes(d))throw new Error('--decision approve|reject');review(db,pos[1]!,d as 'approve',by,String(flags.get('--note')??''));print({proposal_id:pos[1],decision:d,reviewer:by});return 0}
   if(sub==='apply'){pmCaller(String(flags.get('--by')??'pm'));print(apply(db,pos[1]!));return 0}
   if(sub==='rollback'){const by=pmCaller(String(flags.get('--by')??'pm'));print(rollback(db,{to:flags.get('--to') as string|undefined,by,reason:need(flags,'--reason')}));return 0}
   if(sub==='check'){const auto=flags.has('--auto-rollback');if(auto)pmCaller(String(flags.get('--by')??'pm'));print(checkRegression(db,{auto,by:'optimizer-check'}));return 0}
   throw new Error(USAGE)}
  case 'approve':{
   if(!isHumanTerminal())throw new Error('approve は人が端末で実行する（AIのツール実行・パイプ入力からは不可）');
   const id=pos[0]!;const d=db.prepare('SELECT json FROM decisions WHERE decision_id=?').get(id) as {json:string}|undefined;if(!d)throw new Error(`判断がない: ${id}`);
   const dec=JSON.parse(d.json);await confirm(id.slice(-6),`承認対象: ${dec.selected?.provider}:${dec.selected?.model_id}（${dec.estimate.billing}、見込み $${dec.estimate.api_equivalent_usd??'不明'}）理由: ${dec.human_approval_reason}`);
   recordHumanApproval(db,id,process.env.USER??'human',need(flags,'--reason'));print({approved:id});return 0}
  case 'evaluate':{const exe=need(flags,'--execution');const row=db.prepare('SELECT task_id,provider,model_id FROM executions WHERE execution_id=?').get(exe) as {task_id:string;provider:string;model_id:string}|undefined;if(!row)throw new Error(`実行がない: ${exe}`);
   const kind=String(flags.get('--kind')??'human'),passed=need(flags,'--passed');
   recordEvaluation(db,{schema_version:'1',evaluation_id:newId('evl'),execution_id:exe,task_id:row.task_id,evaluator:{kind,name:String(flags.get('--evaluator')??process.env.USER??kind),provider:null,model_id:null},passed:passed==='true'?true:passed==='false'?false:null,score:flags.has('--score')?Number(flags.get('--score')):null,criteria:[],failure_cause:(flags.get('--cause') as string)??null,independent:kind!=='agent',notes:(flags.get('--note') as string)??null,created_at:now()});print({recorded:exe});return 0}
  case 'ingest':{const exe=need(flags,'--execution'),prov=need(flags,'--provider'),j=JSON.parse(readFileSync(need(flags,'--file'),'utf8'));
   const row=db.prepare('SELECT model_id,auth_mode FROM executions WHERE execution_id=?').get(exe) as {model_id:string|null;auth_mode:string}|undefined;if(!row)throw new Error(`実行がない: ${exe}`);
   const n=prov==='claude'?fromAnthropic(j.usage??j):prov==='codex'?fromOpenAI(j.usage??j):prov==='antigravity'?fromAntigravity(j.usage??j):prov==='gemini-api'?fromGemini(j.usageMetadata??j):null;if(!n)throw new Error('未対応のprovider');
   const key=String(flags.get('--key')??`ingest:${prov}:${exe}:${JSON.stringify(n.tokens)}`);
   print(recordUsage(db,exe,{provider:prov as never,model_id:row.model_id,tokens:n.tokens,methods:n.methods,source:{kind:'cli_result',dedupe_key:key,session_id:null,cumulative:false},provider_reported_usd:null},row.auth_mode==='api_key'?'api_key':'subscription'));return 0}
  case 'maintenance':{if(pos[0]!=='apply'||!pos[1])throw new Error(USAGE);const r=maintenanceApply(db,pos[1]);print(r);if(r.codex_retrust_required)console.error('.codex/hooks.json が変わった: 利用者がCodexの /hooks で再信頼する（agentctl doctor の hooks_codex_retrust）');return r.applied?0:1}
  case 'doctor':{const checks=doctor(db);const out:Record<string,unknown>={checks};if(flags.has('--audit'))out.audit=audit(db,{since:flags.get('--since') as string|undefined});print(out);return checks.some(c=>c.status==='fail')?1:0}
  default:console.error(USAGE);return 2;
 }
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 main(process.argv.slice(2)).then(code=>{process.exitCode=code},e=>{console.error(e instanceof Error?e.message:String(e));process.exitCode=2});
}
