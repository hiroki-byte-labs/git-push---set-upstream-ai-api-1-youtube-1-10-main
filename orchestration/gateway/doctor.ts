// agentctl doctor: 実行環境・鍵・DB・Hook設定・信頼状態の確認と、計測を迂回した実行の検知（--audit）。
// 各製品のローカル記録は使用量・ID・時刻だけを読み、本文は読まない・保存しない。
import {existsSync,readFileSync,readdirSync,statSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {ROOT,loadPolicy,loadRegistry,now,paths,sha256} from './config.ts';
import {authStatus} from './gateway.ts';
import {logEvent,type DB} from '../telemetry/db.ts';
import {claudeTranscriptUsage,codexRolloutUsage,readJsonlFrom} from '../telemetry/monitor.ts';

export type Check={id:string;status:'ok'|'warn'|'fail'|'info';detail:string};
export const HOOK_FILES=['.claude/settings.json','.codex/hooks.json','.agents/hooks.json','orchestration/model-registry/routing-policy.json','orchestration/model-registry/models.json','scripts/agentctl-hook','orchestration/hooks/hook.ts','orchestration/hooks/detect.ts','orchestration/hooks/child.ts'];
export function hookHashes():Record<string,string|null>{return Object.fromEntries(HOOK_FILES.map(f=>[f,existsSync(join(ROOT,f))?sha256(readFileSync(join(ROOT,f))):null]))}
export function recordBaseline(db:DB){
 const h=hookHashes();
 db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('hook_baseline',JSON.stringify({at:now(),hashes:h}));
 db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING').run('hooks_installed_at',now());
 return h;
}
const ver=(cmd:string,args=['--version'])=>{const r=spawnSync(cmd,args,{encoding:'utf8',timeout:20000,maxBuffer:8*1024*1024});const first=(r.stdout||r.stderr||'').trim().split('\n')[0];return r.status===0||/^\d+\.\d+\.\d+/.test(first??'')?first!:null};
const semver=(s:string|null|undefined)=>s?.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?/)?.[0]??null;
export type Versions={claude:string|null;codex:string|null;antigravity:string|null;codex_app:string|null};
// 各製品の現在の版。Antigravity CLIは --version がないため changelog の先頭行（例「1.3.3:」）を使う。
// Codexのデスクトップアプリは別の版のcodexを同梱するため、このリポジトリの直近のrolloutの cli_version も見る。
export function cliVersions(codexSessions=join(process.env.CODEX_HOME??join(homedir(),'.codex'),'sessions')):Versions{
 let app:string|null=null;
 try{
  const files:string[]=[];const walk=(d:string,depth:number)=>{for(const e of readdirSync(d,{withFileTypes:true})){const p=join(d,e.name);if(e.isDirectory()&&depth<3)walk(p,depth+1);else if(e.name.endsWith('.jsonl'))files.push(p)}};
  if(existsSync(codexSessions))walk(codexSessions,0);
  for(const f of files.sort((a,b)=>statSync(b).mtimeMs-statSync(a).mtimeMs).slice(0,30)){
   const meta=readJsonlFrom(f,0).records.find(r=>r.type==='session_meta')?.payload as Record<string,unknown>|undefined;
   if(meta&&typeof meta.cwd==='string'&&meta.cwd.startsWith(ROOT)&&meta.originator!=='codex_exec'&&typeof meta.cli_version==='string'){app=meta.cli_version;break}
  }
 }catch{/* 記録なし */}
 return {claude:semver(ver('claude')),codex:semver(ver('codex')),antigravity:semver(ver('agy',['changelog'])),codex_app:app};
}
// 版の変化の検知: 能力を確認した版（models.json）と、前回のdoctorで見た版（DBのmeta）の両方と比べる。
export function versionChecks(db:DB,cur:Versions):Check[]{
 const out:Check[]=[],reg=loadRegistry();
 const verified=(p:string,app=false)=>{const n=reg.providers[p]?.native_subagents as unknown;const v=n&&typeof n==='object'?(n as {verified_version?:string;verified_app_version?:string}):null;return (app?v?.verified_app_version:v?.verified_version)??(reg.providers[p] as {version_seen?:string|null}|undefined)?.version_seen??null};
 const pairs:[string,string,string|null,boolean?][]=[['claude','claude',cur.claude],['codex','codex',cur.codex],['antigravity','antigravity',cur.antigravity],['codex_app','codex',cur.codex_app,true]];
 for(const [id,prov,v,app] of pairs){
  const base=verified(prov,app);
  if(!v){out.push({id:`version_${id}`,status:'info',detail:'版を取得できない'});continue}
  out.push({id:`version_${id}`,status:base&&v!==base?'warn':'ok',detail:base&&v!==base?`能力を確認した版 ${base} と現在の版 ${v} が異なる: Hookの入力形式とサブエージェントの能力（models.json の native_subagents）を再確認する`:`${v}（確認した版 ${base??'未記録'}）`});
 }
 const prev=db.prepare("SELECT value FROM meta WHERE key='cli_versions'").get() as {value:string}|undefined;
 if(prev){const p=JSON.parse(prev.value) as {at:string;versions:Versions};const changed=(Object.keys(cur) as (keyof Versions)[]).filter(k=>cur[k]&&p.versions[k]&&cur[k]!==p.versions[k]);
  if(changed.length)out.push({id:'version_changed',status:'warn',detail:`前回のdoctor（${p.at}）から版が変わった: ${changed.map(k=>`${k} ${p.versions[k]}→${cur[k]}`).join(', ')}`})}
 db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('cli_versions',JSON.stringify({at:now(),versions:cur}));
 return out;
}
export function doctor(db:DB):Check[]{
 const c:Check[]=[],add=(id:string,status:Check['status'],detail:string)=>c.push({id,status,detail});
 const major=Number(process.versions.node.split('.')[0]);
 add('node',major>=24?'ok':'fail',`Node ${process.versions.node}（SQLite ${process.versions.sqlite}）`);
 const integrity=(db.prepare('PRAGMA integrity_check').get() as Record<string,string>)?.integrity_check;
 add('db',integrity==='ok'?'ok':'fail',`${paths().db} integrity=${integrity}`);
 const k=paths().key;
 if(!existsSync(k))add('approval_key','fail',`承認鍵がない: ${k}（agentctl init）`);
 else{const mode=statSync(k).mode&0o777;add('approval_key',mode===0o600&&!k.startsWith(ROOT)?'ok':'warn',`${k} mode=${mode.toString(8)}${k.startsWith(ROOT)?'（リポジトリ内にある）':''}`)}
 try{const {policy,sha256:s}=loadPolicy();add('policy','ok',`routing-policy ${policy.version} sha256=${s.slice(0,12)} overrides=${policy.overrides?.length??0}`)}catch(e){add('policy','fail',String(e))}
 try{const r=loadRegistry();add('registry','ok',`models.json ${r.models.length}モデル（確認日 ${r.verified_at}）`)}catch(e){add('registry','fail',String(e))}
 for(const [cmd,args] of [['claude',['--version']],['codex',['--version']],['agy',['changelog']],['gemini',['--version']]] as const){const v=ver(cmd,[...args]);add(`cli_${cmd}`,v?'ok':'warn',v??'見つからない')}
 for(const x of versionChecks(db,cliVersions()))c.push(x);
 const auth=authStatus(process.env);
 for(const p of ['claude','codex','antigravity','gemini-api'] as const)add(`auth_${p}`,auth[p]?.length?'ok':'warn',auth[p]?.length?auth[p]!.join(','):p==='claude'?'未ログイン（claude auth login が必要。Gatewayからのclaude実行は不可）':p==='gemini-api'?'GEMINI_API_KEY未設定（従量課金経路は無効のまま）':'認証を確認できない');
 // Claude Code
 try{const s=JSON.parse(readFileSync(join(ROOT,'.claude/settings.json'),'utf8'));const ev=Object.keys(s.hooks??{});add('hooks_claude',['SessionStart','UserPromptSubmit','PreToolUse','PostToolUse','SubagentStart','SubagentStop','Stop'].every(e=>ev.includes(e))?'ok':'warn',`.claude/settings.json: ${ev.join(',')}`)}catch{add('hooks_claude','fail','.claude/settings.json がない')}
 for(const f of [join(ROOT,'.claude/settings.local.json'),join(homedir(),'.claude/settings.json')])try{if(/"disableAllHooks"\s*:\s*true/.test(readFileSync(f,'utf8')))add('hooks_claude_disabled','fail',`${f} に disableAllHooks=true`)}catch{/* ファイルなし */}
 // Codex（プロジェクトの信頼と、Hookごとの信頼は利用者の設定にだけ保存される）
 const codexCfg=join(process.env.CODEX_HOME??join(homedir(),'.codex'),'config.toml');let cfg='';try{cfg=readFileSync(codexCfg,'utf8')}catch{/* なし */}
 add('hooks_codex_file',existsSync(join(ROOT,'.codex/hooks.json'))?'ok':'fail','.codex/hooks.json');
 const trusted=new RegExp(`\\[projects\\."${ROOT.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}"\\][^\\[]*trust_level\\s*=\\s*"trusted"`).test(cfg);
 add('hooks_codex_project_trust',trusted?'ok':'warn',trusted?'プロジェクトは信頼済み':`未信頼: Codexは .codex/hooks.json を読まない。利用者がCodexでこのフォルダを信頼する（setup.md 手順4）`);
 const hookTrust=(cfg.match(new RegExp(`\\[hooks\\.state\\."${join(ROOT,'.codex/hooks.json').replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}:`,'g'))??[]).length;
 add('hooks_codex_hook_trust',hookTrust?'ok':'warn',hookTrust?`信頼済みHook ${hookTrust}件`:'Hookごとの信頼がない: 利用者がCodexの /hooks で確認・信頼する（setup.md 手順4）');
 // 信頼はHookの内容のハッシュに紐付く。hooks.json を変更した後に信頼の記録が更新されていなければ、変更したHookは読み飛ばされる。
 const codexHooks=join(ROOT,'.codex/hooks.json');
 if(hookTrust&&existsSync(codexHooks)&&existsSync(codexCfg)&&statSync(codexHooks).mtimeMs>statSync(codexCfg).mtimeMs)add('hooks_codex_retrust','warn','.codex/hooks.json が信頼の記録（~/.codex/config.toml）より新しい。変更したHookはCodexが再信頼まで読み飛ばす: Codexの /hooks で再信頼する');
 if(/features\.hooks\s*=\s*false|^\s*hooks\s*=\s*false/m.test(cfg))add('hooks_codex_disabled','fail','~/.codex/config.toml でhooksが無効');
 // Antigravity
 try{const h=JSON.parse(readFileSync(join(ROOT,'.agents/hooks.json'),'utf8'));const a=h.agentctl;add('hooks_antigravity',a&&a.enabled!==false?'ok':'fail',`.agents/hooks.json agentctl: ${a?Object.keys(a).filter(k=>k!=='enabled').join(','):'なし'}（フォルダの信頼は agy -p "/hooks" で確認）`)}catch{add('hooks_antigravity','fail','.agents/hooks.json がない')}
 try{if(/"modelProvider"\s*:/.test(readFileSync(join(homedir(),'.gemini/antigravity-cli/settings.json'),'utf8')))add('antigravity_api_mode','warn','Antigravity CLIがAPIキー課金モード（modelProvider）')}catch{/* 設定なし＝アカウント認証 */}
 // Hook設定の改変検知
 const base=db.prepare("SELECT value FROM meta WHERE key='hook_baseline'").get() as {value:string}|undefined;
 if(!base)add('hook_baseline','warn','基準ハッシュ未記録（agentctl init）');
 else{const b=JSON.parse(base.value) as {at:string;hashes:Record<string,string|null>},cur=hookHashes();const changed=Object.keys(cur).filter(f=>cur[f]!==b.hashes[f]);add('hook_baseline',changed.length?'warn':'ok',changed.length?`基準（${b.at}）から変更: ${changed.join(', ')}`:`基準（${b.at}）と一致`)}
 // 直近の記録
 const ev=db.prepare("SELECT kind,COUNT(*) AS n FROM events WHERE at>=? GROUP BY kind ORDER BY n DESC").all(new Date(Date.now()-7*864e5).toISOString()) as {kind:string;n:number}[];
 add('events_7d','info',ev.map(e=>`${e.kind}=${e.n}`).join(', ')||'なし');
 const errLog=join(paths().data,'hook-errors.log');if(existsSync(errLog)){const n=readFileSync(errLog,'utf8').trim().split('\n').filter(Boolean).length;add('hook_errors',n?'warn':'ok',`${errLog}: ${n}行`)}
 // missing は記録漏れ（要調査）、unavailable は製品が使用量を出さないことを明示したもの（能力の制約）。
 const um=db.prepare("SELECT metering_status AS m,COUNT(*) AS n FROM executions WHERE managed=1 AND status IN ('completed','unmetered') AND metering_status IN ('missing','unavailable') GROUP BY metering_status").all() as {m:string;n:number}[];
 const missing=um.find(x=>x.m==='missing')?.n??0,unavail=um.find(x=>x.m==='unavailable')?.n??0;
 add('unmetered_managed',missing?'warn':unavail?'info':'ok',`記録漏れ（missing）${missing}件、製品の制約で取得不可（unavailable）${unavail}件。missingは agentctl status で調べる`);
 return c;
}
// --audit: 製品のローカル記録にあるのにDBで観測していないセッション・使用量を探す（Hookを迂回した実行の検知）。
export type AuditFinding={product:string;session_id:string;kind:'unobserved_session'|'usage_gap';started_at:string|null;local_total_tokens:number;db_total_tokens:number;detail:string};
export function audit(db:DB,opts:{since?:string;claudeProjects?:string;codexSessions?:string}={}):{since:string;findings:AuditFinding[];scanned:Record<string,number>;limitations:string[]}{
 const installed=(db.prepare("SELECT value FROM meta WHERE key='hooks_installed_at'").get() as {value:string}|undefined)?.value;
 const since=opts.since??installed??new Date(Date.now()-7*864e5).toISOString();
 const findings:AuditFinding[]=[],scanned:Record<string,number>={claude:0,codex:0};
 const dbTotal=(product:string,sid:string)=>(db.prepare('SELECT COALESCE(SUM(u.total),0) AS t FROM usage u JOIN executions e ON e.execution_id=u.execution_id WHERE e.session_product=? AND e.session_id=?').get(product,sid) as {t:number}).t;
 const observed=(product:string,sid:string)=>!!db.prepare('SELECT 1 FROM sessions WHERE product=? AND session_id=?').get(product,sid)||!!db.prepare('SELECT 1 FROM executions WHERE session_product=? AND session_id=?').get(product,sid);
 // Claude Code: ~/.claude/projects/<作業ディレクトリの記号を-にした名前>/<session>.jsonl
 const cdir=opts.claudeProjects??join(homedir(),'.claude','projects',ROOT.replace(/[^A-Za-z0-9]/g,'-'));
 if(existsSync(cdir))for(const f of readdirSync(cdir).filter(f=>f.endsWith('.jsonl'))){
  const p=join(cdir,f);if(statSync(p).mtime.toISOString()<since)continue;
  const sid=f.slice(0,-6);scanned.claude!++;
  const {records}=readJsonlFrom(p,0);
  const first=records.find(r=>typeof r.timestamp==='string')?.timestamp as string|undefined;
  if(first&&first<since)continue;
  const local=claudeTranscriptUsage(records,{sessionId:sid,skipSidechain:true}).reduce((a,u)=>a+(u.tokens.total??0),0);
  if(!local)continue;
  if(!observed('claude',sid))findings.push({product:'claude',session_id:sid,kind:'unobserved_session',started_at:first??null,local_total_tokens:local,db_total_tokens:0,detail:'Hookが動いていないセッション（--bare / --safe-mode / Hook無効 / 導入前 の可能性）'});
  else{const d=dbTotal('claude',sid);if(d<local*0.98)findings.push({product:'claude',session_id:sid,kind:'usage_gap',started_at:first??null,local_total_tokens:local,db_total_tokens:d,detail:'記録済みの使用量がトランスクリプトより少ない（未計測のターンがある）'})}
 }
 // Codex: ~/.codex/sessions/**/rollout-*.jsonl のうち、作業ディレクトリがこのリポジトリのもの。
 const xdir=opts.codexSessions??join(process.env.CODEX_HOME??join(homedir(),'.codex'),'sessions');
 const walk=(d:string,depth:number):string[]=>existsSync(d)?readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()&&depth<3?walk(join(d,e.name),depth+1):e.isFile()&&e.name.endsWith('.jsonl')?[join(d,e.name)]:[]):[];
 for(const p of walk(xdir,0)){
  if(statSync(p).mtime.toISOString()<since)continue;
  const {records}=readJsonlFrom(p,0);
  const meta=records.find(r=>r.type==='session_meta')?.payload as Record<string,unknown>|undefined;
  if(!meta||typeof meta.cwd!=='string'||!meta.cwd.startsWith(ROOT))continue;
  const start=String(meta.timestamp??'');if(start&&start<since)continue;
  scanned.codex!++;
  const thread=String(meta.id),sid=String(meta.session_id??meta.id);
  const local=codexRolloutUsage(records).usage.reduce((a,u)=>a+(u.tokens.total??0),0);if(!local)continue;
  const seen=observed('codex',thread)||observed('codex',sid)||!!db.prepare('SELECT 1 FROM usage WHERE dedupe_key LIKE ?').get(`codex:resp:${thread}:%`);
  if(!seen)findings.push({product:'codex',session_id:thread,kind:'unobserved_session',started_at:start||null,local_total_tokens:local,db_total_tokens:0,detail:meta.parent_thread_id?'未観測のサブエージェント（親スレッドあり）':'Hookが動いていないセッション（プロジェクト・Hookが未信頼、--disable hooks、導入前 の可能性）'});
 }
 const limitations=['Antigravityの会話記録（~/.gemini/antigravity/conversations/*.pb）は形式が非公開で使用量を含まないため照合できない','Claudeのトランスクリプトは製品内部の形式で、版により変わる可能性がある','この照合は同じMac・同じユーザーのローカル記録だけが対象'];
 logEvent(db,'audit',{since,findings:findings.length,scanned},{});
 return {since,findings,scanned,limitations};
}
