// 実行承認（HMAC-SHA256）。鍵はリポジトリ外に置き、Gateway（とHookの子タスク発行）だけが署名する。
// 同じOSユーザーのプロセスは鍵ファイルを読めるため、AIによる偽造を完全には防げない。
// Hookで鍵・DBへの直接アクセスを拒否し、1回限りの使用とDB照合で偽造・再利用を検知する（docs/agent-routing/architecture.md）。
import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {chmodSync,existsSync,mkdirSync,readFileSync,statSync,writeFileSync} from 'node:fs';
import {fail,newId,now,paths,sha256,type Initiator,type Provider} from './config.ts';
import {validate} from './schema.ts';
import type {DB} from '../telemetry/db.ts';

export type Approval={v:1;approval_id:string;execution_id:string;decision_id:string;task_id:string;provider:Provider;model_id:string|null;reasoning_level:string|null;initiator:Initiator;issuer:'gateway'|'hook'|'human';issued_at:string;expires_at:string;nonce:string};
export class ApprovalError extends Error{}

export function ensureKey():Buffer{
 const {keyDir,key}=paths();
 if(!existsSync(key)){mkdirSync(keyDir,{recursive:true,mode:0o700});writeFileSync(key,randomBytes(32).toString('hex')+'\n',{mode:0o600,flag:'wx'})}
 return loadKey();
}
export function loadKey():Buffer{
 const {key}=paths();
 if(!existsSync(key))throw new ApprovalError(`承認鍵がありません: ${key}（agentctl init で作成）`);
 const mode=statSync(key).mode&0o777;
 if(mode&0o077){chmodSync(key,0o600);if(statSync(key).mode&0o077)throw new ApprovalError('承認鍵の権限が広すぎます（0600にしてください）')}
 const hex=readFileSync(key,'utf8').trim();
 if(!/^[a-f0-9]{64}$/.test(hex))throw new ApprovalError('承認鍵の形式が不正です');
 return Buffer.from(hex,'hex');
}
const b64=(s:string)=>Buffer.from(s).toString('base64url');
const sign=(key:Buffer,body:string)=>createHmac('sha256',key).update(body).digest('hex');

export function mint(db:DB,input:Omit<Approval,'v'|'approval_id'|'issued_at'|'expires_at'|'nonce'>,ttlSeconds:number):{token:string;approval:Approval}{
 const key=ensureKey(),issued=new Date();
 const approval=validate<Approval>('approval',{v:1,approval_id:newId('apr'),...input,issued_at:issued.toISOString(),expires_at:new Date(issued.getTime()+ttlSeconds*1000).toISOString(),nonce:randomBytes(16).toString('hex')});
 const body=b64(JSON.stringify(approval)),token=`${body}.${sign(key,body)}`;
 db.prepare('INSERT INTO approvals(approval_id,execution_id,decision_id,provider,model_id,initiator,issuer,issued_at,expires_at,consumed_at,token_sha256) VALUES(?,?,?,?,?,?,?,?,?,NULL,?)')
  .run(approval.approval_id,approval.execution_id,approval.decision_id,approval.provider,approval.model_id,approval.initiator,approval.issuer,approval.issued_at,approval.expires_at,sha256(token));
 return {token,approval};
}
// 署名・有効期限・DBの発行記録・期待値（実行ID・モデル・推論レベル・実行主体）を全て照合する。1つでも欠ければ拒否（Fail Closed）。
export function verify(db:DB,token:string|undefined|null,expect:{execution_id?:string;provider?:Provider;model_id?:string|null;reasoning_level?:string|null;initiator?:Initiator;allowConsumed?:boolean}):Approval{
 if(!token||typeof token!=='string')throw new ApprovalError('承認情報がありません');
 const [body,sig,...rest]=token.split('.');
 if(!body||!sig||rest.length||!/^[a-f0-9]{64}$/.test(sig))throw new ApprovalError('承認情報の形式が不正です');
 const expected=Buffer.from(sign(loadKey(),body),'hex');
 if(!timingSafeEqual(expected,Buffer.from(sig,'hex')))throw new ApprovalError('承認情報の署名が一致しません');
 let approval:Approval;
 try{approval=validate<Approval>('approval',JSON.parse(Buffer.from(body,'base64url').toString()))}catch(e){throw new ApprovalError(`承認情報の本体が不正です: ${(e as Error).message}`)}
 if(Date.parse(approval.expires_at)<=Date.now())throw new ApprovalError(`承認情報の有効期限切れ: ${approval.expires_at}`);
 const row=db.prepare('SELECT * FROM approvals WHERE approval_id=?').get(approval.approval_id) as Record<string,unknown>|undefined;
 if(!row||row.token_sha256!==sha256(token))throw new ApprovalError('承認情報がDBの発行記録と一致しません');
 if(row.consumed_at&&!expect.allowConsumed)throw new ApprovalError(`承認情報は使用済みです: ${row.consumed_at}`);
 const mismatch=(k:keyof Approval,v:unknown)=>v!==undefined&&approval[k]!==v;
 for(const k of ['execution_id','provider','model_id','reasoning_level','initiator'] as const){if(mismatch(k,expect[k]))throw new ApprovalError(`承認情報と実行内容が異なります: ${k}=${String(expect[k])}（承認: ${String(approval[k])}）`)}
 return approval;
}
export function consume(db:DB,approval:Approval){
 const r=db.prepare('UPDATE approvals SET consumed_at=? WHERE approval_id=? AND consumed_at IS NULL').run(now(),approval.approval_id);
 if(r.changes!==1)throw new ApprovalError('承認情報は使用済みです');
}
// 有料API等の人による承認。TTYのある端末からの対話確認を必須にする（AIのツール実行は通常TTYを持たない）。
export function recordHumanApproval(db:DB,decisionId:string,approvedBy:string,reason:string,ttlSeconds=3600){
 if(!/^rdc_[0-9a-z]{10,40}$/.test(decisionId))fail('判断IDが不正です');
 const at=new Date();
 db.prepare('INSERT INTO human_approvals(decision_id,approved_by,reason,approved_at,expires_at) VALUES(?,?,?,?,?) ON CONFLICT(decision_id) DO UPDATE SET approved_by=excluded.approved_by,reason=excluded.reason,approved_at=excluded.approved_at,expires_at=excluded.expires_at')
  .run(decisionId,approvedBy,reason,at.toISOString(),new Date(at.getTime()+ttlSeconds*1000).toISOString());
}
export function hasHumanApproval(db:DB,decisionId:string):boolean{
 const row=db.prepare('SELECT expires_at FROM human_approvals WHERE decision_id=?').get(decisionId) as {expires_at:string}|undefined;
 return !!row&&Date.parse(row.expires_at)>Date.now();
}
