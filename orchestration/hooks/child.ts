// 子セッション側の検証。Gatewayが起動したCLIは環境変数で実行ID・承認を受け取り、
// そのセッションのHook（または模擬CLI）が、承認と実際のモデルを照合する。
import {loadRegistry,type Provider} from '../gateway/config.ts';
import {verify,ApprovalError} from '../gateway/approval.ts';
import type {DB} from '../telemetry/db.ts';

// 製品が報告するモデル名を登録簿のIDへ寄せる（別名、[1m]等の接尾辞、Antigravityの表示名）。
export function normalizeModel(provider:Provider,reported:string|null|undefined):string|null{
 if(!reported)return null;
 let m=reported.trim().replace(/\[[^\]]*\]$/,'');
 const reg=loadRegistry().models.filter(x=>x.provider===provider);
 if(reg.some(x=>x.model_id===m))return m;
 const alias=reg.find(x=>Object.values(x.aliases).includes(m));if(alias)return alias.model_id;
 const slug=m.toLowerCase().replace(/[\s()]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'');
 return reg.find(x=>x.model_id===slug)?.model_id??m;
}
export type ChildCheck={managed:boolean;ok:boolean;reason:string;execution_id:string|null};
export function verifyChild(db:DB,env:NodeJS.ProcessEnv,actual:{provider:Provider;model:string|null|undefined}):ChildCheck{
 const exe=env.AGENTCTL_EXECUTION_ID??null,token=env.AGENTCTL_APPROVAL??null;
 if(!exe&&!token)return {managed:false,ok:true,reason:'Gateway外のセッション',execution_id:null};
 if(!exe||!token)return {managed:true,ok:false,reason:'承認の環境変数が不完全',execution_id:exe};
 try{
  const a=verify(db,token,{execution_id:exe,allowConsumed:true});
  if(a.provider!==actual.provider&&a.provider!=='mock')return {managed:true,ok:false,reason:`承認の製品 ${a.provider} と実行中の製品 ${actual.provider} が異なる`,execution_id:exe};
  const m=normalizeModel(actual.provider,actual.model);
  if(m===null)return {managed:true,ok:true,reason:'製品がモデル名を通知しないため照合不能（Gatewayの起動引数で固定）',execution_id:exe};
  if(m!==a.model_id)return {managed:true,ok:false,reason:`承認モデル ${a.model_id} と実際のモデル ${m} が異なる`,execution_id:exe};
  return {managed:true,ok:true,reason:'承認と実モデルが一致',execution_id:exe};
 }catch(e){return {managed:true,ok:false,reason:e instanceof ApprovalError?e.message:String(e),execution_id:exe}}
}
