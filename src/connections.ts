// 台本・音声・映像の接続抽象と模擬接続（T024）。模擬は実API成功ではない。
import {randomUUID} from 'node:crypto';
export type Domain='script'|'audio'|'visual';
// mode: mock=外部APIの模擬、local=手元で完結する処理（描画など）、real=実API。job.jsonで区別する。
export type Mode='mock'|'local'|'real';
export type Usage={domain:Domain;provider:string;model:string;mode:Mode;requestId:string;inputUnits:number;outputUnits:number;costUsd:number;attempts:number};
// 失敗した試行の費用（T098）。none=確実に未処理（課金なし）と接続が断定できる場合だけ。unknown=処理されたか分からない。
// 429/5xx等のコードだけでは無料と断定しないため、既定はunknown。providerRequestIdは実APIが返した依頼ID（あれば）。
export type FailureCharge='none'|'unknown';
export class ConnError extends Error{code:'RATE_LIMIT'|'SERVER'|'SAFETY'|'FATAL';charge:FailureCharge;providerRequestId?:string;
 constructor(code:'RATE_LIMIT'|'SERVER'|'SAFETY'|'FATAL',msg:string,opts:{charge?:FailureCharge;providerRequestId?:string}={}){super(msg);this.code=code;this.charge=opts.charge??'unknown';this.providerRequestId=opts.providerRequestId}}
// 試行の記録（T098）。attemptIdはこのリポジトリが付けるローカル識別子、providerRequestIdは接続先の依頼ID。
// charge: confirmed=成功で費用確定、none=未処理で費用0、unknown=費用不明（予約を保持）、reconciled=照合で費用確定。
export type Attempt={attemptId:string;domain:Domain;provider:string;mode:Mode;attempt:number;at:string;estimateUsd:number;outcome:'success'|'failed';charge:'confirmed'|'none'|'unknown'|'reconciled';costUsd?:number;providerRequestId?:string;error?:string};
// reconcile: 費用不明の試行について、接続先の記録から費用を照合する（任意）。分からなければundefined。
export interface Connection<I,O>{domain:Domain;provider:string;model:string;mode:Mode;call(input:I):Promise<{output:O;usage:Omit<Usage,'attempts'>}>;reconcile?(attempt:Attempt):Promise<{costUsd:number}|undefined>}
const RETRYABLE=new Set(['RATE_LIMIT','SERVER']);
// 有限再試行。SAFETY/FATALは再試行しない。maxAttempts超過で最後のエラーを投げる。
export async function callWithRetry<I,O>(c:Connection<I,O>,input:I,maxAttempts=3):Promise<{output:O;usage:Usage}>{
 if(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>10)throw Error('maxAttemptsが不正');
 let last:unknown;
 for(let n=1;n<=maxAttempts;n++){try{const r=await c.call(input);return {output:r.output,usage:{...r.usage,attempts:n}}}catch(e){last=e;if(!(e instanceof ConnError)||!RETRYABLE.has(e.code))throw e}}
 throw last;
}
// 模擬接続: failures に積んだ順にエラーを返し、尽きたら固定出力を返す。費用0、modeは必ずmock。
export class MockConnection<I,O> implements Connection<I,O>{
 mode:'mock'='mock';calls=0;domain:Domain;provider:string;model:string;out:O;failures:ConnError[];
 constructor(domain:Domain,provider:string,model:string,out:O,failures:ConnError[]=[]){this.domain=domain;this.provider=provider;this.model=model;this.out=out;this.failures=failures}
 async call(_i:I){const f=this.failures.shift();this.calls++;if(f)throw f;return {output:this.out,usage:{domain:this.domain,provider:this.provider,model:this.model,mode:this.mode,requestId:`mock-${this.provider}-${this.calls}`,inputUnits:0,outputUnits:0,costUsd:0}}}
}

// 既存の手元処理（固定台本の読込、確認音の生成など）を接続として包む（T024）。費用0、依頼IDは連番。
export class LocalConnection<I,O> implements Connection<I,O>{
 calls=0;domain:Domain;provider:string;model:string;mode:Mode;run:(input:I)=>Promise<{output:O;inputUnits?:number;outputUnits?:number}>;
 constructor(domain:Domain,provider:string,mode:'mock'|'local',run:(input:I)=>Promise<{output:O;inputUnits?:number;outputUnits?:number}>,model='none'){this.domain=domain;this.provider=provider;this.mode=mode;this.run=run;this.model=model}
 // 手元処理は外部へ依頼しないため、失敗しても費用は発生しない（charge=none）。
 async call(input:I){this.calls++;let r;try{r=await this.run(input)}catch(e){if(e instanceof ConnError)e.charge='none';throw e}return {output:r.output,usage:{domain:this.domain,provider:this.provider,model:this.model,mode:this.mode,requestId:`${this.mode}-${this.provider}-${this.calls}`,inputUnits:r.inputUnits??0,outputUnits:r.outputUnits??0,costUsd:0}}}
}
// 見積り→予約→呼出し→精算を試行ごとに行う（T024、T098）。上限を超える見積りは呼び出す前に拒否する。
// 費用不明の失敗は予約を保持し（照合で判明すれば一度だけ精算）、保持額を含めて次の再送を判定する。
// attemptsには全試行（失敗を含む）を追記する。呼出側はjob.jsonへ保存する。
export async function callWithBudget<I,O>(c:Connection<I,O>,input:I,budget:{reserve(n:number):void;settle(e:number,a:number):void;release(e:number):void;holdUnknown(e:number):void;resolveUnknown(e:number,a:number):void},estimateUsd:number,usage:Usage[],maxAttempts=3,attempts:Attempt[]=[]){
 if(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>10)throw Error('maxAttemptsが不正');
 for(let n=1;;n++){
  try{budget.reserve(estimateUsd)}
  catch(e){const unknown=attempts.filter(a=>a.provider===c.provider&&a.charge==='unknown').length;if(n===1||!unknown)throw e;throw Error(`再送を中止: 前の試行のうち${unknown}件が費用不明のため、再送すると上限を超える（${String((e as Error).message)}）`)}
  const rec:Attempt={attemptId:`att-${randomUUID().slice(0,8)}`,domain:c.domain,provider:c.provider,mode:c.mode,attempt:n,at:new Date().toISOString(),estimateUsd,outcome:'failed',charge:'unknown'};
  attempts.push(rec);
  try{
   const r=await c.call(input);
   budget.settle(estimateUsd,r.usage.costUsd);
   Object.assign(rec,{outcome:'success',charge:'confirmed',costUsd:r.usage.costUsd,providerRequestId:r.usage.requestId});
   usage.push({...r.usage,attempts:n});
   return r.output;
  }catch(e){
   rec.error=String((e as Error)?.message??e);
   // 手元以外（real）で接続が分類しない例外は費用不明とする。
   const charge:FailureCharge=e instanceof ConnError?e.charge:c.mode==='real'?'unknown':'none';
   if(e instanceof ConnError&&e.providerRequestId)rec.providerRequestId=e.providerRequestId;
   if(charge==='none'){budget.release(estimateUsd);Object.assign(rec,{charge:'none',costUsd:0})}
   else{
    budget.holdUnknown(estimateUsd);
    const found=c.reconcile?await c.reconcile(rec).catch(()=>undefined):undefined;
    if(found){budget.resolveUnknown(estimateUsd,found.costUsd);Object.assign(rec,{charge:'reconciled',costUsd:found.costUsd})}
   }
   if(!(e instanceof ConnError)||!RETRYABLE.has(e.code)||n>=maxAttempts)throw e;
  }
 }
}
