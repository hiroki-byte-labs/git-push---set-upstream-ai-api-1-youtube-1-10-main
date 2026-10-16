import {test} from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {sandbox,writeJsonl} from './helpers.ts';
import {estimateApiUsd,fromAnthropic,fromAntigravity,fromGemini,fromOpenAI} from '../telemetry/normalize.ts';
import {claudeTranscriptUsage,codexRolloutUsage,meteringOf,readJsonlFrom,recordCumulative,recordUnavailable,recordUsage,summarize,treeUsage} from '../telemetry/monitor.ts';
import {loadRegistry,now} from '../gateway/config.ts';

const {db,dir}=sandbox();
const exe=(id:string,parent:string|null=null)=>db.prepare("INSERT INTO executions(execution_id,task_id,parent_execution_id,initiator,task_type,status,managed,auth_mode,metering_status,updated_at,provider,model_id) VALUES(?,?,?,'human','general','completed',1,'subscription','missing',?,'claude','claude-sonnet-5-5')").run(id,'tsk_0000000000mm',parent,now());

test('Anthropic: input_tokensはキャッシュを含まず、思考は出力の内数（二重加算しない）', ()=>{
 const n=fromAnthropic({input_tokens:2,cache_creation_input_tokens:19403,cache_read_input_tokens:45489,output_tokens:397,output_tokens_details:{thinking_tokens:163}});
 assert.deepEqual(n.tokens,{input_total:64894,input_uncached:2,cache_read:45489,cache_write:19403,output_total:397,reasoning:163,total:65291});
 assert.equal(fromAnthropic({input_tokens:5,output_tokens:1}).methods.reasoning,'unavailable');
});
test('OpenAI/Codex: input_tokensはキャッシュを含み、outputは推論を含む', ()=>{
 const n=fromOpenAI({input_tokens:38040,cached_input_tokens:22016,cache_write_input_tokens:0,output_tokens:61,reasoning_output_tokens:10});
 assert.deepEqual(n.tokens,{input_total:38040,input_uncached:16024,cache_read:22016,cache_write:0,output_total:61,reasoning:10,total:38101});
});
test('Antigravity: total_tokensとの算術一致で包含関係を判定し、合わなければ推定扱い', ()=>{
 const a=fromAntigravity({input_tokens:100,output_tokens:20,thinking_tokens:30,cache_read_tokens:40,total_tokens:150});
 assert.equal(a.tokens.output_total,50);assert.equal(a.tokens.input_total,100);assert.equal(a.tokens.total,150);
 const b=fromAntigravity({input_tokens:100,output_tokens:20,thinking_tokens:30,cache_read_tokens:40,total_tokens:190});
 assert.equal(b.tokens.input_total,140);assert.equal(b.methods.input_total,'measured');
 const c=fromAntigravity({input_tokens:100,output_tokens:20,thinking_tokens:30,cache_read_tokens:40,total_tokens:999});
 assert.equal(c.methods.output_total,'estimated');assert.match(c.note!,/推定/);
});
test('Gemini API: promptはキャッシュを含み、thoughtsはcandidatesと別', ()=>{
 const g=fromGemini({promptTokenCount:62,candidatesTokenCount:297,thoughtsTokenCount:171,totalTokenCount:530});
 assert.deepEqual(g.tokens,{input_total:62,input_uncached:62,cache_read:0,cache_write:null,output_total:468,reasoning:171,total:530});
});
test('API相当額は単価から推定し、単価が不明ならnull', ()=>{
 const m=loadRegistry().models;
 const t=fromAnthropic({input_tokens:1_000_000,output_tokens:1_000_000,cache_read_input_tokens:0,cache_creation_input_tokens:0}).tokens;
 assert.equal(estimateApiUsd(t,m.find(x=>x.model_id==='claude-sonnet-5-5')),12);
 assert.equal(estimateApiUsd(t,m.find(x=>x.model_id==='gemini-3.1-pro-high')),null);
 assert.equal(estimateApiUsd(t,m.find(x=>x.model_id==='gpt-6-luna')),0.6,'公式単価（入力0.10・出力0.50）');
});
test('TEST-009: 同じ実行結果を2回送っても二重計上しない', ()=>{
 exe('exe_0000000000m1');
 const u={provider:'claude' as const,model_id:'claude-sonnet-5-5',...fromAnthropic({input_tokens:10,output_tokens:5}),source:{kind:'cli_result' as const,dedupe_key:'claude:result:s1:claude-sonnet-5-5',session_id:'s1',cumulative:false},provider_reported_usd:0.01};
 assert.equal(recordUsage(db,'exe_0000000000m1',u,'subscription').inserted,true);
 assert.equal(recordUsage(db,'exe_0000000000m1',u,'subscription').inserted,false);
 const s=db.prepare('SELECT COUNT(*) AS n,SUM(total) AS t FROM usage WHERE execution_id=?').get('exe_0000000000m1') as {n:number;t:number};
 assert.deepEqual([s.n,s.t],[1,15]);
 assert.equal(meteringOf(db,'exe_0000000000m1'),'measured');
});
test('セッション累積値は差分を計上し、同じ累積値の再送は0として扱う', ()=>{
 exe('exe_0000000000m2');
 const mk=(i:number,o:number)=>({provider:'codex' as const,model_id:'gpt-6-luna',...fromOpenAI({input_tokens:i,cached_input_tokens:0,output_tokens:o}),source:{kind:'cli_event' as const,dedupe_key:'x',session_id:'thread-1',cumulative:true},provider_reported_usd:null});
 recordCumulative(db,'exe_0000000000m2',mk(100,10),'subscription');
 recordCumulative(db,'exe_0000000000m2',mk(250,30),'subscription');
 assert.equal(recordCumulative(db,'exe_0000000000m2',mk(250,30),'subscription'),null);
 const t=(db.prepare('SELECT SUM(total) AS t FROM usage WHERE execution_id=?').get('exe_0000000000m2') as {t:number}).t;
 assert.equal(t,280);
});
test('トランスクリプト: 同じmessage.idの複数行を1件にし、サイドチェーンを除外できる', ()=>{
 const p=join(dir,'t.jsonl');
 const msg=(id:string,out:number,side=false)=>({type:'assistant',isSidechain:side,message:{id,model:'claude-opus-5-5',usage:{input_tokens:2,cache_read_input_tokens:100,cache_creation_input_tokens:0,output_tokens:out}}});
 writeJsonl(p,[msg('m1',1),msg('m1',50),msg('m2',7),msg('m3',9,true),{type:'user',message:{content:'秘密の本文'}}]);
 const {records,next}=readJsonlFrom(p,0);
 const u=claudeTranscriptUsage(records,{sessionId:'s',skipSidechain:true});
 assert.deepEqual(u.map(x=>[x.source.dedupe_key,x.tokens.output_total]),[['claude:msg:m1',50],['claude:msg:m2',7]]);
 assert.equal(readJsonlFrom(p,next).records.length,0);
 exe('exe_0000000000m3');
 for(const x of u)recordUsage(db,'exe_0000000000m3',x,'subscription');
 // 同じメッセージの出力数が後から増えた場合は、加算ではなく大きい値へ更新する
 const grown={...u[1]!,tokens:{...u[1]!.tokens,output_total:20,total:122}};
 assert.equal(recordUsage(db,'exe_0000000000m3',grown,'subscription').updated,true);
 assert.equal((db.prepare('SELECT SUM(output_total) AS o FROM usage WHERE execution_id=?').get('exe_0000000000m3') as {o:number}).o,70);
});
test('Codex rollout: 応答ごとのtoken_usage_recordと親スレッド・モデル・購読枠を取り出す', ()=>{
 const recs=[{type:'session_meta',payload:{id:'th-1',parent_thread_id:'th-0',cwd:'/x'}},{type:'turn_context',payload:{model:'gpt-6-luna'}},
  {type:'token_usage_record',ordinal:3,payload:{thread_id:'th-1',turn_id:'tu',response_id:'r1',usage:{input_tokens:100,cached_input_tokens:50,output_tokens:9,reasoning_output_tokens:2}}},
  {type:'event_msg',payload:{type:'token_count',rate_limits:{plan_type:'plus',primary:{used_percent:26}}}}];
 const r=codexRolloutUsage(recs);
 assert.equal(r.usage[0]!.source.dedupe_key,'codex:resp:th-1:r1');assert.equal(r.usage[0]!.model_id,'gpt-6-luna');
 assert.deepEqual(r.meta,{thread_id:'th-1',parent_thread_id:'th-0',model:'gpt-6-luna',plan_type:'plus',rate_used_percent:26});
});
test('取得できない使用量はunavailableで記録し、計測済みにしない（TEST-008の記録部分）', ()=>{
 exe('exe_0000000000m4');
 recordUnavailable(db,'exe_0000000000m4','antigravity',null,'理由','subscription');
 recordUnavailable(db,'exe_0000000000m4','antigravity',null,'理由','subscription');
 assert.equal(meteringOf(db,'exe_0000000000m4'),'unavailable');
 assert.equal((db.prepare('SELECT COUNT(*) AS n FROM usage WHERE execution_id=?').get('exe_0000000000m4') as {n:number}).n,1);
});
test('親子の使用量は子の実行に記録し、木で合計する（二重計上しない）', ()=>{
 exe('exe_0000000000p1');exe('exe_0000000000c1','exe_0000000000p1');
 const mk=(k:string,n:number)=>({provider:'claude' as const,model_id:'claude-sonnet-5-5',...fromAnthropic({input_tokens:n,output_tokens:0}),source:{kind:'transcript' as const,dedupe_key:k,session_id:'s',cumulative:false},provider_reported_usd:null});
 recordUsage(db,'exe_0000000000p1',mk('tree:parent',100),'subscription');recordUsage(db,'exe_0000000000c1',mk('tree:child',30),'subscription');
 assert.equal(treeUsage(db,'exe_0000000000p1').total,130);
 assert.ok(summarize(db,'model').length>0);
});
test('単価を後から登録したら、API相当額が未計算の記録だけを計算し直す', async()=>{
 const {repriceUsage}=await import('../telemetry/monitor.ts');
 exe('exe_0000000000rp');
 recordUsage(db,'exe_0000000000rp',{provider:'mock',model_id:'mock-no-price',...fromAnthropic({input_tokens:1_000_000,output_tokens:0}),source:{kind:'cli_result',dedupe_key:'reprice:test:1',session_id:null,cumulative:false},provider_reported_usd:null},'subscription');
 assert.equal((db.prepare('SELECT api_equivalent_usd AS u FROM usage WHERE dedupe_key=?').get('reprice:test:1') as {u:number|null}).u,null);
 db.prepare("UPDATE usage SET model_id='mock-light' WHERE dedupe_key=?").run('reprice:test:1');
 assert.ok(repriceUsage(db).updated>=1);
 assert.equal((db.prepare('SELECT api_equivalent_usd AS u FROM usage WHERE dedupe_key=?').get('reprice:test:1') as {u:number}).u,1);
});
