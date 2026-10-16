// Routing Optimizerの結合テスト。模擬CLIの実行実績から提案・PM確認・適用・劣化検知・復元までを通す。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {sandbox,task} from './helpers.ts';
import {runTask} from '../gateway/gateway.ts';
import {analyze,apply,checkRegression,propose,review,rollback} from '../optimizer/optimizer.ts';
import {ROOT,sha256} from '../gateway/config.ts';

const {db,env,dir}=sandbox();
const pol=join(env.AGENTCTL_REGISTRY_DIR!,'routing-policy.json');
// 劣化判定の最小件数だけテスト用に下げる（一時ディレクトリの複製のみ変更）
writeFileSync(pol,readFileSync(pol,'utf8').replace('"regression_min_samples": 10','"regression_min_samples": 3'));
const original=readFileSync(pol);
const run=(spec:Record<string,unknown>,quality:'normal'|'high',testCmd=['true'])=>runTask(task({quality_requirement:quality,test_command:testCmd,input:{prompt_file:null,program:null,workdir:dir,permission_profile:'read_only',mock:spec}}),{db,env});

test('TEST-012: 実績が不足している段階では提案せず、設定を変更しない', async()=>{
 await run({by_model:{'mock-light':{outcome:'fail',cause:'capability'}}},'normal');
 await run({},'high');
 const p=propose(db);
 assert.equal(p.status,'no_change');assert.equal(p.changes.length,0);
 assert.ok(p.insufficient.length>=2);
 assert.ok(readFileSync(pol).equals(original),'方針ファイルは不変');
 assert.throws(()=>apply(db,p.proposal_id),/PMの承認がない/);
});
test('費用対効果: 安くても失敗が多い戦略は効率的と判断しない', async()=>{
 for(let i=0;i<6;i++)await run(i<5?{by_model:{'mock-light':{outcome:'fail',cause:'capability'}}}:{},'normal');
 for(let i=0;i<5;i++)await run({},'high');
 const s=analyze(db);
 const light=s.find(x=>x.start_tier==='light')!,std=s.find(x=>x.start_tier==='standard')!;
 assert.ok(light.cost_per_task_usd!<std.cost_per_task_usd!*1.5);
 assert.ok(light.escalation_rate>0.5);
 assert.ok(light.cost_per_pass_usd!>std.cost_per_pass_usd!,'失敗と上位切替えの費用を含めると軽量開始のほうが高い');
});
test('TEST-013: PM確認後に適用し、品質が悪化したら以前の設定へ復元できる', async()=>{
 const p=propose(db,{minSamples:5});
 assert.equal(p.status,'proposed');
 assert.deepEqual(p.changes.map(c=>[c.task_type,c.difficulty,c.from_tier,c.to_tier]),[['summarization','L1','light','standard']]);
 assert.throws(()=>apply(db,p.proposal_id),/PMの承認がない/);
 review(db,p.proposal_id,'approve','codex-pm:project-orchestrator','テスト');
 const before=sha256(readFileSync(pol));
 const a=apply(db,p.proposal_id);
 const now=JSON.parse(readFileSync(pol,'utf8'));
 assert.equal(now.overrides[0].tier,'standard');assert.notEqual(a.to,a.from);
 assert.equal(sha256(readFileSync(a.backup)),before,'旧版を保存');
 assert.equal((db.prepare("SELECT COUNT(*) AS n FROM policy_changes WHERE kind='apply'").get() as {n:number}).n,1,'変更履歴を記録');
 // 適用後は標準枠から開始し、品質（試験）が落ちる状況を作る
 for(let i=0;i<4;i++){const r=await run({},'normal',['false']);assert.equal(r.executions[0]!.tier,'standard')}
 const c=checkRegression(db,{auto:true,by:'test'});
 assert.equal(c.status,'degraded');assert.ok(c.rolled_back);
 assert.equal(sha256(readFileSync(pol)),before,'以前の設定へ復元');
 assert.equal((db.prepare("SELECT status FROM proposals WHERE proposal_id=?").get(p.proposal_id) as {status:string}).status,'rolled_back');
 assert.throws(()=>rollback(db,{by:'test',reason:'x'}),/optimizerの適用で作られていない/);
});
test('CLI: 改善案の確認はAIのツール実行（TTYなし・Codex以外）からは拒否、CodexのPMは可能', ()=>{
 const p=propose(db,{minSamples:5});
 const cli=(e:Record<string,string>)=>spawnSync(join(ROOT,'scripts','agentctl'),['optimize','review',p.proposal_id,'--decision','approve','--reviewer','codex-pm'],{env:{...env,...e},encoding:'utf8'});
 const fromClaude=cli({CLAUDECODE:'1'});
 assert.notEqual(fromClaude.status,0);assert.match(fromClaude.stderr,/人の端末、またはCodexのPM/);
 if(p.status==='proposed'){const fromCodex=cli({CODEX_THREAD_ID:'th-pm'});assert.equal(fromCodex.status,0,fromCodex.stderr)}
});
