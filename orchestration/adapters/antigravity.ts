// Antigravity CLI（agy -p --output-format json）。結果にモデルIDが含まれないため、実モデルの照合は
// 子セッションのHook（stdinのmodelName）で行う。使用量はusage{input,output,thinking,cache_read,total}。
import {fromAntigravity} from '../telemetry/normalize.ts';
import {classifyFailure,lastJsonLine,run,type Adapter,type AdapterResult} from './types.ts';

export function parseAgyResult(stdout:string,stderr:string,s:{code:number|null;timedOut:boolean},model:string):AdapterResult{
 const r=lastJsonLine(stdout);
 if(!r||!('status' in r))return {status:'failed',failure_cause:classifyFailure(stderr+stdout,s),message:(stderr||stdout).slice(0,500)||'結果JSONなし',exit_code:s.code,usage:[],usage_mode:'delta',usage_unavailable_reason:'結果JSONを取得できない',reported_models:[],model_check:'unverifiable',session_id:null,output_text:null};
 const conv=typeof r.conversation_id==='string'?r.conversation_id:null;
 const u=r.usage as Record<string,unknown>|undefined,n=u?fromAntigravity(u):null;
 const failed=r.status!=='SUCCESS'||s.code!==0;
 return {status:failed?'failed':'completed',failure_cause:failed?classifyFailure(JSON.stringify(r.error??'')+stderr,s):null,message:failed?JSON.stringify(r.error??r.status).slice(0,500):null,exit_code:s.code,
  usage:n?[{provider:'antigravity',model_id:model,tokens:n.tokens,methods:n.methods,source:{kind:'cli_result',dedupe_key:`agy:conv:${conv}:result`,session_id:conv,cumulative:false},provider_reported_usd:null,note:n.note}]:[],
  usage_mode:'delta',usage_unavailable_reason:n?null:'結果JSONにusageがない',reported_models:[],model_check:'unverifiable',session_id:conv,output_text:typeof r.response==='string'?r.response:null};
}
export const antigravityAdapter:Adapter={provider:'antigravity',async execute(req){
 const m=req.selected.model_id!;
 const argv=['agy','--output-format','json','--model',m,'--mode',req.task.input.permission_profile==='read_only'?'plan':'accept-edits','--print-timeout',`${Math.ceil(req.timeoutMs/1000)}s`,'-p',req.prompt??''];
 const s=await run(argv,{cwd:req.workdir,env:req.env,stdin:null,timeoutMs:req.timeoutMs+10000,runDir:req.runDir});
 return parseAgyResult(s.stdout,s.stderr,s,m);
}};
