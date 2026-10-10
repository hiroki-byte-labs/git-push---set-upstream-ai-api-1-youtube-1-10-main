import test from 'node:test';import assert from 'node:assert';import {readFileSync} from 'node:fs';
import {estimateText,estimateTtsChars,estimateVideo,estimateTtsAudio,Budget} from '../src/budget.ts';
import {callWithRetry,MockConnection,ConnError} from '../src/connections.ts';
const p=JSON.parse(readFileSync('config/pricing.json','utf8'));
test('見積り',()=>{
 assert.ok(Math.abs(estimateText(p,'gemini-3.5-flash-lite:text',1e6,1e6)-2.8)<1e-9);
 assert.ok(Math.abs(estimateTtsChars(p,'elevenlabs-v4:tts',10000)-0.22)<1e-9);
 assert.ok(Math.abs(estimateVideo(p,'runway-wan3:video',5)-1)<1e-9);
 assert.ok(estimateTtsAudio(p,'gemini-3.8-flash-tts:tts',1000,900)>0);
});
test('単価・確認日欠落と不正数量を拒否',()=>{
 assert.throws(()=>estimateText(p,'nope',1,1));
 assert.throws(()=>estimateText({currency:'USD',items:{x:{inputPerMTok:1,outputPerMTok:1}}},'x',1,1));
 assert.throws(()=>estimateText(p,'gemini-3.5-flash-lite:text',-1,0));
 assert.throws(()=>estimateTtsChars(p,'gemini-3.5-flash-lite:text',10));
});
test('上限: 境界は許可、超過は拒否、見込みを含めて判定',()=>{
 const b=new Budget(1);b.reserve(0.6);b.reserve(0.4);assert.throws(()=>b.reserve(0.01));
 b.settle(0.6,0.5);assert.equal(b.committed,0.5);assert.doesNotThrow(()=>b.reserve(0.1));
 b.release(0.4);b.release(0.1);assert.ok(b.reserved<=1e-9);
});
test('有限再試行: 429/5xxは再試行、SAFETYは再試行しない、上限で停止',async()=>{
 const ok=new MockConnection('script','mock','m','x',[new ConnError('RATE_LIMIT','429'),new ConnError('SERVER','503')]);
 const r=await callWithRetry(ok,null,3);assert.equal(r.usage.attempts,3);assert.equal(r.usage.mode,'mock');assert.equal(r.usage.costUsd,0);
 const safe=new MockConnection('script','mock','m','x',[new ConnError('SAFETY','blocked')]);
 await assert.rejects(callWithRetry(safe,null,3),/blocked/);assert.equal(safe.calls,1);
 const bad=new MockConnection('audio','mock','m','x',[1,2,3,4].map(()=>new ConnError('SERVER','500')));
 await assert.rejects(callWithRetry(bad,null,3),/500/);assert.equal(bad.calls,3);
 await assert.rejects(callWithRetry(ok,null,0));
});
test('callWithBudget: 上限超過の見積りは呼び出す前に拒否（T024）',async()=>{const {LocalConnection,callWithBudget}=await import('../src/connections.ts');let called=0;const c=new LocalConnection('script','x','mock',async()=>{called++;return {output:1}});const usage:any[]=[];await assert.rejects(callWithBudget(c,undefined,new Budget(0.5),1,usage),/上限超過/);assert.equal(called,0);assert.equal(usage.length,0)});
test('callWithBudget: 成功で精算しusageを記録、失敗で予約を解放（T024）',async()=>{const {LocalConnection,callWithBudget}=await import('../src/connections.ts');const b=new Budget(1);const usage:any[]=[];const ok=new LocalConnection('audio','cue','mock',async(p:string)=>({output:p,outputUnits:36}));assert.equal(await callWithBudget(ok,'a.wav',b,0.2,usage),'a.wav');assert.equal(b.reserved,0);assert.equal(b.committed,0);assert.deepEqual([usage[0].mode,usage[0].requestId,usage[0].outputUnits,usage[0].attempts],['mock','mock-cue-1',36,1]);const bad=new LocalConnection('visual','r','local',async()=>{throw new ConnError('FATAL','描画失敗')});await assert.rejects(callWithBudget(bad,'d',b,0.3,usage),/描画失敗/);assert.equal(b.reserved,0);assert.equal(usage.length,1)});
// T098: 試行ごとに予約し、費用不明の試行は予約を保持したまま次の再送を判定する。すべて無料の模擬接続。
import type {Connection,Attempt} from '../src/connections.ts';
// 模擬の有料サービス: script に並べた結果を順に返す。costは模擬の課金額（実際の課金はない）。
function fakeMetered(script:({ok:true;cost:number}|{err:ConnError})[],reconciled:Record<string,number>={}){
 const c:any={domain:'script',provider:'fake-metered',model:'m',mode:'mock',calls:0,reconcileCalls:0,
  async call(_:unknown){const n=++c.calls;const s=script[n-1];if(!s)throw Error('想定外の呼出し');if('err' in s)throw s.err;return {output:`out-${n}`,usage:{domain:'script',provider:'fake-metered',model:'m',mode:'mock',requestId:`prov-${n}`,inputUnits:0,outputUnits:0,costUsd:s.cost}}},
  async reconcile(a:Attempt){c.reconcileCalls++;const v=a.providerRequestId?reconciled[a.providerRequestId]:undefined;return v===undefined?undefined:{costUsd:v}}};
 return c as Connection<unknown,string>&{calls:number;reconcileCalls:number};
}
const lost=(id?:string)=>new ConnError('SERVER','処理後に応答を喪失',{charge:'unknown',providerRequestId:id});
test('T098: 初回が処理後の応答喪失なら、不明額0.6を保持し、上限1を超える再送をしない',async()=>{
 const {callWithBudget}=await import('../src/connections.ts');const b=new Budget(1);const usage:any[]=[];const attempts:Attempt[]=[];
 const c=fakeMetered([{err:lost()},{ok:true,cost:0.6}]);
 await assert.rejects(callWithBudget(c,null,b,0.6,usage,3,attempts),/費用不明.*上限/s);
 assert.equal(c.calls,1);assert.equal(b.unknown,0.6);assert.equal(b.reserved,0);assert.equal(b.committed,0);assert.equal(usage.length,0);
 assert.deepEqual(attempts.map(a=>[a.attempt,a.outcome,a.charge,a.estimateUsd]),[[1,'failed','unknown',0.6]]);assert.match(attempts[0].attemptId,/^att-/);
});
test('T098: 明確な未処理の失敗は予約を解放して再試行する',async()=>{
 const {callWithBudget}=await import('../src/connections.ts');const b=new Budget(1);const usage:any[]=[];const attempts:Attempt[]=[];
 const c=fakeMetered([{err:new ConnError('RATE_LIMIT','429（受付前に拒否）',{charge:'none'})},{ok:true,cost:0.5}]);
 assert.equal(await callWithBudget(c,null,b,0.6,usage,3,attempts),'out-2');
 assert.equal(c.calls,2);assert.equal(b.unknown,0);assert.equal(b.reserved,0);assert.equal(b.committed,0.5);
 assert.deepEqual(attempts.map(a=>[a.outcome,a.charge,a.costUsd??null,a.providerRequestId??null]),[['failed','none',0,null],['success','confirmed',0.5,'prov-2']]);
 assert.equal(usage[0].attempts,2);assert.equal(usage[0].costUsd,0.5);
});
test('T098: 最後まで不明なら有限回で止まり、不明額を解放しない（429/SERVERの既定は不明）',async()=>{
 const {callWithBudget}=await import('../src/connections.ts');const b=new Budget(2);const attempts:Attempt[]=[];
 const c=fakeMetered([{err:new ConnError('SERVER','500')},{err:new ConnError('RATE_LIMIT','429')},{err:lost()}]);
 await assert.rejects(callWithBudget(c,null,b,0.6,[],3,attempts),/応答を喪失/);
 assert.equal(c.calls,3);assert.ok(Math.abs(b.unknown-1.8)<1e-9);assert.equal(b.reserved,0);assert.deepEqual(attempts.map(a=>a.charge),['unknown','unknown','unknown']);
 assert.throws(()=>b.reserve(0.3),/上限超過/);
});
test('T098: 照合で費用が判明したら一度だけ精算し、二重計上しない',async()=>{
 const {callWithBudget}=await import('../src/connections.ts');const b=new Budget(2);const attempts:Attempt[]=[];
 const c=fakeMetered([{err:lost('prov-1')},{ok:true,cost:0.6}],{'prov-1':0.5});
 assert.equal(await callWithBudget(c,null,b,0.6,[],3,attempts),'out-2');
 assert.equal(c.reconcileCalls,1);assert.equal(b.unknown,0);assert.equal(b.reserved,0);assert.ok(Math.abs(b.committed-1.1)<1e-9);
 assert.deepEqual(attempts.map(a=>[a.charge,a.costUsd]),[['reconciled',0.5],['confirmed',0.6]]);
});
test('T098: 照合で不明のままなら保持する。SAFETYは再試行しない',async()=>{
 const {callWithBudget}=await import('../src/connections.ts');const b=new Budget(5);const attempts:Attempt[]=[];
 const c=fakeMetered([{err:new ConnError('SAFETY','blocked',{providerRequestId:'prov-1'})}],{});
 await assert.rejects(callWithBudget(c,null,b,0.6,[],3,attempts),/blocked/);
 assert.equal(c.calls,1);assert.equal(c.reconcileCalls,1);assert.equal(b.unknown,0.6);assert.equal(attempts[0].charge,'unknown');
});
test('T098: mock/localの正常系と手元処理の失敗（有限回の再試行）は費用0で確定し、不明額を残さない',async()=>{
 const {LocalConnection,callWithBudget}=await import('../src/connections.ts');const b=new Budget(0);const usage:any[]=[];const attempts:Attempt[]=[];
 assert.equal(await callWithBudget(new LocalConnection('audio','cue','mock',async(p:string)=>({output:p})),'a.wav',b,0,usage,3,attempts),'a.wav');
 await assert.rejects(callWithBudget(new LocalConnection('visual','r','local',async()=>{throw new ConnError('SERVER','描画失敗')}),'d',b,0,usage,3,attempts),/描画失敗/);
 assert.deepEqual(attempts.map(a=>[a.outcome,a.charge,a.costUsd]),[['success','confirmed',0],...[1,2,3].map(()=>['failed','none',0])]);assert.equal(b.unknown,0);assert.equal(b.committed,0);
});
