// agentctl maintenance apply: 一時コピーで試験に合格したパッチだけを適用し、失敗なら本体を変えない。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sandbox} from './helpers.ts';
import {maintenanceApply,patchFiles} from '../gateway/maintenance.ts';

function fakeRoot(){
 const root=mkdtempSync(join(tmpdir(),'agentctl-maint-root-'));
 mkdirSync(join(root,'orchestration','hooks'),{recursive:true});
 writeFileSync(join(root,'orchestration','hooks','x.ts'),'export const a=1;\n');
 writeFileSync(join(root,'fix.patch'),'--- a/orchestration/hooks/x.ts\n+++ b/orchestration/hooks/x.ts\n@@ -1 +1 @@\n-export const a=1;\n+export const a=2;\n');
 return root;
}
const ok=[[process.execPath,'-e','process.exit(0)']],ng=[[process.execPath,'-e','process.exit(1)']];
test('一時コピーで試験に合格したパッチだけを本体に適用し、記録する', ()=>{
 const {db}=sandbox();const root=fakeRoot();
 const r=maintenanceApply(db,'fix.patch',{root,tests:ok});
 assert.equal(r.applied,true,JSON.stringify(r.steps));
 assert.deepEqual(r.files,['orchestration/hooks/x.ts']);
 assert.equal(readFileSync(join(root,'orchestration','hooks','x.ts'),'utf8'),'export const a=2;\n');
 assert.equal((db.prepare("SELECT COUNT(*) AS n FROM events WHERE kind='maintenance_patch_applied'").get() as {n:number}).n,1);
});
test('一時コピーの試験が失敗したら本体を変えない', ()=>{
 const {db}=sandbox();const root=fakeRoot();
 const r=maintenanceApply(db,'fix.patch',{root,tests:ng});
 assert.equal(r.applied,false);
 assert.equal(readFileSync(join(root,'orchestration','hooks','x.ts'),'utf8'),'export const a=1;\n');
 assert.equal((db.prepare("SELECT COUNT(*) AS n FROM events WHERE kind='maintenance_patch_rejected'").get() as {n:number}).n,1);
});
test('適用できないパッチは何もしない／.codex/hooks.json を含むと再信頼が必要と返す', ()=>{
 const {db}=sandbox();const root=fakeRoot();
 writeFileSync(join(root,'orchestration','hooks','x.ts'),'export const a=9;\n');
 assert.equal(maintenanceApply(db,'fix.patch',{root,tests:ok}).steps[0]!.ok,false);
 assert.deepEqual(patchFiles('+++ b/.codex/hooks.json\t2026\n+++ b/orchestration/hooks/hook.ts\n'),['.codex/hooks.json','orchestration/hooks/hook.ts']);
});
