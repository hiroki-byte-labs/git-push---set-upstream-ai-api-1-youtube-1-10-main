// Codex CLI（codex exec --json）。turn.completed.usageはメインスレッドの累積値でサブエージェントを含まないため、
// 実行後にrollout（~/.codex/sessions）の応答ごとのtoken_usage_recordを優先して読み、子スレッドも親子関係つきで集める。
import {existsSync,readdirSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fromOpenAI} from '../telemetry/normalize.ts';
import {codexRolloutUsage,readJsonlFrom} from '../telemetry/monitor.ts';
import {classifyFailure,run,type Adapter,type AdapterResult} from './types.ts';

export function parseCodexEvents(stdout:string,stderr:string,s:{code:number|null;timedOut:boolean},model:string):AdapterResult{
 let thread:string|null=null,usage:Record<string,unknown>|null=null,error:string|null=null,last:string|null=null;
 for(const line of stdout.split('\n')){
  if(!line.trim())continue;let e:Record<string,unknown>;try{e=JSON.parse(line)}catch{continue}
  if(e.type==='thread.started')thread=String(e.thread_id);
  if(e.type==='turn.completed'&&e.usage)usage=e.usage as Record<string,unknown>;
  if(e.type==='turn.failed'||e.type==='error')error=JSON.stringify(e.error??e.message??e).slice(0,500);
  const item=e.item as Record<string,unknown>|undefined;if(e.type==='item.completed'&&item?.type==='agent_message'&&typeof item.text==='string')last=item.text;
 }
 const failed=!!error||s.code!==0;
 return {status:failed?'failed':'completed',failure_cause:failed?classifyFailure((error??'')+stderr,s):null,message:failed?(error??stderr.slice(0,500)):null,exit_code:s.code,
  usage:usage?[{provider:'codex',model_id:model,...fromOpenAI(usage),source:{kind:'cli_event',dedupe_key:`codex:thread:${thread}`,session_id:thread,cumulative:true},provider_reported_usd:null}]:[],
  usage_mode:'cumulative',usage_unavailable_reason:usage?null:'turn.completed.usageがない',reported_models:[],model_check:'unverifiable',session_id:thread,output_text:last};
}
// rolloutファイルを探す（スレッドIDがファイル名に入る）。本文は読まず、使用量・モデル・親子関係だけを取り出す。
export function findRollouts(threadId:string,root=join(process.env.CODEX_HOME??join(homedir(),'.codex'),'sessions')):string[]{
 const out:string[]=[];if(!existsSync(root))return out;
 const walk=(d:string,depth:number)=>{for(const n of readdirSync(d,{withFileTypes:true})){const p=join(d,n.name);if(n.isDirectory()&&depth<3)walk(p,depth+1);else if(n.isFile()&&n.name.endsWith('.jsonl')&&n.name.includes(threadId))out.push(p)}};
 walk(root,0);return out;
}
export function collectCodexThread(threadId:string,model:string,root?:string):{usage:AdapterResult['usage'];models:string[];children:string[]}{
 const files=findRollouts(threadId,root);if(!files.length)return {usage:[],models:[],children:[]};
 const {records}=readJsonlFrom(files[0]!,0);const parsed=codexRolloutUsage(records);
 return {usage:parsed.usage.map(u=>({...u,model_id:u.model_id??model})),models:parsed.meta.model?[parsed.meta.model]:[],children:[]};
}
export const codexAdapter:Adapter={provider:'codex',async execute(req){
 const m=req.selected.model_id!;
 const argv=['codex','exec','--json','-m',m,'-s',req.task.input.permission_profile==='read_only'?'read-only':'workspace-write','-C',req.workdir];
 if(req.selected.reasoning_level&&req.selected.reasoning_level!=='none')argv.push('-c',`model_reasoning_effort="${req.selected.reasoning_level}"`);
 argv.push('-');
 const s=await run(argv,{cwd:req.workdir,env:req.env,stdin:req.prompt,timeoutMs:req.timeoutMs,runDir:req.runDir});
 const r=parseCodexEvents(s.stdout,s.stderr,s,m);
 if(r.session_id){
  const t=collectCodexThread(r.session_id,m);
  if(t.usage.length){r.usage=t.usage;r.usage_mode='delta'}
  if(t.models.length){r.reported_models=t.models;r.model_check=t.models.includes(m)?'verified':'mismatch'}
 }
 return r;
}};
