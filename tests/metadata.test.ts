import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync,mkdtempSync,writeFileSync,rmSync,existsSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {buildMetadata,timestamp,tagsLength,checkTitle,reviseTitle,YT} from '../src/metadata.ts';
import {loadPlan} from '../src/plan.ts';
const v2=()=>loadPlan(JSON.parse(readFileSync('fixtures/sample-v2.json','utf8')));
const ex={sources:'出典: なし',stance:'免責'};
test('タイムスタンプ',()=>{assert.equal(timestamp(0),'00:00');assert.equal(timestamp(75),'01:15');assert.equal(timestamp(3725),'1:02:05')});
// 同梱v2は各章8〜16秒で、YouTubeの「各チャプター10秒以上」を満たさない章がある。試験では尺を1.5倍にする。
const scaled=(k=1.5)=>{const p=v2();for(const s of p.scenes){s.seconds*=k;s.cues=s.cues.map(c=>({...c,seconds:c.seconds*k}))}return p};
test('v2: 同梱の尺では8秒の章があるためチャプターを出さず理由を残す',()=>{const m=buildMetadata(v2(),ex);assert.equal(m.chapters.length,0);assert.match(m.chaptersOmitted!,/10秒未満/);assert.equal(m.ok,true)});
test('タイトル案・チャプター（00:00開始・4つ）・用語・タグ',()=>{const m=buildMetadata(scaled(),ex);assert.equal(m.ok,true);assert.equal(m.titles[0],'投資と心理｜判断の前に確かめること');assert.ok(m.titles.some(t=>t.includes('判断の前に考え方を確かめる3つの観点')));assert.ok(m.titles.some(t=>t.endsWith('？')));assert.deepEqual(m.chapters.map(c=>c.time),['00:00','00:12','00:36','01:00']);assert.match(m.description,/チャプター\n00:00 導入/);assert.match(m.description,/・解釈: /);assert.deepEqual(m.tags,['解釈'])});
test('チャプター: 3つ未満は出さない、本番尺ではissue',()=>{const p=scaled();for(const s of p.scenes)s.chapter='一つ';assert.match(buildMetadata(p,ex).chaptersOmitted!,/3つ以上/);const long=scaled(5);for(const s of long.scenes)s.chapter='一つ';const m=buildMetadata(long,ex);assert.ok(m.issues.some(i=>i.includes('チャプターなし')));assert.equal(m.ok,false)});
test('タイトルの検査: 100文字・<>・禁止表現',()=>{assert.equal(checkTitle('あ'.repeat(100)).length,0);assert.ok(checkTitle('あ'.repeat(101))[0].includes('100'));assert.ok(checkTitle('a<b').length);assert.ok(checkTitle('必ず儲かる方法').some(i=>i.includes('禁止')))});
test('概要欄はバイト数で検査（日本語は約3バイト/字）',()=>{const p=v2();const m=buildMetadata(p,{sources:'あ'.repeat(1700),stance:''});assert.ok(Buffer.byteLength(m.description)>YT.descriptionBytes);assert.ok(m.issues.some(i=>i.includes('バイト')));assert.equal(m.ok,false)});
test('タグの長さ: 区切りと空白タグの引用符を数える',()=>{assert.equal(tagsLength(['Foo Baz']),9);assert.equal(tagsLength(['ab','cd']),5)});
test('公開後の見直し: 理由必須・検査・履歴',()=>{const d=mkdtempSync(join(tmpdir(),'meta-'));try{writeFileSync(join(d,'metadata.json'),JSON.stringify(buildMetadata(v2(),ex)));assert.throws(()=>reviseTitle(d,'新しい題','',),/理由/);assert.throws(()=>reviseTitle(d,'必ず儲かる','CTRが低い'),/禁止/);const r=reviseTitle(d,'判断の前に確かめる3つのこと','冒頭30秒の維持率が低く、期待との不一致を疑う','test');assert.equal(r.from,'投資と心理｜判断の前に確かめること');assert.equal(JSON.parse(readFileSync(join(d,'metadata.json'),'utf8')).selectedTitle,'判断の前に確かめる3つのこと');assert.equal(JSON.parse(readFileSync(join(d,'metadata-revisions.json'),'utf8')).length,1)}finally{rmSync(d,{recursive:true,force:true})}});
