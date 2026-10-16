// テスト専用の模擬エージェントCLI。実CLIの子セッションでHookが行う承認照合を同じ関数で実行し、
// AGENTCTL_MOCK_SPEC に従って成功・失敗・使用量を返す（外部通信なし）。
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {openDb} from '../telemetry/db.ts';
import {verifyChild} from '../hooks/child.ts';

type Behaviour={outcome?:'success'|'fail';cause?:string;usage?:Record<string,number>|null;actual_model?:string;session_id?:string;sleep_ms?:number;output?:string;write_files?:string[];usage_on_failure?:boolean};
const spec=JSON.parse(process.env.AGENTCTL_MOCK_SPEC??'{}') as Behaviour&{by_model?:Record<string,Behaviour>};
const model=process.argv[process.argv.indexOf('--model')+1]??'';
const b:Behaviour={...spec,...(spec.by_model?.[model]??{})};
const actual=b.actual_model??model,session=b.session_id??randomUUID();
const print=(v:Record<string,unknown>,code:number)=>{process.stdout.write(JSON.stringify(v)+'\n');process.exit(code)};
const check=verifyChild(openDb(),process.env,{provider:'mock',model:actual});
if(!check.managed||!check.ok)print({status:'error',cause:check.managed?'model_mismatch':'policy',message:check.managed?check.reason:'承認なしの直接起動',model:actual,session_id:session},2);
if(b.sleep_ms)await new Promise(r=>setTimeout(r,b.sleep_ms));
const usage=b.usage===null?undefined:(b.usage??{input_tokens:1200,output_tokens:300,cache_read_input_tokens:800,cache_creation_input_tokens:100});
if(b.outcome==='fail')print({status:'error',cause:b.cause??'capability',message:'模擬失敗',model:actual,session_id:session,...(b.usage_on_failure===false?{}:{usage})},1);
for(const f of b.write_files??[]){const p=resolve(process.cwd(),f);mkdirSync(dirname(p),{recursive:true});writeFileSync(p,`mock artifact ${session}\n`)}
print({status:'success',model:actual,session_id:session,output:b.output??'ok',usage},0);
