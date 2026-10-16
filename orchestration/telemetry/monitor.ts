// Token Monitor: 使用量の記録（冪等）、累積値の差分化、計測状態の判定、ローカル記録の取込み、集計。LLMは使わない。
import {closeSync,existsSync,openSync,readSync,statSync} from 'node:fs';
import {loadRegistry,newId,now,sha256,type MeteringStatus,type Provider} from '../gateway/config.ts';
import {validate} from '../gateway/schema.ts';
import {logEvent,tx,type DB} from './db.ts';
import {TOKEN_KEYS,estimateApiUsd,fromAnthropic,fromOpenAI,unavailable,type Methods,type NormalizedUsage,type Tokens} from './normalize.ts';

export type BillingMode='subscription'|'api_key'|'none'|'unknown';
export type RecordResult={inserted:boolean;updated:boolean;usage_id:string};

// 同じdedupe_keyは1回だけ計上する。ストリーム中に同じメッセージの出力数が増えた場合だけ大きい値へ更新する（加算しない）。
export function recordUsage(db:DB,executionId:string,u:NormalizedUsage,billing:BillingMode):RecordResult{
 const model=loadRegistry().models.find(m=>m.provider===u.provider&&m.model_id===u.model_id);
 const api=estimateApiUsd(u.tokens,model);
 const usageId=newId('use'),recordedAt=now();
 const doc={schema_version:'1',usage_id:usageId,execution_id:executionId,provider:u.provider,model_id:u.model_id,source:u.source,tokens:u.tokens,methods:u.methods,
  cost:{billing_mode:billing,api_equivalent_usd:api,api_equivalent_method:api===null?'unavailable':'estimated',provider_reported_usd:u.provider_reported_usd,actual_billed_usd:null,actual_billed_method:'unavailable'},recorded_at:recordedAt};
 validate('usage',doc);
 const existing=db.prepare('SELECT usage_id,output_total,execution_id FROM usage WHERE dedupe_key=?').get(u.source.dedupe_key) as {usage_id:string;output_total:number|null;execution_id:string}|undefined;
 if(existing){
  if(u.tokens.output_total!==null&&(existing.output_total??-1)<u.tokens.output_total){
   db.prepare('UPDATE usage SET output_total=?,reasoning=?,total=?,api_equivalent_usd=?,methods_json=? WHERE usage_id=?').run(u.tokens.output_total,u.tokens.reasoning,u.tokens.total,api,JSON.stringify(u.methods),existing.usage_id);
   refreshMetering(db,existing.execution_id);return {inserted:false,updated:true,usage_id:existing.usage_id};
  }
  return {inserted:false,updated:false,usage_id:existing.usage_id};
 }
 const t=u.tokens;
 db.prepare(`INSERT INTO usage(usage_id,execution_id,provider,model_id,source_kind,dedupe_key,session_id,cumulative,input_total,input_uncached,cache_read,cache_write,output_total,reasoning,total,methods_json,billing_mode,api_equivalent_usd,api_equivalent_method,provider_reported_usd,actual_billed_usd,actual_billed_method,recorded_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,'unavailable',?)`).run(usageId,executionId,u.provider,u.model_id,u.source.kind,u.source.dedupe_key,u.source.session_id,u.source.cumulative?1:0,
  t.input_total,t.input_uncached,t.cache_read,t.cache_write,t.output_total,t.reasoning,t.total,JSON.stringify(u.methods),billing,api,api===null?'unavailable':'estimated',u.provider_reported_usd,recordedAt);
 refreshMetering(db,executionId);
 return {inserted:true,updated:false,usage_id:usageId};
}
// セッション累積値（codex exec --json の turn.completed など）を前回値との差分にして記録する。
// 同じ累積値の再送は差分0で記録しない。値が減ったらセッションのやり直しとみなし、その値を新しい起点として計上する。
export function recordCumulative(db:DB,executionId:string,u:NormalizedUsage,billing:BillingMode):RecordResult|null{
 const sid=u.source.session_id;if(!sid)throw new Error('累積値にはsession_idが必要');
 return tx(db,()=>{
  const prev=db.prepare('SELECT * FROM cumulative_snapshots WHERE provider=? AND session_id=? AND model_id=?').get(u.provider,sid,u.model_id??'') as Record<string,number|null>|undefined;
  const keys=['input_total','cache_read','cache_write','output_total','reasoning'] as const;
  const reset=!!prev&&keys.some(k=>u.tokens[k]!==null&&prev[k]!==null&&(u.tokens[k] as number)<(prev[k] as number));
  const delta={...u.tokens} as Tokens;
  if(prev&&!reset)for(const k of keys)delta[k]=u.tokens[k]===null?null:(u.tokens[k] as number)-((prev[k] as number|null)??0);
  delta.input_uncached=delta.input_total===null?null:Math.max(0,delta.input_total-(delta.cache_read??0)-(delta.cache_write??0));
  delta.total=delta.input_total===null||delta.output_total===null?null:delta.input_total+delta.output_total;
  db.prepare(`INSERT INTO cumulative_snapshots(provider,session_id,model_id,input_total,cache_read,cache_write,output_total,reasoning,updated_at) VALUES(?,?,?,?,?,?,?,?,?)
   ON CONFLICT(provider,session_id,model_id) DO UPDATE SET input_total=excluded.input_total,cache_read=excluded.cache_read,cache_write=excluded.cache_write,output_total=excluded.output_total,reasoning=excluded.reasoning,updated_at=excluded.updated_at`)
   .run(u.provider,sid,u.model_id??'',u.tokens.input_total,u.tokens.cache_read,u.tokens.cache_write,u.tokens.output_total,u.tokens.reasoning,now());
  if(!delta.total&&!delta.input_total&&!delta.output_total)return null;
  const key=`cum:${u.provider}:${sid}:${u.model_id}:${sha256(JSON.stringify(u.tokens))}`;
  return recordUsage(db,executionId,{...u,tokens:delta,source:{...u.source,dedupe_key:key,cumulative:true}},billing);
 });
}
// 使用量を取得できなかったことを明示する記録（推測で補完しない）。
export function recordUnavailable(db:DB,executionId:string,provider:Provider,modelId:string|null,reason:string,billing:BillingMode){
 const {tokens,methods}=unavailable();
 logEvent(db,'usage_unavailable',{reason},{execution_id:executionId});
 return recordUsage(db,executionId,{provider,model_id:modelId,tokens,methods,source:{kind:'cli_result',dedupe_key:`unavailable:${executionId}`,session_id:null,cumulative:false},provider_reported_usd:null},billing);
}
// 単価を後から登録した場合などに、API相当額が未計算の記録を登録簿の単価で計算し直す（トークン数は変えない）。
export function repriceUsage(db:DB):{updated:number}{
 const models=loadRegistry().models;let updated=0;
 const rows=db.prepare('SELECT usage_id,provider,model_id,input_total,input_uncached,cache_read,cache_write,output_total,reasoning,total FROM usage WHERE api_equivalent_usd IS NULL AND total IS NOT NULL').all() as (Tokens&{usage_id:string;provider:string;model_id:string|null})[];
 for(const r of rows){const m=models.find(x=>x.provider===r.provider&&x.model_id===r.model_id);const usd=estimateApiUsd(r,m);if(usd===null)continue;
  db.prepare("UPDATE usage SET api_equivalent_usd=?,api_equivalent_method='estimated' WHERE usage_id=?").run(usd,r.usage_id);updated++}
 return {updated};
}
// 実行の計測状態: 入力合計と出力合計が実測ならmeasured、推定を含めばpartial、どちらも取れなければunavailable、記録なしはmissing。
export function meteringOf(db:DB,executionId:string):MeteringStatus{
 const rows=db.prepare('SELECT methods_json FROM usage WHERE execution_id=?').all(executionId) as {methods_json:string}[];
 if(!rows.length)return 'missing';
 const ms=rows.map(r=>JSON.parse(r.methods_json) as Methods);
 const core=(m:Methods)=>[m.input_total,m.output_total];
 const real=ms.filter(m=>!core(m).includes('unavailable'));
 if(!real.length)return 'unavailable';
 return real.every(m=>core(m).every(x=>x==='measured'))&&real.length===ms.length?'measured':'partial';
}
export function refreshMetering(db:DB,executionId:string){
 const row=db.prepare('SELECT metering_status FROM executions WHERE execution_id=?').get(executionId) as {metering_status:string}|undefined;
 if(!row||row.metering_status==='not_applicable')return;
 db.prepare('UPDATE executions SET metering_status=?,updated_at=? WHERE execution_id=?').run(meteringOf(db,executionId),now(),executionId);
}

