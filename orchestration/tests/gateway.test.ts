// Gatewayの結合テスト。模擬CLIを別プロセスで起動し、承認の受け渡し・子側の照合・計測・状態更新を通しで確認する。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {sandbox,task} from './helpers.ts';
import {executionDoc,recordEvaluation,resume,runTask} from '../gateway/gateway.ts';
import {recordHumanApproval} from '../gateway/approval.ts';
import {geminiAdapter} from '../adapters/gemini-api.ts';
import {mockAdapter} from '../adapters/local.ts';
import type {Adapter} from '../adapters/types.ts';
import {newId,now} from '../gateway/config.ts';

const {db,env,dir}=sandbox();
const mock=(spec:Record<string,unknown>,over:Parameters<typeof task>[0]={})=>task({...over,input:{prompt_file:null,program:null,workdir:dir,permission_profile:'read_only',mock:spec}});

test('通常の実行: ルーティング判断・承認・計測が記録され、execution.schemaを満たす', async()=>{
 const r=await runTask(mock({}),{db,env});
 assert.equal(r.status,'completed');
 const e=r.executions[0]!;
 assert.equal(e.model_id,'mock-light');assert.equal(e.metering_status,'measured');
 const doc=executionDoc(db,e.execution_id) as Record<string,unknown>;
 assert.equal(doc.managed,true);assert.equal(doc.route,'cli');assert.ok(doc.duration_ms!==null);
 assert.equal((db.prepare('SELECT COUNT(*) AS n FROM decisions WHERE execution_id=?').get(e.execution_id) as {n:number}).n,1);
 assert.ok((db.prepare('SELECT consumed_at FROM approvals WHERE execution_id=?').get(e.execution_id) as {consumed_at:string}).consumed_at);
 assert.ok(existsSync(join(env.AGENTCTL_DATA_DIR!,'runs',r.task_id,e.execution_id,'routing-decision.json')));
});
test('TEST-007: 未承認の直接実行・承認と異なるモデルは拒否される', async()=>{
 // 承認なしで模擬CLIを直接起動（Gatewayを通さない）
 const cli=fileURLToPath(new URL('../adapters/mock-cli.ts',import.meta.url));
 const direct=spawnSync(process.execPath,[cli,'--model','mock-light'],{env,encoding:'utf8'});
 assert.equal(direct.status,2);assert.match(direct.stdout,/承認なしの直接起動/);
 // 偽の承認情報
 const forged=spawnSync(process.execPath,[cli,'--model','mock-light'],{env:{...env,AGENTCTL_EXECUTION_ID:'exe_0000000000ff',AGENTCTL_APPROVAL:'e30.'+'0'.repeat(64)},encoding:'utf8'});
 assert.equal(forged.status,2);assert.match(forged.stdout,/署名/);
 // 子プロセスが承認と異なるモデルで動いた（実モデルの差し替え）
 const r=await runTask(mock({actual_model:'mock-high'}),{db,env});
 assert.notEqual(r.status,'completed');
 assert.equal(r.executions[0]!.failure_cause,'model_mismatch');
 assert.equal(r.executions.length,1,'model_mismatchでは再試行・切替えをしない');
 // 判断の後に方針ファイルが変わった場合も実行しない（validateDecision）
});
test('TEST-008: Token Monitorを無効にすると実行しない／使用量が取れなければ正常完了にしない', async()=>{
 const off=await runTask(mock({}),{db,env:{...env,AGENTCTL_TELEMETRY:'off'}});
 assert.equal(off.status,'rejected');assert.equal(off.executions.length,0);
 const none=await runTask(mock({usage:null}),{db,env});
 assert.equal(none.status,'unmetered');assert.equal(none.executions[0]!.metering_status,'unavailable');
 const notAudit=await runTask(mock({usage:null},{audit:false}),{db,env});
 assert.equal(notAudit.status,'completed');assert.equal(notAudit.executions[0]!.metering_status,'unavailable','未計測は明示される');
});
test('TEST-010: 途中で失敗しても失敗状況と取得できた消費量を記録する', async()=>{
 const r=await runTask(mock({outcome:'fail',cause:'auth'}),{db,env});
 assert.equal(r.status,'failed');
 const e=r.executions[0]!;
 assert.equal(e.failure_cause,'auth');assert.equal(e.metering_status,'measured');
 const u=db.prepare('SELECT total FROM usage WHERE execution_id=?').get(e.execution_id) as {total:number};
 assert.equal(u.total,2400,"入力1200+キャッシュ読800+書100+出力300");
 assert.equal(r.executions.length,1,'認証エラーは再試行しない');
});
test('TEST-011: 軽量モデルの能力不足だけ上位へ切り替え、一時的な失敗は同じモデルで再試行する', async()=>{
 const esc=await runTask(mock({by_model:{'mock-light':{outcome:'fail',cause:'capability'}}}),{db,env});
 assert.equal(esc.status,'completed');
 assert.deepEqual(esc.executions.map(e=>[e.model_id,e.status]),[['mock-light','failed'],['mock-standard','completed']]);
 assert.equal(esc.executions[1]!.escalation_count,1);
 const d=db.prepare('SELECT escalation_from,escalation_cause FROM decisions WHERE execution_id=?').get(esc.executions[1]!.execution_id) as {escalation_from:string;escalation_cause:string};
 assert.equal(d.escalation_cause,'capability');assert.ok(d.escalation_from);
 const retry=await runTask(mock({by_model:{'mock-light':{outcome:'fail',cause:'transient'}}}),{db,env});
 assert.deepEqual(retry.executions.map(e=>e.model_id),['mock-light','mock-light','mock-light'],'同じモデルで上限まで再試行');
 assert.equal(retry.status,'failed');
 const capped=await runTask(mock({outcome:'fail',cause:'capability'}),{db,env});
 assert.deepEqual(capped.executions.map(e=>e.model_id),['mock-light','mock-standard'],'上位切替えは上限1回');
});
test('成果物と試験で品質を判定し、評価を記録する', async()=>{
 const okFile=join(dir,'out','a.txt');
 const r=await runTask(mock({write_files:['out/a.txt']},{expected_artifacts:['out/a.txt'],test_command:['test','-f',okFile]}),{db,env});
 assert.equal(r.status,'completed');
 const ev=db.prepare('SELECT passed,evaluator_kind FROM evaluations WHERE execution_id=?').get(r.executions[0]!.execution_id) as {passed:number;evaluator_kind:string};
 assert.deepEqual([ev.passed,ev.evaluator_kind],[1,'test']);
 const missing=await runTask(mock({},{expected_artifacts:['out/none.txt'],budget:{max_usd:null,max_total_tokens:null,max_retries:0,max_escalations:0}}),{db,env});
 assert.equal(missing.status,'failed');assert.equal(missing.executions[0]!.failure_cause,'quality');
});
test('L0はLLMを使わずにプログラムを実行し、計測は対象外', async()=>{
 const r=await runTask(task({task_type:'program',preferred_provider:null,input:{prompt_file:null,program:{argv:['node','-e','process.exit(0)']},workdir:dir,permission_profile:'read_only'}}),{db,env});
 assert.equal(r.status,'completed');assert.equal(r.executions[0]!.provider,'local');assert.equal(r.executions[0]!.metering_status,'not_applicable');
});
test('L4は独立レビューを別の実行として記録する', async()=>{
 // 模擬環境ではmockだけが高性能枠を持つため、同じ製品の別モデル（なければ同じ枠の別実行）でレビューする
 const r=await runTask(mock({output:'結果\nVERDICT: PASS'},{task_type:'design',difficulty:'L4'}),{db,env});
 assert.equal(r.status,'completed');
 assert.ok(r.review,'レビュー実行あり');
 const parent=db.prepare('SELECT parent_execution_id FROM executions WHERE execution_id=?').get(r.review!.execution_id) as {parent_execution_id:string};
 assert.equal(parent.parent_execution_id,r.executions[0]!.execution_id);
});
test('従量課金（Gemini API）は方針で無効、有効化しても人の承認がなければ実行しない', async()=>{
 const t=task({task_type:'video_analysis',preferred_provider:'gemini-api'});
 const genv={...env,AGENTCTL_AUTH_OVERRIDE:JSON.stringify({'gemini-api':['api_key']}),GEMINI_API_KEY:'test-key-not-real'};
 const blocked=await runTask(t,{db,env:genv});
 assert.equal(blocked.status,'rejected');
 // 方針でAPI課金を有効にした場合（一時ディレクトリの複製だけを変更）
 const pol=join(env.AGENTCTL_REGISTRY_DIR!,'routing-policy.json');const {readFileSync}=await import('node:fs');
 const original=readFileSync(pol,'utf8');writeFileSync(pol,original.replace('"allow_api_billing": false','"allow_api_billing": true'));
 try{
  const calls:string[]=[];
  const fake:Adapter=geminiAdapter(async(url,init)=>{calls.push(url);assert.equal(init.headers['x-goog-api-key'],'test-key-not-real');assert.ok(!url.includes('test-key'));return {ok:true,status:200,text:async()=>JSON.stringify({responseId:'resp-1',modelVersion:'gemini-3.8-flash-001',usageMetadata:{promptTokenCount:100,candidatesTokenCount:20,thoughtsTokenCount:5,totalTokenCount:125},candidates:[{content:{parts:[{text:'ok'}]}}]})}});
  const pending=await runTask(t,{db,env:genv,adapters:{'gemini-api':fake}});
  assert.equal(pending.status,'awaiting_human_approval');assert.equal(calls.length,0,'承認前は呼ばない');
  const exe=pending.executions[0]!;
  recordHumanApproval(db,exe.decision_id!,'tester','テスト');
  const done=await resume(exe.execution_id,{db,env:genv,adapters:{'gemini-api':fake}});
  assert.equal(done.status,'completed');assert.equal(calls.length,1);
  const u=db.prepare('SELECT billing_mode,total,api_equivalent_usd FROM usage WHERE execution_id=?').get(exe.execution_id) as {billing_mode:string;total:number;api_equivalent_usd:number};
  assert.equal(u.billing_mode,'api_key');assert.equal(u.total,125);assert.ok(u.api_equivalent_usd>0);
 }finally{writeFileSync(pol,original)}
});
test('再帰防止: 入れ子の深さが上限なら拒否', async()=>{
 const r=await runTask(mock({}),{db,env:{...env,AGENTCTL_DEPTH:'3'}});
 assert.equal(r.status,'rejected');assert.match(r.message,/深さ/);
});
test('判断後に方針が変わったら実行しない', async()=>{
 const pol=join(env.AGENTCTL_REGISTRY_DIR!,'routing-policy.json');const {readFileSync}=await import('node:fs');const original=readFileSync(pol,'utf8');
 let n=0;
 const tamper:Adapter={provider:'mock',async execute(req){n++;return mockAdapter.execute(req)}};
 // routeとvalidateの間で変更されたことを模擬するため、Adapterの前に方針を書き換える
 const t=mock({});
 const {route}=await import('../router/router.ts');void route;
 writeFileSync(pol,original.replace('"version": "','"version": "x'));
 try{
  const {validateDecision}=await import('../gateway/gateway.ts');
  const {loadPolicy,loadRegistry}=await import('../gateway/config.ts');
  writeFileSync(pol,original);const before=loadPolicy();
  const d=route({task:{...t,task_id:newId('tsk')},execution_id:newId('exe'),policy:before.policy,policy_sha256:before.sha256,registry:loadRegistry(),env:{authenticated:{mock:['none']},allowMock:true}});
  writeFileSync(pol,original.replace('"version": "','"version": "x'));
  assert.throws(()=>validateDecision(d,{authenticated:{mock:['none']},allowMock:true}),/方針が変更/);
  assert.equal(n,0);
 }finally{writeFileSync(pol,original)}
});
test('結果にモデルIDがない製品は、子セッションのHookの照合結果で判定する（Antigravityの実機試験で追加）', async()=>{
 const {logEvent}=await import('../telemetry/db.ts');
 const child=(kind:'child_session_verified'|'child_session_rejected',model:string):Adapter=>({provider:'mock',async execute(req){
  logEvent(db,kind,{reason:'test',model},{product:'antigravity',session_id:'conv-x',execution_id:req.execution_id});
  const r=await mockAdapter.execute(req);return {...r,reported_models:[],model_check:'unverifiable'};
 }});
 const ok=await runTask(mock({}),{db,env,adapters:{mock:child('child_session_verified','mock-light')}});
 assert.equal(ok.status,'completed');
 assert.equal((db.prepare("SELECT COUNT(*) AS n FROM events WHERE kind='model_unverifiable' AND execution_id=?").get(ok.executions[0]!.execution_id) as {n:number}).n,0);
 const ng=await runTask(mock({}),{db,env,adapters:{mock:child('child_session_rejected','mock-high')}});
 assert.equal(ng.executions[0]!.failure_cause,'model_mismatch');
});
test('評価の記録はevaluation.schemaで検査する', ()=>{
 const e=db.prepare("SELECT execution_id,task_id FROM executions WHERE status='completed' LIMIT 1").get() as {execution_id:string;task_id:string};
 recordEvaluation(db,{schema_version:'1',evaluation_id:newId('evl'),execution_id:e.execution_id,task_id:e.task_id,evaluator:{kind:'human',name:'tester',provider:null,model_id:null},passed:true,score:0.9,criteria:[],failure_cause:null,independent:true,notes:null,created_at:now()});
 assert.throws(()=>recordEvaluation(db,{schema_version:'1',evaluation_id:'bad',execution_id:e.execution_id}),/schema/);
});
