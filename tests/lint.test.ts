import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {lintPlan,formatLint} from '../src/lint.ts';
import {loadPlan} from '../src/plan.ts';
const base=()=>loadPlan(JSON.parse(readFileSync('fixtures/sample-v2.json','utf8')));
const rules=(p:any)=>lintPlan(p).findings.filter(f=>f.level==='error').map(f=>f.rule);
test('同梱の台本（v1/v2）は合格',()=>{assert.equal(lintPlan(base()).ok,true);assert.equal(lintPlan(loadPlan(JSON.parse(readFileSync('fixtures/sample.json','utf8')))).ok,true)});
for(const [text,rule] of [['この方法なら必ず儲かります。','guarantee'],['元本保証なので安心です。','guarantee'],['今すぐ買うのが正解です。','recommendation'],['おすすめ銘柄を紹介します。','recommendation'],['証券コード 1234 に注目。','specific-security'],['これで爆上げを狙います。','hype']] as const){
 test(`禁止表現: ${rule}「${text}」`,()=>{const p=base();p.scenes[1].narration=text;assert.ok(rules(p).includes(rule));assert.equal(lintPlan(p).ok,false)});
}
test('字幕・図解の文言も検査対象',()=>{const p=base();p.scenes[1].cues[0].text='誰でも稼げる方法';assert.ok(rules(p).includes('hype'));const q=base();q.scenes[0].diagram={type:'flow',items:['今が買い時','様子見']};assert.ok(rules(q).includes('recommendation'))});
test('数値表現は出典なしでerror、出典ありで合格',()=>{const p=base();p.scenes[1].narration='年率5%の例を考えます。';assert.ok(rules(p).includes('unsourced-number'));p.sources=[{id:'s1',title:'公式資料',url:'https://example.org/a',accessedAt:'2026-10-08'}];p.scenes[1].sources=['s1'];assert.equal(lintPlan(p).ok,true)});
test('最終場面の免責がなければerror',()=>{const p=base();const last=p.scenes.at(-1)!;last.narration='記録は次の判断の材料になります。';last.cues=[{text:'記録は次の判断の材料になります。',seconds:last.seconds}];assert.ok(rules(p).includes('disclaimer'))});
test('免責文自体は誤検出しない',()=>{const p=base();assert.ok(!lintPlan(p).findings.some(f=>f.where.startsWith(`場面${p.scenes.length}`)))});
// T103で導入文の欠落（intro-missing、短尺はwarning）が加わったため、警告の総数ではなく規則ごとに数える。
test('未使用の出典はwarningのみ',()=>{const p=base();p.sources=[{id:'s1',title:'未使用',url:'https://example.org/a',accessedAt:'2026-10-08'}];const r=lintPlan(p);assert.equal(r.ok,true);assert.deepEqual(r.findings.filter(f=>f.rule==='unused-source').map(f=>f.level),['warning']);assert.deepEqual(r.findings.map(f=>f.rule).sort(),['intro-missing','unused-source']);assert.match(formatLint(r),/unused-source/)});
test('冒頭構成（T075）: v2サンプルは合格、promise・hook・問いの欠落を指摘',()=>{const p=base();assert.ok(!lintPlan(p).findings.some(f=>/promise|hook/.test(f.rule)));const a=base();delete (a as any).promise;assert.ok(lintPlan(a).findings.some(f=>f.rule==='promise-missing'&&f.level==='warning'));const b=base();b.scenes[0].role='body';assert.ok(lintPlan(b).findings.some(f=>f.rule==='hook-missing'));const c=base();c.scenes[0].narration='判断の前に考え方を確かめる練習をします。';assert.ok(lintPlan(c).findings.some(f=>f.rule==='hook-question'))});
test('冒頭構成（T075）: 30秒より後のhookは数えない、本番尺ではerror',()=>{const p=base();p.scenes[0].role='body';p.scenes[5].role='hook';p.scenes[5].narration='どうでしょう？'+p.scenes[5].narration.slice(0,40);assert.ok(lintPlan(p).findings.some(f=>f.rule==='hook-missing'));const long=base();delete (long as any).promise;for(const s of long.scenes){s.seconds=40;s.cues=[{text:s.cues[0].text,seconds:40}]}const r=lintPlan(long);assert.ok(r.findings.some(f=>f.rule==='promise-missing'&&f.level==='error'));assert.equal(r.ok,false)});
test('章（T080）: 未分割・長すぎ・まとめなしを指摘',()=>{const p=base();assert.ok(!lintPlan(p).findings.some(f=>/chapter/.test(f.rule)));const a=base();for(const s of a.scenes)delete (s as any).chapter;assert.ok(lintPlan(a).findings.some(f=>f.rule==='chapter-missing'));const b=base();b.scenes[3].role='body';b.scenes[4].role='body';assert.ok(lintPlan(b).findings.some(f=>f.rule==='chapter-recap'&&f.where.includes('確かめ方')));const c=base();for(const i of [1,2,3,4]){c.scenes[i].chapter='本編';c.scenes[i].seconds=120;c.scenes[i].cues=[{text:'本編の字幕',seconds:120}]}const r=lintPlan(c);assert.ok(r.findings.some(f=>f.rule==='chapter-too-long'&&f.where.includes('本編')))});
test('物語と具体例（T081）: サンプルは合格、出典も架空表示もない具体例はerror',()=>{const p=base();assert.ok(!lintPlan(p).findings.some(f=>/story|example/.test(f.rule)));const a=base();a.scenes[1].fictional=false;const r=lintPlan(a);assert.ok(r.findings.some(f=>f.rule==='example-label'&&f.level==='error'));assert.equal(r.ok,false);a.sources=[{id:'s1',title:'公式資料',url:'https://example.org/a',accessedAt:'2026-10-08'}];a.scenes[1].sources=['s1'];assert.ok(!lintPlan(a).findings.some(f=>f.rule==='example-label'))});
test('物語と具体例（T081）: 例えばの未指定・順序違い・欠落・物語なし',()=>{const p=base();p.scenes[3].narration='例えば、記録の観点を三つに絞ります。';assert.ok(lintPlan(p).findings.some(f=>f.rule==='example-unmarked'));const q=base();q.scenes[1].beat='lesson';q.scenes[5].beat='situation';assert.ok(lintPlan(q).findings.some(f=>f.rule==='story-order'));const r=base();delete (r.scenes[2] as any).beat;assert.ok(lintPlan(r).findings.some(f=>f.rule==='story-incomplete'));const n=base();for(const s of n.scenes){delete (s as any).beat;if(s.role==='example')s.role='body'}assert.ok(lintPlan(n).findings.some(f=>f.rule==='story-missing'))});
test('会話調（T082）: 語りかけなし・である調をwarning',()=>{const p=base();assert.ok(!lintPlan(p).findings.some(f=>/conversational|stiff/.test(f.rule)));const a=base();for(const s of a.scenes)s.narration=s.narration.replace(/あなた/g,'').replace(/ましょう/g,'ます');assert.ok(lintPlan(a).findings.some(f=>f.rule==='conversational-missing'&&f.level==='warning'));const b=base();for(const s of b.scenes)s.narration='これは判断の記録である。記録は材料だ。';const r=lintPlan(b);assert.ok(r.findings.some(f=>f.rule==='stiff-style'));assert.ok(!r.findings.some(f=>f.rule==='stiff-style'&&f.level==='error'))});
test('用語の先出し（T083）: 「とは」かglossary場面で合格、後出し・未使用はwarning',()=>{const p=base();assert.ok(!lintPlan(p).findings.some(f=>/glossary/.test(f.rule)));const a=base();a.scenes[2].narration='見たことと考えたことを分けて書きましょう。あなたの事実は何でしたか？';const r=lintPlan(a).findings.find(f=>f.rule==='glossary-late')!;assert.equal(r.level,'warning');assert.match(r.message,/場面3/);const b=base();b.scenes[2].narration='見たことと考えたことを分けて書きましょう。あなたの事実は何でしたか？';b.scenes[1].role='glossary';b.scenes[1].narration='解釈は、見たことから考えたことです。あなたはどう感じますか？';assert.ok(!lintPlan(b).findings.some(f=>f.rule==='glossary-late'));const c=base();c.glossary=[{term:'損切り',definition:'損失を確定させること'}];assert.ok(lintPlan(c).findings.some(f=>f.rule==='glossary-unused'))});
test('強調語（T078）: ナレーションにない語はwarning',()=>{const p=base();assert.ok(!lintPlan(p).findings.some(f=>f.rule==='emphasis-unused'));p.scenes[0].emphasis=['存在しない語'];const f=lintPlan(p).findings.find(x=>x.rule==='emphasis-unused')!;assert.equal(f.level,'warning')});
// T097: 免責は「推奨しない」「保証しない」の否定文として判定する。ナレーションと字幕（最終場面のcueをつなげた文）の両方に必要。
const closing=(narration:string,cues:string[]=[narration])=>{const p=base();const last=p.scenes.at(-1)!;last.narration=narration;last.cues=cues.map(text=>({text,seconds:last.seconds/cues.length}));return p};
const disclaimerErrors=(p:any)=>lintPlan(p).findings.filter(f=>f.rule.startsWith('disclaimer')&&f.level==='error');
const channelDisclaimer=JSON.parse(readFileSync('config/channel.json','utf8')).disclaimer;
for(const [name,text,ok] of [
 ['正規免責（サンプルの文）','記録は次の判断の材料になります。これは学習用のデモで、個別銘柄の推奨や利益の保証はしません。',true],
 ['チャンネル設定の免責文',channelDisclaimer,true],
 ['別々の否定文','個別銘柄を推奨しません。利益も保証しません。',true],
 ['完全欠落','記録は次の判断の材料になります。',false],
 ['推奨側だけ','学習用です。個別銘柄の推奨はしません。',false],
 ['保証側だけ','学習用です。利益の保証はしません。',false],
 ['両方肯定（T093の再現）','投資を推奨します。利益を保証します。',false],
 ['否定文に肯定の保証文が併存','個別銘柄の推奨や利益の保証はしません。ただし元本は保証します。',false],
 ['一文の中で否定と肯定','推奨はしませんが、利益は保証します。',false],
] as const) test(`免責の判定（T097）: ${name}`,()=>{const e=disclaimerErrors(closing(text));assert.equal(e.length===0,ok,JSON.stringify(e))});
test('免責の判定（T097）: ナレーションだけ・字幕だけはerror、字幕は複数cueに分けてよい',()=>{
 const ok='個別銘柄の推奨や利益の保証はしません。';const none='記録は次の判断の材料になります。';
 assert.ok(disclaimerErrors(closing(ok,[none])).some(f=>f.where.includes('字幕')));
 assert.ok(disclaimerErrors(closing(none,[ok])).some(f=>f.where.includes('ナレーション')));
 assert.equal(disclaimerErrors(closing(ok,['個別銘柄の推奨はしません。','利益の保証もしません。'])).length,0);
});
test('免責の判定（T097）: v1サンプル（字幕＝ナレーション）は合格',()=>{assert.equal(disclaimerErrors(loadPlan(JSON.parse(readFileSync('fixtures/sample.json','utf8')))).length,0)});