// 追記されるJSONLを前回の位置から読む。完全な行だけを返し、次の開始位置を返す。
export function readJsonlFrom(path:string,offset:number):{records:Record<string,unknown>[];next:number}{
 if(!existsSync(path))return {records:[],next:offset};
 const size=statSync(path).size;if(size<offset)offset=0;
 if(size===offset)return {records:[],next:offset};
 const fd=openSync(path,'r');const buf=Buffer.alloc(size-offset);readSync(fd,buf,0,buf.length,offset);closeSync(fd);
 const end=buf.lastIndexOf(0x0a);if(end<0)return {records:[],next:offset};
 const records:Record<string,unknown>[]=[];
 for(const line of buf.subarray(0,end).toString('utf8').split('\n')){if(!line.trim())continue;try{records.push(JSON.parse(line))}catch{/* 書込み途中の行は次回 */}}
 return {records,next:offset+end+1};
}
// Claude Codeのトランスクリプト（メイン・サブエージェント）から、メッセージID単位で使用量を取り出す。
// 同じメッセージはコンテンツブロックごとに複数行に出るため、message.idで1件にまとめる。本文は読まない。
export function claudeTranscriptUsage(records:Record<string,unknown>[],opts:{sessionId:string;skipSidechain:boolean}):NormalizedUsage[]{
 const byId=new Map<string,NormalizedUsage>();
 for(const r of records){
  if(r.type!=='assistant'||(opts.skipSidechain&&r.isSidechain===true))continue;
  const m=r.message as Record<string,unknown>|undefined,u=m?.usage as Record<string,unknown>|undefined;
  if(!m||!u||typeof m.id!=='string'||m.model==='<synthetic>')continue;
  const n=fromAnthropic(u);
  const prev=byId.get(m.id);
  if(prev&&(prev.tokens.output_total??0)>=(n.tokens.output_total??0))continue;
  byId.set(m.id,{provider:'claude',model_id:typeof m.model==='string'?m.model:null,...n,source:{kind:'transcript',dedupe_key:`claude:msg:${m.id}`,session_id:opts.sessionId,cumulative:false},provider_reported_usd:null});
 }
 return [...byId.values()];
}
// Codexのrolloutの token_usage_record（応答ごとの使用量）を取り出す。response_idで重複を除く。
export function codexRolloutUsage(records:Record<string,unknown>[]):{usage:NormalizedUsage[];meta:{thread_id:string|null;parent_thread_id:string|null;model:string|null;plan_type:string|null;rate_used_percent:number|null}}{
 const out:NormalizedUsage[]=[];let model:string|null=null,thread:string|null=null,parent:string|null=null,plan:string|null=null,used:number|null=null;
 for(const r of records){
  const p=r.payload as Record<string,unknown>|undefined;if(!p)continue;
  if(r.type==='session_meta'){thread=(p.id as string)??thread;parent=(p.parent_thread_id as string)??parent}
  if(r.type==='turn_context'&&typeof p.model==='string')model=p.model;
  if(r.type==='event_msg'&&p.type==='token_count'){const rl=p.rate_limits as Record<string,unknown>|undefined;plan=(rl?.plan_type as string)??plan;const pr=rl?.primary as Record<string,unknown>|undefined;if(typeof pr?.used_percent==='number')used=pr.used_percent}
  if(r.type==='token_usage_record'&&p.usage){
   const key=`codex:resp:${p.thread_id}:${p.response_id??`${p.turn_id}:${r.ordinal}`}`;
   out.push({provider:'codex',model_id:model,...fromOpenAI(p.usage as Record<string,unknown>),source:{kind:'rollout',dedupe_key:key,session_id:(p.thread_id as string)??null,cumulative:false},provider_reported_usd:null});
  }
 }
 return {usage:out,meta:{thread_id:thread,parent_thread_id:parent,model,plan_type:plan,rate_used_percent:used}};
}

