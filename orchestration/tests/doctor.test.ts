// doctor: CodexのHookを変更した後に再信頼されていない状態を検知する（2026-10-11の実機で発生）。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,utimesSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {sandbox,writeJsonl} from './helpers.ts';
import {ROOT} from '../gateway/config.ts';
import {cliVersions,doctor,versionChecks} from '../gateway/doctor.ts';

test('Codexの信頼の記録が .codex/hooks.json より古ければ再信頼を求める', ()=>{
 const {db,dir}=sandbox();
 const home=join(dir,'codex-home');mkdirSync(home,{recursive:true});
 const cfg=join(home,'config.toml');
 writeFileSync(cfg,`[projects."${ROOT}"]\ntrust_level = "trusted"\n\n[hooks.state."${join(ROOT,'.codex/hooks.json')}:pre_tool_use:0:0"]\ntrusted_hash = "sha256:x"\n`);
 process.env.CODEX_HOME=home;
 try{
  utimesSync(cfg,new Date('2000-01-01'),new Date('2000-01-01'));
  assert.equal(doctor(db).find(c=>c.id==='hooks_codex_retrust')?.status,'warn');
  utimesSync(cfg,new Date(),new Date(Date.now()+60_000));
  assert.equal(doctor(db).find(c=>c.id==='hooks_codex_retrust'),undefined);
 }finally{delete process.env.CODEX_HOME}
});
test('版の変化: 能力を確認した版と違えば警告し、前回のdoctorからの変化も報告する', ()=>{
 const {db}=sandbox();
 const base={claude:'2.1.293',codex:'0.162.1',antigravity:'1.3.3',codex_app:null};
 const first=versionChecks(db,base);
 assert.ok(first.filter(c=>c.id.startsWith('version_')&&c.id!=='version_codex_app').every(c=>c.status==='ok'),JSON.stringify(first));
 const desktop=versionChecks(db,{...base,codex_app:'0.162.0-alpha.2'});
 assert.equal(desktop.find(c=>c.id==='version_codex_app')?.status,'ok','確認済みのデスクトップ同梱版は警告しない');
 const newer={...base,codex:'0.163.0',codex_app:'0.163.0-alpha.1'};
 const second=versionChecks(db,newer);
 assert.equal(second.find(c=>c.id==='version_codex')?.status,'warn');
 assert.equal(second.find(c=>c.id==='version_codex_app')?.status,'warn','デスクトップアプリの同梱版も比べる');
 assert.match(second.find(c=>c.id==='version_changed')?.detail??'',/0\.162\.1→0\.163\.0/);
 assert.equal(versionChecks(db,newer).find(c=>c.id==='version_changed'),undefined,'変化がなければ報告しない');
});
test('Codexのデスクトップアプリの版を、このリポジトリの直近のrolloutから読む', ()=>{
 const {dir}=sandbox();
 const d=join(dir,'sessions','2026','10','11');mkdirSync(d,{recursive:true});
 writeJsonl(join(d,'rollout-a.jsonl'),[{type:'session_meta',payload:{id:'t1',cwd:ROOT,originator:'Codex Desktop',cli_version:'0.162.0-alpha.2'}}]);
 writeJsonl(join(d,'rollout-b.jsonl'),[{type:'session_meta',payload:{id:'t2',cwd:'/elsewhere',originator:'Codex Desktop',cli_version:'9.9.9'}}]);
 assert.equal(cliVersions(join(dir,'sessions')).codex_app,'0.162.0-alpha.2');
});
