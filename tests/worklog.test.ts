import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,copyFileSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {spawnSync} from 'node:child_process';
import {start,finish,checkLogs,reportSections} from '../src/worklog.ts';
import {sections} from '../src/tickets.ts';
function git(d:string,...args:string[]){const r=spawnSync('git',['-C',d,...args],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout}
function fixture(fn:(d:string)=>void){const d=mkdtempSync(join(tmpdir(),'universal-log-'));try{git(d,'init');mkdirSync(join(d,'tickets'));writeFileSync(join(d,'tickets/T001.md'),'---\nid: T001\ntitle: test\nowner: agent\nstatus: ready\npriority: P1\nmilestone: M0\ndepends: -\n---\n'+sections.map(s=>`## ${s}\nok\n`).join(''));writeFileSync(join(d,'.gitignore'),'work/\noutputs/\n.env\n');writeFileSync(join(d,'source.txt'),'v1');fn(d)}finally{rmSync(d,{recursive:true,force:true})}}
function begin(d:string,name='AnyVendor Agent'){return start(d,'T001',{agent:name,model:'unknown',modelSource:'unknown'},'テスト作業')}
function fill(d:string,p:string){writeFileSync(join(d,p,'WORKLOG.md'),reportSections.map((s,i)=>`## ${s}\n検証用の具体記録${i}。\n`).join('\n'))}
function close(d:string){const p=begin(d);fill(d,p);finish(d,p,'completed');return p}
test('ログなしを拒否',()=>fixture(d=>assert.throws(()=>checkLogs(d),/終了ログなし/)));
test('任意エージェントを平等に記録し終了検査',()=>fixture(d=>{for(const name of ['Codex','Claude','Gemini','Local custom agent']){const p=begin(d,name);fill(d,p);finish(d,p,'completed');assert.equal(JSON.parse(readFileSync(join(d,p,'session.json'),'utf8')).actor.agent,name)}assert.equal(checkLogs(d).sessions,4)}));
test('未終了・二重開始・未記入を拒否',()=>fixture(d=>{const p=begin(d);assert.throws(()=>checkLogs(d),/未終了/);assert.throws(()=>begin(d),/未終了/);assert.throws(()=>finish(d,p,'completed'),/未記入/)}));
test('完了後のソース追加/編集/削除を検出',()=>fixture(d=>{close(d);writeFileSync(join(d,'source.txt'),'v2');assert.throws(()=>checkLogs(d),/終了記録後/);writeFileSync(join(d,'source.txt'),'v1');writeFileSync(join(d,'new.txt'),'new');assert.throws(()=>checkLogs(d),/終了記録後/);rmSync(join(d,'new.txt'));rmSync(join(d,'source.txt'));assert.throws(()=>checkLogs(d),/終了記録後/)}));
test('終了後の本文改変を拒否',()=>fixture(d=>{const p=close(d);writeFileSync(join(d,p,'WORKLOG.md'),readFileSync(join(d,p,'WORKLOG.md'),'utf8')+'改変');assert.throws(()=>checkLogs(d),/ログ変更/)}));
test('pausedにも記録必須、次の作業で再開',()=>fixture(d=>{const p=begin(d);fill(d,p);finish(d,p,'paused');assert.equal(checkLogs(d).sessions,1);close(d);assert.equal(checkLogs(d).sessions,2)}));
test('ステージにログがない・ソースが古い状態を拒否',()=>fixture(d=>{git(d,'add','.');close(d);assert.throws(()=>checkLogs(d,true),/終了ログなし/);git(d,'add','.');assert.equal(checkLogs(d,true).sessions,1);writeFileSync(join(d,'source.txt'),'v2');const p=begin(d);fill(d,p);finish(d,p,'completed');git(d,'add','logs');assert.throws(()=>checkLogs(d,true),/終了記録後/);git(d,'add','source.txt');assert.equal(checkLogs(d,true).sessions,2)}));
test('機密と生成物をスナップショットに含めない',()=>fixture(d=>{writeFileSync(join(d,'.env'),'SECRET=do-not-log');mkdirSync(join(d,'outputs'));writeFileSync(join(d,'outputs/private.txt'),'private');const p=close(d);const m=readFileSync(join(d,p,'session.json'),'utf8');assert.ok(!m.includes('do-not-log'));assert.ok(!m.includes('private.txt'))}));
test('不正なチケット/モデル情報を拒否',()=>fixture(d=>{assert.throws(()=>start(d,'T999',{agent:'x',model:'unknown',modelSource:'unknown'},'request'),/チケットなし/);assert.throws(()=>start(d,'T001',{agent:'',model:'unknown',modelSource:'unknown'},'request'),/必要/)}));
test('実Git hook: 証跡なしcommitは失敗、揃ったindexは成功',()=>fixture(d=>{
 for(const sub of ['src','scripts','.githooks'])mkdirSync(join(d,sub));
 for(const f of ['src/worklog.ts','src/worklog-cli.ts','src/tickets.ts','scripts/run','.githooks/pre-commit'])copyFileSync(resolve(f),join(d,f));
 writeFileSync(join(d,'package.json'),'{"type":"module"}');chmodSync(join(d,'scripts/run'),0o755);chmodSync(join(d,'.githooks/pre-commit'),0o755);
 git(d,'config','core.hooksPath','.githooks');git(d,'config','user.name','Fixture Test');git(d,'config','user.email','fixture@example.invalid');git(d,'add','.');
 const commit=()=>spawnSync('git',['-C',d,'commit','-m','test fixture'],{encoding:'utf8',env:{...process.env,NODE_BIN:process.execPath}});
 assert.notEqual(commit().status,0);close(d);git(d,'add','.');const result=commit();assert.equal(result.status,0,result.stderr);
}));
test('終了後の証跡追加も拒否',()=>fixture(d=>{const p=close(d);writeFileSync(join(d,p,'claimed-success.txt'),'not verified');assert.throws(()=>checkLogs(d),/ログ証跡変更/)}));
test('終了済みsessionの再終了を拒否',()=>fixture(d=>{const p=close(d);assert.throws(()=>finish(d,p,'completed'),/未終了の作業/)}));
test('finishは同一本文の節を拒否（T013）',()=>fixture(d=>{const p=begin(d);writeFileSync(join(d,p,'WORKLOG.md'),reportSections.map(s=>`## ${s}\n同じ文。\n`).join('\n'));assert.throws(()=>finish(d,p,'completed'),/同一/)}));
test('finishはevidence参照の実在を確認（T013）',()=>fixture(d=>{const p=begin(d);writeFileSync(join(d,p,'WORKLOG.md'),reportSections.map((s,i)=>`## ${s}\n記録${i}。詳細はevidenceを参照。\n`).join('\n'));assert.throws(()=>finish(d,p,'completed'),/evidence/);mkdirSync(join(d,p,'evidence'));writeFileSync(join(d,p,'evidence/out.txt'),'ok');finish(d,p,'completed');assert.equal(checkLogs(d).sessions,1)}));