// 集計（モデル別・タスク種別別・製品別）。費用はAPI相当額の推定で、購読枠の実請求額ではない。
export type Summary={group:string;executions:number;usage_rows:number;input_total:number;cache_read:number;cache_write:number;output_total:number;reasoning:number;total:number;api_equivalent_usd:number|null;unmetered:number};
export function summarize(db:DB,by:'model'|'task_type'|'provider'|'initiator',since?:string):Summary[]{
 const col={model:"COALESCE(e.provider,'?')||'/'||COALESCE(e.model_id,'?')",task_type:'e.task_type',provider:"COALESCE(e.provider,'?')",initiator:'e.initiator'}[by];
 const rows=db.prepare(`SELECT ${col} AS grp,COUNT(DISTINCT e.execution_id) AS executions,COUNT(u.usage_id) AS usage_rows,
  COALESCE(SUM(u.input_total),0) AS input_total,COALESCE(SUM(u.cache_read),0) AS cache_read,COALESCE(SUM(u.cache_write),0) AS cache_write,COALESCE(SUM(u.output_total),0) AS output_total,
  COALESCE(SUM(u.reasoning),0) AS reasoning,COALESCE(SUM(u.total),0) AS total,SUM(u.api_equivalent_usd) AS api_usd,
  COUNT(DISTINCT CASE WHEN e.metering_status IN ('missing','unavailable') AND e.status NOT IN ('rejected','planned','approved') THEN e.execution_id END) AS unmetered
  FROM executions e LEFT JOIN usage u ON u.execution_id=e.execution_id WHERE (? IS NULL OR e.updated_at>=?) GROUP BY grp ORDER BY total DESC`).all(since??null,since??null) as Record<string,number|string|null>[];
 return rows.map(r=>({group:String(r.grp),executions:Number(r.executions),usage_rows:Number(r.usage_rows),input_total:Number(r.input_total),cache_read:Number(r.cache_read),cache_write:Number(r.cache_write),output_total:Number(r.output_total),reasoning:Number(r.reasoning),total:Number(r.total),api_equivalent_usd:r.api_usd===null?null:Math.round(Number(r.api_usd)*1e6)/1e6,unmetered:Number(r.unmetered)}));
}
// 親子をたどって子孫の使用量を合計する（子は自分の実行に記録されるため二重計上しない）。
export function treeUsage(db:DB,executionId:string){
 return db.prepare(`WITH RECURSIVE tree(id) AS (SELECT ? UNION ALL SELECT e.execution_id FROM executions e JOIN tree t ON e.parent_execution_id=t.id)
  SELECT COUNT(DISTINCT t.id) AS executions,COALESCE(SUM(u.total),0) AS total,SUM(u.api_equivalent_usd) AS api_usd FROM tree t LEFT JOIN usage u ON u.execution_id=t.id`).get(executionId) as {executions:number;total:number;api_usd:number|null};
}
export {TOKEN_KEYS};
