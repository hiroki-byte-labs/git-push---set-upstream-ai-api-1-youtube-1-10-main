// 保護対象（Hook実装・Hook設定・models.json等）の保守: 検証済みパッチをエージェントが適用する手順（利用者の包括許可 2026-10-12）。
// 1. 本体で git apply --check  2. 一時コピーに適用して全テスト・型検査  3. 合格したら本体に適用  4. 本体で再テスト
// 5. Hook基準ハッシュを更新し、計測DBに記録。失敗したら本体は変えない（適用後の再テストが失敗したら逆適用で戻す）。
import {spawnSync} from 'node:child_process';
import {cpSync,existsSync,mkdtempSync,readFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {ROOT,now,sha256} from './config.ts';
import {recordBaseline} from './doctor.ts';
import {logEvent,type DB} from '../telemetry/db.ts';

const COPY=['orchestration','schemas','scripts','.agents','.claude','.codex'];
export type MaintenanceResult={applied:boolean;patch:string;sha256:string;files:string[];steps:{step:string;ok:boolean;detail:string}[];codex_retrust_required:boolean};
type Run=(cmd:string[],cwd:string)=>{ok:boolean;out:string};
const defaultRun:Run=(cmd,cwd)=>{const r=spawnSync(cmd[0]!,cmd.slice(1),{cwd,encoding:'utf8',timeout:600_000,maxBuffer:32*1024*1024});return {ok:r.status===0,out:((r.stdout??'')+(r.stderr??'')).slice(-1500)}};
export function patchFiles(text:string):string[]{return [...new Set([...text.matchAll(/^\+\+\+ b\/(\S+)/gm)].map(m=>m[1]!))]}
export function maintenanceApply(db:DB,patchPath:string,opts:{root?:string;run?:Run;tests?:string[][]}={}):MaintenanceResult{
 const root=opts.root??ROOT,run=opts.run??defaultRun,abs=resolve(root,patchPath),text=readFileSync(abs,'utf8');
 const tests=opts.tests??[[process.execPath,'--test',...listTests(root)],[process.execPath,'node_modules/typescript/bin/tsc','--noEmit','-p','orchestration/agentctl.tsconfig.json']];
 const res:MaintenanceResult={applied:false,patch:patchPath,sha256:sha256(text),files:patchFiles(text),steps:[],codex_retrust_required:false};
 const step=(s:string,r:{ok:boolean;out:string})=>{res.steps.push({step:s,ok:r.ok,detail:r.out.trim().split('\n').slice(-3).join(' / ')});return r.ok};
 const finish=()=>{logEvent(db,res.applied?'maintenance_patch_applied':'maintenance_patch_rejected',{patch:res.patch,sha256:res.sha256,files:res.files,steps:res.steps.map(s=>`${s.step}:${s.ok?'ok':'ng'}`)},{});return res};
 if(!res.files.length){res.steps.push({step:'parse',ok:false,detail:'パッチに対象ファイルがない'});return finish()}
 if(!step('check',run(['git','apply','--check',abs],root)))return finish();
 // 一時コピーで検証（node_modulesは複製せずリンク）
 const tmp=mkdtempSync(join(tmpdir(),'agentctl-maint-'));
 try{
  for(const p of COPY)if(existsSync(join(root,p)))cpSync(join(root,p),join(tmp,p),{recursive:true,filter:src=>!/[/\\]node_modules([/\\]|$)/.test(src)&&!/[/\\]data[/\\]/.test(src)});
  if(existsSync(join(root,'orchestration','node_modules')))symlinkSync(join(root,'orchestration','node_modules'),join(tmp,'orchestration','node_modules'));
  if(existsSync(join(root,'node_modules')))symlinkSync(join(root,'node_modules'),join(tmp,'node_modules'));
  if(!step('copy-apply',run(['git','apply',abs],tmp)))return finish();
  for(const t of tests)if(!step(`copy-test:${label(t)}`,run(t,tmp)))return finish();
 }finally{rmSync(tmp,{recursive:true,force:true})}
 if(!step('apply',run(['git','apply',abs],root)))return finish();
 for(const t of tests)if(!step(`test:${label(t)}`,run(t,root))){step('revert',run(['git','apply','-R',abs],root));return finish()}
 res.applied=true;res.codex_retrust_required=res.files.includes('.codex/hooks.json');
 if(!opts.root)recordBaseline(db);
 res.steps.push({step:'baseline',ok:true,detail:opts.root?'（試験用のrootのため省略）':`Hook基準ハッシュを更新 ${now()}`});
 return finish();
}
const label=(t:string[])=>t[1]==='--test'?`node --test（${t.length-2}ファイル）`:t.slice(1).join(' ').slice(0,60);
function listTests(root:string):string[]{
 const r=spawnSync('sh',['-c','ls orchestration/tests/*.test.ts'],{cwd:root,encoding:'utf8'});
 return r.stdout.trim().split('\n').filter(Boolean);
}
