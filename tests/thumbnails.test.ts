import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {checkThumbnails,THUMB_MAX_BYTES} from '../src/thumbnails.ts';
import {buildThumbSpecs} from '../src/timeline.ts';
import {loadPlan,validatePlanV2} from '../src/plan.ts';
import {lintPlan} from '../src/lint.ts';
const v2=()=>loadPlan(JSON.parse(readFileSync('fixtures/sample-v2.json','utf8')));
test('サムネイル仕様（T073）: 3案、既定は題名とpromise、図解はhook以外の最初の場面',()=>{const s=buildThumbSpecs(v2());assert.deepEqual(s.map(x=>x.file),['thumbnail-a.png','thumbnail-b.png','thumbnail-c.png']);assert.equal(s[0].headline,'投資と心理｜判断の前に確かめること');assert.equal(s[0].sub,'判断の前に考え方を確かめる3つの観点');assert.equal(s[0].scene,1);const p=v2();p.thumbnail={headline:'判断の前の3つの確認',scene:4};assert.equal(buildThumbSpecs(p)[1].scene,3)});
test('サムネイルの文言検証と禁止表現（T073）',()=>{const p=JSON.parse(readFileSync('fixtures/sample-v2.json','utf8'));p.thumbnail={headline:'あ'.repeat(21)};assert.throws(()=>validatePlanV2(p),/thumbnail/);p.thumbnail={headline:'見出し',scene:99};assert.throws(()=>validatePlanV2(p),/場面番号/);const q=v2();q.thumbnail={headline:'必ず儲かる判断'};assert.ok(lintPlan(q).findings.some(f=>f.where==='サムネイル'&&f.level==='error'))});
test('サムネイル検査（T073）: サイズ・はみ出し・コントラスト',()=>{const d=mkdtempSync(join(tmpdir(),'th-'));try{writeFileSync(join(d,'a.png'),Buffer.alloc(10));writeFileSync(join(d,'b.png'),Buffer.alloc(THUMB_MAX_BYTES+1));writeFileSync(join(d,'thumbnails-report.json'),JSON.stringify([{file:'a.png',variant:'a',headlineSize:100,fitted:true,contrast:16.2},{file:'b.png',variant:'b',headlineSize:60,fitted:false,contrast:3.1},{file:'c.png',variant:'c',headlineSize:80,fitted:true,contrast:9}]));const r=checkThumbnails(d);assert.equal(r[0].ok,true);assert.equal(r[1].issues.length,3);assert.deepEqual(r[2].issues,['画像がない'])}finally{rmSync(d,{recursive:true,force:true})}});
// T096: 描画に使う最終文言（省略時の題名・promiseへの代替を含む）を、lintでも同じ値で検査する。
const thumbErrors=(p:any)=>lintPlan(p).findings.filter(f=>f.where.startsWith('サムネイル')&&f.level==='error');
test('サムネイル省略時: 題名「必ず儲かる」は構造検証を通るがlintでerror、描画仕様と同じ文言',()=>{const raw=JSON.parse(readFileSync('fixtures/sample-v2.json','utf8'));delete raw.thumbnail;raw.title='必ず儲かる';const p=loadPlan(raw);assert.equal(buildThumbSpecs(p)[0].headline,'必ず儲かる');const e=thumbErrors(p);assert.ok(e.some(f=>f.text==='必ず儲かる'&&f.rule==='guarantee'));assert.equal(lintPlan(p).ok,false)});
test('サムネイル: 補足の省略でpromiseが代替される場合も検査',()=>{const p=v2();p.thumbnail={headline:'判断の前の3つの確認'};p.promise='誰でも稼げる3つの観点';assert.equal(buildThumbSpecs(p)[0].sub,'誰でも稼げる3つの観点');assert.ok(thumbErrors(p).some(f=>f.text==='誰でも稼げる3つの観点'&&f.rule==='hype'))});
test('サムネイル: 明示した文言は代替より優先し、代替値は検査しない',()=>{const p=v2();p.promise='誰でも稼げる3つの観点';p.thumbnail={headline:'判断の前の3つの確認',sub:'記録の観点'};assert.deepEqual([buildThumbSpecs(p)[0].headline,buildThumbSpecs(p)[0].sub],['判断の前の3つの確認','記録の観点']);assert.equal(thumbErrors(p).length,0)});
test('サムネイル: 明示・部分指定・すべて省略の正常例はerrorなし、lintと描画の文言が一致',()=>{
 const cases=[v2(),(()=>{const p=v2();p.thumbnail={headline:'判断の前の3つの確認',sub:'記録の観点'};return p})(),(()=>{const p=v2();p.thumbnail={headline:'判断の前の3つの確認'};return p})(),(()=>{const p=v2();delete p.thumbnail;delete p.promise;return p})()];
 for(const p of cases){assert.equal(thumbErrors(p).length,0);const s=buildThumbSpecs(p)[0];const q={...p,thumbnail:undefined,title:s.headline,promise:'必ず儲かる'};assert.equal(thumbErrors(q).filter(f=>f.text==='必ず儲かる').length,1)}
 const none=cases[3];assert.equal(buildThumbSpecs(none)[0].sub,'');
});
