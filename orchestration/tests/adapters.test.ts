// 各製品の公式出力の解析（実CLIを呼ばない）。出力例は各公式資料の項目名と、手元の実ファイルの形に合わせた。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sandbox} from './helpers.ts';
import {parseClaudeResult} from '../adapters/claude.ts';
import {parseCodexEvents} from '../adapters/codex.ts';
import {parseAgyResult} from '../adapters/antigravity.ts';
import {childEnv,classifyFailure} from '../adapters/types.ts';

sandbox();
const ok={code:0,timedOut:false};
test('Claude -p json: modelUsageのモデル別使用量を記録し、承認モデルとの一致を確認する', ()=>{
 const out=JSON.stringify({type:'result',subtype:'success',is_error:false,session_id:'s-1',total_cost_usd:0.05,result:'done',usage:{input_tokens:5,output_tokens:10},
  modelUsage:{'claude-sonnet-5-5':{inputTokens:100,outputTokens:50,cacheReadInputTokens:1000,cacheCreationInputTokens:10,costUSD:0.04},'claude-haiku-5-5':{inputTokens:20,outputTokens:5,cacheReadInputTokens:0,cacheCreationInputTokens:0,costUSD:0.001}}});
 const r=parseClaudeResult(out,'',ok,'claude-sonnet-5-5');
 assert.equal(r.status,'completed');assert.equal(r.model_check,'verified');
 assert.deepEqual(r.usage.map(u=>[u.model_id,u.tokens.total,u.provider_reported_usd]),[['claude-sonnet-5-5',1160,0.04],['claude-haiku-5-5',25,0.001]]);
 assert.equal(parseClaudeResult(out,'',ok,'claude-opus-5-5').model_check,'mismatch');
 const err=parseClaudeResult(JSON.stringify({type:'result',subtype:'error_max_budget_usd',is_error:true,session_id:'s',usage:{input_tokens:1,output_tokens:1}}),'',{code:1,timedOut:false},'claude-sonnet-5-5');
 assert.equal(err.failure_cause,'budget');assert.equal(err.usage.length,1,'失敗時も使用量を返す');
 const none=parseClaudeResult('','Not logged in · Please run /login',{code:1,timedOut:false},'claude-sonnet-5-5');
 assert.equal(none.failure_cause,'auth');assert.equal(none.usage.length,0);
});
test('Codex exec --json: turn.completed.usageはスレッド累積値として扱う', ()=>{
 const ev=['{"type":"thread.started","thread_id":"th-9"}','{"type":"turn.started"}','{"type":"item.completed","item":{"type":"agent_message","text":"ok"}}','{"type":"turn.completed","usage":{"input_tokens":100,"cached_input_tokens":40,"output_tokens":20,"reasoning_output_tokens":5}}'].join('\n');
 const r=parseCodexEvents(ev,'',ok,'gpt-6-luna');
 assert.equal(r.session_id,'th-9');assert.equal(r.usage_mode,'cumulative');assert.equal(r.usage[0]!.tokens.total,120);assert.equal(r.output_text,'ok');
 const f=parseCodexEvents('{"type":"thread.started","thread_id":"t"}\n{"type":"turn.failed","error":{"message":"rate limit exceeded"}}','',{code:1,timedOut:false},'gpt-6-luna');
 assert.equal(f.failure_cause,'transient');
});
test('agy -p json: usageを正規化し、モデルIDが結果にないため照合不能を明示する', ()=>{
 const r=parseAgyResult(JSON.stringify({conversation_id:'c-1',status:'SUCCESS',response:'ok',duration_seconds:3,num_turns:1,usage:{input_tokens:100,output_tokens:20,thinking_tokens:30,cache_read_tokens:40,total_tokens:150}}),'',ok,'gemini-3.8-flash-low');
 assert.equal(r.status,'completed');assert.equal(r.model_check,'unverifiable');assert.equal(r.usage[0]!.tokens.total,150);
 assert.equal(parseAgyResult(JSON.stringify({conversation_id:'c',status:'ERROR',error:{message:'quota exceeded'}}),'',{code:3,timedOut:false},'m').failure_cause,'budget');
});
test('子プロセスの環境: 購読認証ではAPIキーを渡さない', ()=>{
 const e=childEnv({ANTHROPIC_API_KEY:'x',OPENAI_API_KEY:'y',CODEX_API_KEY:'z',GEMINI_API_KEY:'w',PATH:'/bin'},'subscription',{AGENTCTL_EXECUTION_ID:'e'});
 assert.deepEqual(Object.keys(e).sort(),['AGENTCTL_EXECUTION_ID','PATH']);
 assert.equal(childEnv({GEMINI_API_KEY:'w'},'api_key',{}).GEMINI_API_KEY,'w');
 assert.equal(classifyFailure('',{timedOut:true}),'transient');
});
