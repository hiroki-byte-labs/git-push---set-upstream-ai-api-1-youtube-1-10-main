// 実行アダプタの共通部分。各製品の公式CLI（またはAPI）を、承認済みのモデルだけで起動する。
import {spawn} from 'node:child_process';
import {createWriteStream,mkdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import type {FailureCause,Provider} from '../gateway/config.ts';
import type {NormalizedUsage} from '../telemetry/normalize.ts';
import type {Selected,Task} from '../router/router.ts';

export type AdapterRequest={execution_id:string;task:Task&{task_id:string};selected:Selected;prompt:string|null;workdir:string;timeoutMs:number;env:NodeJS.ProcessEnv;runDir:string};
export type AdapterResult={
 status:'completed'|'failed';failure_cause:FailureCause|null;message:string|null;exit_code:number|null;
 usage:NormalizedUsage[];usage_mode:'delta'|'cumulative';usage_unavailable_reason:string|null;
 reported_models:string[];model_check:'verified'|'mismatch'|'unverifiable';session_id:string|null;output_text:string|null;
};
export interface Adapter{provider:Provider;execute(req:AdapterRequest):Promise<AdapterResult>}

// 子プロセスへ渡す環境変数。購読認証で実行する場合はAPIキーを除去し、勝手に従量課金へ切り替わらないようにする。
export const API_KEY_ENV=['ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','OPENAI_API_KEY','CODEX_API_KEY','CODEX_ACCESS_TOKEN','GEMINI_API_KEY','GOOGLE_API_KEY','GOOGLE_GENAI_USE_VERTEXAI'];
export function childEnv(base:NodeJS.ProcessEnv,authMode:string,extra:Record<string,string>):NodeJS.ProcessEnv{
 const env={...base};
 if(authMode!=='api_key')for(const k of API_KEY_ENV)delete env[k];
 return {...env,...extra};
}
export type Spawned={code:number|null;signal:string|null;timedOut:boolean;stdout:string;stderr:string};
// シェルを介さず起動し、出力はdata/runs/（Git管理外）へ保存する。プロンプトは標準入力で渡す。
export function run(argv:string[],opts:{cwd:string;env:NodeJS.ProcessEnv;stdin:string|null;timeoutMs:number;runDir:string}):Promise<Spawned>{
 mkdirSync(opts.runDir,{recursive:true});
 const outPath=join(opts.runDir,'stdout.txt'),errPath=join(opts.runDir,'stderr.txt');
 return new Promise(resolve=>{
  const child=spawn(argv[0]!,argv.slice(1),{cwd:opts.cwd,env:opts.env,stdio:['pipe','pipe','pipe']});
  const out=createWriteStream(outPath),err=createWriteStream(errPath);let timedOut=false;
  child.stdout.pipe(out);child.stderr.pipe(err);
  const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');setTimeout(()=>child.kill('SIGKILL'),5000).unref()},opts.timeoutMs);
  child.on('error',e=>{clearTimeout(timer);err.write(String(e));out.end();err.end(()=>resolve({code:null,signal:null,timedOut,stdout:'',stderr:String(e)}))});
  child.on('close',(code,signal)=>{clearTimeout(timer);let pending=2;const done=()=>{if(--pending)return;resolve({code,signal,timedOut,stdout:readFileSync(outPath,'utf8'),stderr:readFileSync(errPath,'utf8')})};out.end(done);err.end(done)});
  child.stdin.on('error',()=>{});child.stdin.end(opts.stdin??'');
 });
}
// 失敗原因の分類（エスカレーション判定に使う）。分からないものはunknownで停止させる。
export function classifyFailure(text:string,s:{timedOut?:boolean;code?:number|null}):FailureCause{
 const t=text.toLowerCase();
 if(s.timedOut)return 'transient';
 if(/not logged in|please log ?in|login required|unauthori[sz]ed|\b401\b|invalid api key|authentication|auth.*(fail|required)|credential/.test(t))return 'auth';
 if(/max.?budget|budget exceeded|quota exceeded|insufficient credits|spend.?control/.test(t))return 'budget';
 if(/rate.?limit|\b429\b|\b529\b|overloaded|timeout|timed out|econnreset|network|temporar|unavailable|\b503\b|\b502\b/.test(t))return 'transient';
 if(/model.*(not found|not available|unsupported|invalid)|unknown model/.test(t))return 'policy';
 if(/enoent|command not found|spawn .* failed/.test(t))return 'tooling';
 return 'unknown';
}
export const lastJsonLine=(s:string)=>{for(const l of s.trim().split('\n').reverse()){try{const v=JSON.parse(l);if(v&&typeof v==='object')return v as Record<string,unknown>}catch{/* 次の行 */}}return null};
