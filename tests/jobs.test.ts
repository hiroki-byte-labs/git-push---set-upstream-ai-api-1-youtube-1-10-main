// 退避先の衝突（T094）。同名の退避先があれば何も移動せずに拒否し、退避済みの内容を守る。
import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {planClean,applyClean} from '../src/jobs.ts';
function fixture(fn:(root:string)=>void){return ()=>{const root=mkdtempSync(join(tmpdir(),'jobs-'));try{fn(root)}finally{rmSync(root,{recursive:true,force:true})}}}
const read=(p:string)=>readFileSync(p,'utf8');
function failedJob(root:string,id:string){const d=join(root,id);mkdirSync(d,{recursive:true});writeFileSync(join(d,'job.json'),JSON.stringify({id,status:'failed',createdAt:new Date().toISOString()}));return d}
test('同日に同名ファイルを再退避しても旧内容を上書きしない',fixture(root=>{
 writeFileSync(join(root,'report.txt'),'A');applyClean(root,planClean(root),'2026-10-10');
 assert.equal(read(join(root,'_archive/2026-10-10/report.txt')),'A');
 writeFileSync(join(root,'report.txt'),'B');
 assert.throws(()=>applyClean(root,planClean(root),'2026-10-10'),/退避先が既に存在.*_archive\/2026-10-10\/report\.txt/s);
 assert.equal(read(join(root,'_archive/2026-10-10/report.txt')),'A');assert.equal(read(join(root,'report.txt')),'B');
 // 別の日付なら退避できる
 applyClean(root,planClean(root),'2026-10-11');assert.equal(read(join(root,'_archive/2026-10-11/report.txt')),'B');
}));
test('ディレクトリの衝突（空の退避先も含む）は拒否',fixture(root=>{
 mkdirSync(join(root,'_archive/2026-10-10/misc'),{recursive:true});
 mkdirSync(join(root,'misc'));writeFileSync(join(root,'misc/x.txt'),'new');
 assert.throws(()=>applyClean(root,planClean(root),'2026-10-10'),/退避先が既に存在/);
 assert.equal(read(join(root,'misc/x.txt')),'new');assert.ok(existsSync(join(root,'_archive/2026-10-10/misc')));
}));
test('_trashの同名衝突は拒否し、退避済みジョブを残す',fixture(root=>{
 const old=join(root,'_trash/demo-22222222');mkdirSync(old,{recursive:true});writeFileSync(join(old,'job.json'),'old');
 failedJob(root,'demo-22222222');
 assert.throws(()=>applyClean(root,planClean(root),'2026-10-10'),/_trash\/demo-22222222/);
 assert.equal(read(join(old,'job.json')),'old');assert.ok(existsSync(join(root,'demo-22222222/job.json')));
}));
test('複数候補の一部が衝突したら、どれも移動しない',fixture(root=>{
 mkdirSync(join(root,'_archive/2026-10-10'),{recursive:true});writeFileSync(join(root,'_archive/2026-10-10/b.txt'),'old-b');
 writeFileSync(join(root,'a.txt'),'a');writeFileSync(join(root,'b.txt'),'b');failedJob(root,'demo-33333333');
 assert.throws(()=>applyClean(root,planClean(root),'2026-10-10'),/b\.txt/);
 assert.equal(read(join(root,'a.txt')),'a');assert.ok(existsSync(join(root,'demo-33333333')));assert.ok(!existsSync(join(root,'_trash/demo-33333333')));
 assert.equal(read(join(root,'_archive/2026-10-10/b.txt')),'old-b');
}));
test('途中で失敗したら、移動済みの項目と元の場所を報告する',fixture(root=>{
 writeFileSync(join(root,'a.txt'),'a');
 assert.throws(()=>applyClean(root,{jobs:[],loose:['a.txt','missing.txt']},'2026-10-10'),(e:any)=>/missing\.txt/.test(e.message)&&/移動済み.*a\.txt → _archive\/2026-10-10\/a\.txt/s.test(e.message)&&Array.isArray(e.moved)&&e.moved.length===1);
 assert.equal(read(join(root,'_archive/2026-10-10/a.txt')),'a');
}));
test('正常な退避と再実行',fixture(root=>{
 failedJob(root,'demo-44444444');writeFileSync(join(root,'old.zip'),'x');writeFileSync(join(root,'latest.json'),'{}');
 assert.deepEqual(applyClean(root,planClean(root),'2026-10-10'),['demo-44444444 → _trash/demo-44444444','old.zip → _archive/2026-10-10/old.zip']);
 assert.deepEqual(planClean(root),{jobs:[],loose:[]});assert.deepEqual(applyClean(root,planClean(root),'2026-10-10'),[]);
 assert.ok(existsSync(join(root,'latest.json')));
}));
