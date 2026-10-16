import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sandbox,task} from './helpers.ts';
import {loadPolicy,loadRegistry} from '../gateway/config.ts';
import {classifyPrompt,nextAction,route,type Env,type Task} from '../router/router.ts';
import {validate} from '../gateway/schema.ts';

sandbox();
const {policy,sha256}=loadPolicy(),registry=loadRegistry();
const env:Env={authenticated:{claude:['subscription'],codex:['subscription'],antigravity:['subscription'],local:['none']},allowMock:false};
const r=(t:Partial<Task>,e:Env=env)=>route({task:{...task({preferred_provider:null,...t}),task_id:'tsk_0000000000aa'},execution_id:'exe_0000000000aa',policy,policy_sha256:sha256,registry,env:e});

test('L0はLLMを使わずプログラムで処理する', ()=>{
 const d=r({task_type:'program',input:{prompt_file:null,program:{argv:['true']},workdir:null,permission_profile:'read_only'}});
 assert.equal(d.difficulty,'L0');assert.equal(d.selected?.provider,'local');assert.equal(d.selected?.model_id,null);assert.equal(d.used_llm,false);
 validate('routing-decision',d);
});
test('L1は軽量、L2は標準、L3は品質要求で標準/高性能、L4は高性能と独立レビュー', ()=>{
 assert.equal(r({task_type:'summarization',initiator:'claude'}).selected?.model_id,'claude-haiku-5-5');
 assert.equal(r({task_type:'implementation',initiator:'codex'}).selected?.model_id,'gpt-6.1-sol');
 assert.equal(r({task_type:'design',quality_requirement:'normal'}).selected?.tier,'standard');
 assert.equal(r({task_type:'design',quality_requirement:'high'}).selected?.tier,'high');
 const l4=r({task_type:'design',difficulty:'L4',initiator:'codex'});
 assert.equal(l4.selected?.model_id,'gpt-6-astra');assert.equal(l4.review.required,true);assert.notEqual(l4.review.provider,'codex');
 for(const d of [l4])validate('routing-decision',d);
});
test('動画解析は動画を扱える製品（Antigravity）を選ぶ', ()=>{
 const d=r({task_type:'video_analysis',initiator:'codex'});
 assert.equal(d.selected?.provider,'antigravity');assert.ok(d.candidates.every(c=>c.provider==='antigravity'||c.provider==='gemini-api'));
});
test('認証のない製品・選択対象外・API課金は選ばない（勝手に従量課金へ切り替えない）', ()=>{
 const d=r({task_type:'summarization',initiator:'claude'},{authenticated:{codex:['subscription']},allowMock:false});
 assert.equal(d.selected?.provider,'codex');
 assert.ok(d.candidates.find(c=>c.model_id==='claude-haiku-5-5')?.reasons.includes('認証済みの実行経路なし'));
 const v=r({task_type:'video_analysis'},{authenticated:{'gemini-api':['api_key']},allowMock:false});
 assert.equal(v.selected,null);assert.match(v.routing_reason,/条件を満たすモデルがありません/);
 assert.ok(v.candidates.some(c=>c.reasons.some(x=>/API課金は方針で無効/.test(x))));
 assert.ok(!r({task_type:'design',difficulty:'L4',preferred_provider:'claude'}).candidates.find(c=>c.model_id==='claude-fable-5-1')?.eligible);
});
test('上限トークンを超える見込みのタスクは選ばない', ()=>{
 const d=r({task_type:'implementation',budget:{max_usd:null,max_total_tokens:1000,max_retries:0,max_escalations:0}});
 assert.equal(d.selected,null);
});
test('判断が難しい場合は既定L2とdifficulty_source=defaultを記録する（LLMは呼ばない）', ()=>{
 const d=r({task_type:'general',initiator:'codex'});
 assert.equal(d.difficulty,'L2');assert.equal(d.difficulty_source,'default');assert.equal(d.used_llm,false);
});
test('プロンプトの規則分類（本文は保存しない）', ()=>{
 assert.deepEqual(classifyPrompt('この関数のバグを修正して',policy).task_type,'implementation');
 assert.equal(classifyPrompt('ログを要約して',policy).difficulty,'L1');
 assert.equal(classifyPrompt('本番DBの移行の設計を決めたい',policy).difficulty,'L4');
});
test('失敗原因で再試行・上位切替え・停止を決め、上限で止まる（TEST-011の判断部分）', ()=>{
 const t=task();
 assert.equal(nextAction('capability',{retries:0,escalations:0,tier:'light'},t,policy).action,'escalate');
 assert.equal(nextAction('capability',{retries:0,escalations:1,tier:'standard'},t,policy).action,'stop');
 assert.equal(nextAction('capability',{retries:0,escalations:0,tier:'high'},t,policy).action,'stop');
 assert.equal(nextAction('transient',{retries:0,escalations:0,tier:'light'},t,policy).action,'retry_same');
 assert.equal(nextAction('transient',{retries:2,escalations:0,tier:'light'},t,policy).action,'stop');
 for(const c of ['auth','budget','policy','input','model_mismatch','unknown'] as const)assert.equal(nextAction(c,{retries:0,escalations:0,tier:'light'},t,policy).action,'stop',c);
});
