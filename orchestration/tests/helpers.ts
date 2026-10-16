// テスト用の隔離環境。DB・承認鍵・ルーティング設定を一時ディレクトリへ分け、実際のdata/や~/.config/agentctlを使わない。
import {cpSync,mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ROOT} from '../gateway/config.ts';
import {openDb,type DB} from '../telemetry/db.ts';
import type {Task} from '../router/router.ts';

export type Sandbox={dir:string;env:NodeJS.ProcessEnv;db:DB};
// 製品の環境変数（CLAUDECODE等）を含まない最小の環境。実行中のエージェントの影響を受けない。
export function sandbox(extra:Record<string,string>={}):Sandbox{
 const dir=mkdtempSync(join(tmpdir(),'agentctl-test-'));
 cpSync(join(ROOT,'orchestration','model-registry'),join(dir,'registry'),{recursive:true});
 mkdirSync(join(dir,'data'),{recursive:true});
 const env:NodeJS.ProcessEnv={PATH:process.env.PATH,HOME:process.env.HOME,AGENTCTL_DATA_DIR:join(dir,'data'),AGENTCTL_KEY_DIR:join(dir,'key'),AGENTCTL_REGISTRY_DIR:join(dir,'registry'),
  AGENTCTL_ALLOW_MOCK:'1',AGENTCTL_AUTH_OVERRIDE:JSON.stringify({mock:['none'],local:['none'],claude:['subscription'],codex:['subscription'],antigravity:['subscription']}),...extra};
 for(const k of Object.keys(process.env))if(/^(AGENTCTL_|CLAUDE|CODEX_|ANTIGRAVITY_)/.test(k))delete process.env[k];
 Object.assign(process.env,env);
 return {dir,env,db:openDb()};
}
export function task(over:Partial<Task>={}):Task{
 return {schema_version:'1',task_id:null,parent_task_id:null,title:'test',task_type:'summarization',difficulty:null,quality_requirement:'normal',initiator:'human',agent_name:null,required_capabilities:[],preferred_provider:'mock',
  budget:{max_usd:null,max_total_tokens:null,max_retries:2,max_escalations:1},input:{prompt_file:null,program:null,workdir:null,permission_profile:'read_only',mock:{}},expected_artifacts:[],test_command:null,audit:true,...over};
}
export function writeJsonl(path:string,rows:unknown[]){writeFileSync(path,rows.map(r=>JSON.stringify(r)).join('\n')+'\n')}
export const count=(db:DB,sql:string,...args:(string|number|null)[])=>Number((db.prepare(sql).get(...args) as Record<string,number>)[Object.keys(db.prepare(sql).get(...args) as object)[0]!]);
