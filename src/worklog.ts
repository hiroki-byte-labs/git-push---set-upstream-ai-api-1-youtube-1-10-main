import {createHash,randomUUID} from 'node:crypto';
import {existsSync,lstatSync,mkdirSync,readFileSync,renameSync,writeFileSync} from 'node:fs';
import {resolve,relative,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {parseTicketFile,validate} from './tickets.ts';

type Files = Map<string,Buffer>;
type Actor = {agent:string;model:string;modelSource:string};
type Session = {schema:1;id:string;ticket:string;actor:Actor;createdAt:string;timezone:string;status:'open'|'completed'|'paused';request:string;closedAt?:string;files?:Record<string,string>;reportHash?:string;logFiles?:Record<string,string>};
export const reportSections=['依頼・許可範囲','実施内容・変更ファイル','判断と理由','検証コマンド・結果・証跡','未実施・制約','TODO・再開方法'];
const hash=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
function git(root:string,args:string[]){const p=spawnSync('git',['-C',root,...args],{maxBuffer:32*1024*1024});if(p.status!==0)throw Error(p.stderr.toString()||'Git失敗');return p.stdout}
const excluded=(p:string)=>/^(?:outputs|work|node_modules|\.git)\//.test(p)||/(^|\/)\.env(?:\..*)?$/.test(p)&&!p.endsWith('.env.example')||/\.(?:mp4|mov|wav|aiff|sqlite.*|db)$/.test(p);
export function readFiles(root:string,staged=false):Files{
 const paths=git(root,['ls-files','-z','--cached',...(staged?[]:['--others','--exclude-standard'])]).toString().split('\0').filter(Boolean);
 const files:Files=new Map();
 for(const p of [...new Set(paths)].sort()){
  if(excluded(p))continue;
  if(staged){files.set(p,git(root,['show',`:${p}`]));}
  else if(existsSync(join(root,p))){if(lstatSync(join(root,p)).isSymbolicLink())throw Error(`管理対象のsymlinkは未対応: ${p}`);files.set(p,readFileSync(join(root,p)))}
 }
 return files;
}
function ticketSet(files:Files){return validate([...files].filter(([p])=>/^tickets\/T\d+.*\.md$/.test(p)).map(([p,b])=>parseTicketFile(p.slice('tickets/'.length),b.toString())))}
function sessions(files:Files):{path:string;value:Session}[]{
 return [...files].filter(([p])=>/^logs\/[^/]+\/[^/]+\/session\.json$/.test(p)).map(([path,b])=>{
  const s=JSON.parse(b.toString());
  if(s.schema!==1||typeof s.id!=='string'||!/^T\d{3}$/.test(s.ticket)||!s.actor||['agent','model','modelSource'].some(k=>typeof s.actor[k]!=='string'||!s.actor[k].trim())||!['user-specified','runtime','unknown'].includes(s.actor.modelSource)||!['open','completed','paused'].includes(s.status)||!Number.isFinite(Date.parse(s.createdAt))||typeof s.timezone!=='string'||typeof s.request!=='string'||!s.request.trim())throw Error(`不正な作業記録: ${path}`);
  if(path!==`logs/${s.createdAt.slice(0,10)}/${s.id}/session.json`)throw Error(`記録ID/パス不一致: ${path}`);
  return {path,value:s};
 });
}
function sourceSnapshot(files:Files){
 const dirs=sessions(files).map(s=>s.path.slice(0,-'session.json'.length));
 return Object.fromEntries([...files].filter(([p])=>!dirs.some(d=>p.startsWith(d))).map(([p,b])=>[p,hash(b)]));
}
// strictはfinish時だけ適用（T013）。終了済みの過去ログは当時の基準で検証し、改変しない。
function report(files:Files,path:string,strict=false){
 const p=path.replace(/session\.json$/,'WORKLOG.md'),b=files.get(p);if(!b)throw Error(`ログ本文なし: ${p}`);
 const text=b.toString().replaceAll('\r\n','\n'),bodies:string[]=[];
 for(const section of reportSections){const label=`## ${section}\n`,i=text.indexOf(label);if(i<0)throw Error(`ログ必須節なし: ${section}`);const body=text.slice(i+label.length).split('\n## ')[0].trim();if(!body||/TODO_WRITE|記入してください/.test(body))throw Error(`ログ未記入: ${section}`);bodies.push(body)}
 if(strict){
  const dup=bodies.findIndex((x,i)=>bodies.indexOf(x)!==i);if(dup>=0)throw Error(`ログ節の本文が他の節と同一: ${reportSections[dup]}`);
  const prefix=path.slice(0,-'session.json'.length);if(/evidence/i.test(text)&&!/証跡なし|evidenceなし/.test(text)&&![...files.keys()].some(f=>f.startsWith(prefix+'evidence/')))throw Error(`本文がevidenceを参照しているが ${prefix}evidence/ が空です`);
 }
 return hash(b);
}
function logSnapshot(files:Files,path:string){const prefix=path.slice(0,-'session.json'.length);return Object.fromEntries([...files].filter(([p])=>p.startsWith(prefix)&&p!==path).map(([p,b])=>[p,hash(b)]))}
function verifyClosed(files:Files,entry:{path:string;value:Session}){
 const s=entry.value;if(!s.closedAt||!Number.isFinite(Date.parse(s.closedAt))||Date.parse(s.closedAt)<Date.parse(s.createdAt)||!s.files||typeof s.files!=='object'||Array.isArray(s.files)||!Object.keys(s.files).length||Object.entries(s.files).some(([p,h])=>typeof h!=='string'||!/^[a-f0-9]{64}$/.test(h)||p.startsWith('/')||p.includes('..')))throw Error(`終了証跡なし: ${entry.path}`);
 if(report(files,entry.path)!==s.reportHash)throw Error(`終了後のログ変更: ${entry.path}`);
 if(!s.logFiles||JSON.stringify(logSnapshot(files,entry.path))!==JSON.stringify(s.logFiles))throw Error(`終了後のログ証跡変更: ${entry.path}`);
}
export function checkLogs(root:string,staged=false){
 const files=readFiles(root,staged),ts=ticketSet(files),records=sessions(files);
 if(!records.length)throw Error('終了ログなし。worklog start/finishを実施してください');
 for(const r of records){if(!ts.some(t=>t.id===r.value.ticket))throw Error(`記録のチケットが存在しない: ${r.value.ticket}`);if(r.value.status==='open')throw Error(`未終了作業: ${r.value.id}`);verifyClosed(files,r)}
 const latest=records.sort((a,b)=>a.value.closedAt!.localeCompare(b.value.closedAt!)).at(-1)!;
 const current=sourceSnapshot(files),recorded=latest.value.files!;
 const changed=[...new Set([...Object.keys(current),...Object.keys(recorded)])].filter(p=>current[p]!==recorded[p]);
 if(changed.length)throw Error(`終了記録後の変更（新しい作業ログが必要）: ${changed.join(', ')}`);
 return {tickets:ts.length,sessions:records.length,latest:latest.value.id,mode:staged?'staged':'worktree'};
}
function save(path:string,value:Session){const temp=path+'.tmp';writeFileSync(temp,JSON.stringify(value,null,2)+'\n');renameSync(temp,path)}
export function start(root:string,ticket:string,actor:Actor,request:string){
 if(!/^T\d{3}$/.test(ticket)||Object.values(actor).some(x=>typeof x!=='string'||!x.trim())||!['runtime','user-specified','unknown'].includes(actor.modelSource)||!request.trim())throw Error('ticket/agent/model/model-source/requestが必要');
 const files=readFiles(root);if(!ticketSet(files).some(t=>t.id===ticket))throw Error('対象チケットなし');
 const active=sessions(files).find(s=>s.value.status==='open');if(active)throw Error(`未終了作業を先に閉じてください: ${active.value.id}`);
 const createdAt=new Date().toISOString(),id=`${createdAt.slice(11,19).replaceAll(':','')}-${ticket}-${randomUUID().slice(0,8)}`;
 const dir=`logs/${createdAt.slice(0,10)}/${id}`;mkdirSync(join(root,dir),{recursive:true});
 save(join(root,dir,'session.json'),{schema:1,id,ticket,actor,createdAt,timezone:'UTC',status:'open',request});
 writeFileSync(join(root,dir,'WORKLOG.md'),`# 作業記録 ${ticket}\n- 記録者・実施者: ${actor.agent}\n- モデル: ${actor.model} (${actor.modelSource})\n- 開始日時: ${createdAt} / UTC\n- 記録種別: 同時記録\n\n`+reportSections.map(s=>`## ${s}\n${s==='依頼・許可範囲'?request:'TODO_WRITE'}\n`).join('\n'));
 return dir;
}
export function finish(root:string,dir:string,status:'completed'|'paused'){
 if(!['completed','paused'].includes(status))throw Error('終了状態はcompletedまたはpaused');
 const path=relative(root,resolve(root,dir,'session.json')).replaceAll('\\','/');
 const files=readFiles(root),records=sessions(files),entry=records.find(s=>s.path===path);if(!entry||entry.value.status!=='open')throw Error('未終了の作業ディレクトリを指定してください');
 for(const r of records.filter(r=>r!==entry)){if(r.value.status==='open')throw Error('別の未終了作業あり');verifyClosed(files,r)}
 ticketSet(files);const digest=report(files,path,true);
 const s={...entry.value,status,closedAt:new Date().toISOString(),files:sourceSnapshot(files),reportHash:digest,logFiles:logSnapshot(files,path)};save(join(root,path),s);
 return checkLogs(root);
}
