// Claude Code CLI（claude -p --output-format json）。modelUsageはサブエージェントを含むモデル別合計、usageはメインのみ。
// total_cost_usdはクライアント側の推定で、購読利用者の請求額ではない（provider_reported_usdとして別保存）。
import {fromAnthropic} from '../telemetry/normalize.ts';
import {classifyFailure,lastJsonLine,run,type Adapter,type AdapterResult} from './types.ts';

export function parseClaudeResult(stdout:string,stderr:string,s:{code:number|null;timedOut:boolean},model:string):AdapterResult{
 const r=lastJsonLine(stdout);
 if(!r||r.type!=='result')return {status:'failed',failure_cause:classifyFailure(stderr+stdout,s),message:(stderr||stdout).slice(0,500)||'結果JSONなし',exit_code:s.code,usage:[],usage_mode:'delta',usage_unavailable_reason:'結果JSONを取得できない',reported_models:[],model_check:'unverifiable',session_id:null,output_text:null};
 const sid=typeof r.session_id==='string'?r.session_id:null,cost=typeof r.total_cost_usd==='number'?r.total_cost_usd:null;
 const mu=(r.modelUsage??r.model_usage) as Record<string,Record<string,unknown>>|undefined;
 const usage=mu&&Object.keys(mu).length
  ?Object.entries(mu).map(([m,u])=>({provider:'claude' as const,model_id:m,...fromAnthropic(u),source:{kind:'cli_result' as const,dedupe_key:`claude:result:${sid}:${m}`,session_id:sid,cumulative:false},provider_reported_usd:typeof u.costUSD==='number'?u.costUSD:null}))
  :r.usage?[{provider:'claude' as const,model_id:model,...fromAnthropic(r.usage as Record<string,unknown>),source:{kind:'cli_result' as const,dedupe_key:`claude:result:${sid}:main`,session_id:sid,cumulative:false},provider_reported_usd:cost}]:[];
 const reported=mu?Object.keys(mu):[];
 const failed=r.is_error===true||r.subtype!=='success';
 return {status:failed?'failed':'completed',failure_cause:failed?(r.subtype==='error_max_budget_usd'?'budget':classifyFailure(String(r.result??'')+stderr,s)):null,message:failed?String(r.result??r.subtype).slice(0,500):null,exit_code:s.code,
  usage,usage_mode:'delta',usage_unavailable_reason:usage.length?null:'結果JSONにusageがない',reported_models:reported,
  model_check:!reported.length?'unverifiable':reported.includes(model)?'verified':'mismatch',session_id:sid,output_text:typeof r.result==='string'?r.result:null};
}
export const claudeAdapter:Adapter={provider:'claude',async execute(req){
 const m=req.selected.model_id!;
 const argv=['claude','-p','--model',m,'--output-format','json','--permission-mode',req.task.input.permission_profile==='read_only'?'plan':'acceptEdits'];
 if(req.selected.reasoning_level&&req.selected.reasoning_level!=='none')argv.push('--effort',req.selected.reasoning_level);
 const s=await run(argv,{cwd:req.workdir,env:req.env,stdin:req.prompt,timeoutMs:req.timeoutMs,runDir:req.runDir});
 return parseClaudeResult(s.stdout,s.stderr,s,m);
}};
