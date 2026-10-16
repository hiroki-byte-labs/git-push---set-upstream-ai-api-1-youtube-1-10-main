import {test} from 'node:test';
import assert from 'node:assert/strict';
import {statSync,writeFileSync} from 'node:fs';
import {sandbox} from './helpers.ts';
import {consume,mint,verify,ApprovalError} from '../gateway/approval.ts';
import {paths} from '../gateway/config.ts';

const {db}=sandbox();
const base={execution_id:'exe_0000000000ab',decision_id:'rdc_0000000000ab',task_id:'tsk_0000000000ab',provider:'codex' as const,model_id:'gpt-6-luna',reasoning_level:'low',initiator:'claude' as const,issuer:'gateway' as const};

test('承認は実行ID・モデル・推論レベル・実行主体に紐付き、1回だけ使える', ()=>{
 const {token}=mint(db,base,60);
 assert.equal(statSync(paths().key).mode&0o777,0o600);
 const a=verify(db,token,{execution_id:base.execution_id,provider:'codex',model_id:'gpt-6-luna',reasoning_level:'low',initiator:'claude'});
 consume(db,a);
 assert.throws(()=>verify(db,token,{execution_id:base.execution_id}),/使用済み/);
 assert.throws(()=>consume(db,a),/使用済み/);
});
test('承認と異なるモデル・実行ID・実行主体は拒否（Fail Closed）', ()=>{
 const {token}=mint(db,base,60);
 assert.throws(()=>verify(db,token,{model_id:'gpt-6-astra'}),/model_id/);
 assert.throws(()=>verify(db,token,{execution_id:'exe_0000000000zz'}),/execution_id/);
 assert.throws(()=>verify(db,token,{initiator:'codex'}),/initiator/);
 assert.throws(()=>verify(db,token,{reasoning_level:'high'}),/reasoning_level/);
});
test('承認なし・改変・期限切れ・DBにない発行は拒否', ()=>{
 assert.throws(()=>verify(db,undefined,{}),ApprovalError);
 const {token}=mint(db,base,60);
 const [body,sig]=token.split('.');
 const forged=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(body!,'base64url').toString()),model_id:'gpt-6-astra'})).toString('base64url');
 assert.throws(()=>verify(db,`${forged}.${sig}`,{}),/署名/);
 assert.throws(()=>verify(db,`${body}.${'0'.repeat(64)}`,{}),/署名/);
 const old=mint(db,base,-1);
 assert.throws(()=>verify(db,old.token,{}),/有効期限/);
 const {token:t2,approval}=mint(db,base,60);
 db.prepare('DELETE FROM approvals WHERE approval_id=?').run(approval.approval_id);
 assert.throws(()=>verify(db,t2,{}),/発行記録/);
});
test('鍵がない・形式不正なら検証できない', ()=>{
 const {token}=mint(db,base,60);
 writeFileSync(paths().key,'broken\n',{mode:0o600});
 assert.throws(()=>verify(db,token,{}),/形式が不正/);
});
