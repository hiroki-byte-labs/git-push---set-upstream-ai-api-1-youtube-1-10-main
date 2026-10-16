// L0（LLMを使わないプログラム）と、テスト専用の模擬CLI。
import {fileURLToPath} from 'node:url';
import {classifyFailure,run,type Adapter} from './types.ts';

export const programAdapter:Adapter={provider:'local',async execute(req){
 const argv=req.task.input.program?.argv;
 if(!argv?.length)return {status:'failed',failure_cause:'input',message:'input.programがない',exit_code:null,usage:[],usage_mode:'delta',usage_unavailable_reason:null,reported_models:[],model_check:'verified',session_id:null,output_text:null};
 const s=await run(argv,{cwd:req.workdir,env:req.env,stdin:null,timeoutMs:req.timeoutMs,runDir:req.runDir});
 const ok=s.code===0&&!s.timedOut;
 return {status:ok?'completed':'failed',failure_cause:ok?null:(s.timedOut?'transient':classifyFailure(s.stderr,s)==='unknown'?'input':classifyFailure(s.stderr,s)),message:ok?null:s.stderr.slice(0,500),exit_code:s.code,usage:[],usage_mode:'delta',usage_unavailable_reason:null,reported_models:[],model_check:'verified',session_id:null,output_text:s.stdout.slice(0,2000)};
}};
// 模擬CLIは別プロセスで起動し、子セッションのHookと同じ承認照合（mock-cli.ts）を通す。
export const mockAdapter:Adapter={provider:'mock',async execute(req){
 const cli=fileURLToPath(new URL('./mock-cli.ts',import.meta.url));
 const s=await run([process.execPath,cli,'--model',req.selected.model_id??''],{cwd:req.workdir,env:{...req.env,AGENTCTL_MOCK_SPEC:JSON.stringify(req.task.input.mock??{})},stdin:req.prompt,timeoutMs:req.timeoutMs,runDir:req.runDir});
 let r:Record<string,unknown>={};try{r=JSON.parse(s.stdout.trim().split('\n').at(-1)??'{}')}catch{/* 下で失敗扱い */}
 const {fromAnthropic}=await import('../telemetry/normalize.ts');
 const usage=r.usage?[{provider:'mock' as const,model_id:String(r.model??req.selected.model_id),...fromAnthropic(r.usage as Record<string,unknown>),source:{kind:'test_fixture' as const,dedupe_key:`mock:${r.session_id??req.execution_id}`,session_id:String(r.session_id??''),cumulative:false},provider_reported_usd:null}]:[];
 const ok=s.code===0&&r.status==='success';
 return {status:ok?'completed':'failed',failure_cause:ok?null:((r.cause as never)??classifyFailure(s.stderr,s)),message:ok?null:String(r.message??s.stderr).slice(0,500),exit_code:s.code,usage,usage_mode:'delta',
  usage_unavailable_reason:usage.length?null:'模擬CLIが使用量を返さない',reported_models:r.model?[String(r.model)]:[],model_check:!r.model?'unverifiable':r.model===req.selected.model_id?'verified':'mismatch',session_id:typeof r.session_id==='string'?r.session_id:null,output_text:typeof r.output==='string'?r.output:null};
}};
