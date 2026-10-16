// Gemini API（generateContent）。従量課金のため、方針で有効化され人の承認がある場合だけGatewayから呼ばれる。
// キーは環境変数GEMINI_API_KEYからだけ読み、ログ・DB・URLへ出さない（ヘッダーで送る）。
import {writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {fromGemini} from '../telemetry/normalize.ts';
import {classifyFailure,type Adapter,type AdapterResult} from './types.ts';

type Fetch=(url:string,init:{method:string;headers:Record<string,string>;body:string;signal:AbortSignal})=>Promise<{ok:boolean;status:number;text():Promise<string>}>;
export function geminiAdapter(fetchImpl:Fetch=fetch as unknown as Fetch):Adapter{return {provider:'gemini-api',async execute(req):Promise<AdapterResult>{
 const m=req.selected.model_id!,key=req.env.GEMINI_API_KEY;
 const none=(cause:AdapterResult['failure_cause'],message:string):AdapterResult=>({status:'failed',failure_cause:cause,message,exit_code:null,usage:[],usage_mode:'delta',usage_unavailable_reason:message,reported_models:[],model_check:'unverifiable',session_id:null,output_text:null});
 if(!key)return none('auth','GEMINI_API_KEYが未設定');
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),req.timeoutMs);
 try{
  const res=await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},body:JSON.stringify({contents:[{role:'user',parts:[{text:req.prompt??''}]}]}),signal:ctl.signal});
  const text=await res.text();mkdirSync(req.runDir,{recursive:true});writeFileSync(join(req.runDir,'response.json'),text);
  let body:Record<string,unknown>={};try{body=JSON.parse(text)}catch{/* 非JSON */}
  const meta=body.usageMetadata as Record<string,unknown>|undefined,n=meta?fromGemini(meta):null,version=typeof body.modelVersion==='string'?body.modelVersion:null;
  const id=typeof body.responseId==='string'?body.responseId:req.execution_id;
  const out=((body.candidates as {content?:{parts?:{text?:string}[]}}[]|undefined)?.[0]?.content?.parts??[]).map(p=>p.text??'').join('');
  return {status:res.ok?'completed':'failed',failure_cause:res.ok?null:classifyFailure(`${res.status} ${text.slice(0,300)}`,{code:res.status}),message:res.ok?null:`HTTP ${res.status}`,exit_code:res.status,
   usage:n?[{provider:'gemini-api',model_id:m,tokens:n.tokens,methods:n.methods,source:{kind:'api_response',dedupe_key:`gemini:resp:${id}`,session_id:null,cumulative:false},provider_reported_usd:null,note:n.note}]:[],
   usage_mode:'delta',usage_unavailable_reason:n?null:'usageMetadataがない',reported_models:version?[version]:[],model_check:!version?'unverifiable':version.startsWith(m)?'verified':'mismatch',session_id:null,output_text:out||null};
 }catch(e){return none(classifyFailure(String(e),{timedOut:ctl.signal.aborted}),String(e).slice(0,300))}finally{clearTimeout(timer)}
}}}
