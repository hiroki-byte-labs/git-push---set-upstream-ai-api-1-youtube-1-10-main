// テーマ別の免責・導入文・出典（T103）。一般テーマで投資の定型免責を強制せず、投資テーマの検査は維持する。
// theme未指定（旧形式）は投資テーマとして解釈し、検査を回避させない。
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {loadPlan,validatePlanV2,themeOf} from '../src/plan.ts';
import {lintPlan} from '../src/lint.ts';
import {buildMetadata} from '../src/metadata.ts';
import {sourcesText} from '../src/channel.ts';
const raw=()=>JSON.parse(readFileSync('fixtures/sample-v2.json','utf8'));
const errors=(p:any)=>lintPlan(p).findings.filter(f=>f.level==='error');
const rules=(p:any)=>errors(p).map(f=>f.rule);
const src={id:'s1',title:'公式資料',url:'https://example.org/a',accessedAt:'2026-10-10'};
// 最終場面のナレーションと字幕を同じ文に置き換える。
const closing=(p:any,text:string)=>{const last=p.scenes.at(-1);last.narration=text;last.cues=[{text,seconds:last.seconds}];return p};
// 一般テーマの台本（投資の語を含まない文面に置き換える）。
function general(text='これは学習用の解説です。実践の結果を保証するものではありません。'){
 const p=raw();p.theme='general';p.title='日常の疑問｜判断の前に確かめること';
 p.scenes[1].narration='予定が急に変わると、気持ちが先に反応することがあります。まずは、そのことに気づくのが第一歩です。';
 p.scenes[1].cues=[{text:'予定が変わると、気持ちが先に反応することがあります。',seconds:4.5},{text:'まず、そのことに気づくのが第一歩です。',seconds:3.5}];
 return loadPlan(closing(p,text));
}

test('テーマの検証: general/investmentを受理、未知の値を拒否、旧形式は投資扱い',()=>{
 for(const t of ['general','investment']){const p=raw();p.theme=t;assert.equal(themeOf(validatePlanV2(p)),t)}
 const bad=raw();bad.theme='finance';assert.throws(()=>validatePlanV2(bad),/theme/);
 const empty=raw();empty.theme='';assert.throws(()=>validatePlanV2(empty),/theme/);
 assert.equal(themeOf(loadPlan(raw())),'investment');
 assert.equal(themeOf(loadPlan(JSON.parse(readFileSync('fixtures/sample.json','utf8')))),'investment');
});

test('導入文の検証: 300字以内、出典は定義済みのid、fictionalは真偽値',()=>{
 const p=raw();p.sources=[src];p.intro={text:'あ'.repeat(301),sources:['s1']};assert.throws(()=>validatePlanV2(p),/intro/);
 p.intro={text:'導入',sources:['missing']};assert.throws(()=>validatePlanV2(p),/intro/);
 p.intro={text:'導入',sources:['s1'],fictional:'yes'};assert.throws(()=>validatePlanV2(p),/intro/);
 p.intro={text:'  ',sources:[]};assert.throws(()=>validatePlanV2(p),/intro/);
 p.intro={text:'導入',sources:['s1']};assert.equal(validatePlanV2(p).intro!.text,'導入');
});

test('一般テーマの正常: 投資の定型免責（推奨しない）を強制しない',()=>{
 const p=general();const e=errors(p);
 assert.deepEqual(e.filter(f=>f.rule.startsWith('disclaimer')),[]);
 assert.ok(!lintPlan(p).findings.some(f=>f.message.includes('推奨')),'一般テーマで推奨の免責を求めない');
 assert.equal(lintPlan(p).ok,true,JSON.stringify(e));
});

test('一般テーマの免責欠落: 結果を保証しない旨がなければerror（ナレーション・字幕とも）',()=>{
 const p=general('明日から、ニュースと自分の生活を分けて考えてみましょう。');
 const d=errors(p).filter(f=>f.rule==='disclaimer');
 assert.equal(d.length,2);assert.ok(d.every(f=>f.message.includes('保証')&&!f.message.includes('推奨')));
 assert.equal(lintPlan(p).ok,false);
});

test('一般テーマの保証肯定: 最終場面の「保証します」はerror',()=>{
 const p=general('この習慣で生活が良くなることを保証します。');
 assert.ok(rules(p).includes('disclaimer-affirmative'));assert.equal(lintPlan(p).ok,false);
});

test('一般テーマでも出典なしの数値・利益保証・結果保証・煽りは通さない',()=>{
 const a=general();a.scenes[1].narration='この方法なら必ず儲かります。';assert.ok(rules(a).includes('guarantee'));
 const b=general();b.scenes[1].narration='平均で20%も節約できます。';assert.ok(rules(b).includes('unsourced-number'));
 const c=general();c.scenes[1].narration='この習慣で必ず痩せます。';assert.ok(rules(c).includes('guarantee'));
 const d=general();d.scenes[1].cues[0].text='誰でも稼げる方法を紹介します。';assert.ok(rules(d).includes('hype'));
 for(const p of [a,b,c,d])assert.equal(lintPlan(p).ok,false);
});

test('一般テーマに投資の語があれば、投資の免責（推奨しない）も必要',()=>{
 const p=general();p.scenes[2].narration='株価や銘柄のニュースも、事実と解釈を分けて読みましょう。あなたの事実は何でしたか？';
 const d=errors(p).filter(f=>f.rule==='disclaimer');
 assert.ok(d.length>=1&&d.some(f=>f.message.includes('推奨')),JSON.stringify(d));
 const ok=general('これは学習用の解説で、個別銘柄の推奨や利益の保証はしません。');ok.scenes[2].narration=p.scenes[2].narration;
 assert.deepEqual(errors(ok).filter(f=>f.rule.startsWith('disclaimer')),[]);
});

test('投資テーマ（明示）: 正常は合格、禁止表現・保証肯定・推奨の免責欠落はerror',()=>{
 const p=raw();p.theme='investment';assert.equal(lintPlan(loadPlan(p)).ok,true);
 const f=loadPlan({...raw(),theme:'investment'});f.scenes[1].narration='おすすめ銘柄を紹介します。';assert.ok(rules(f).includes('recommendation'));
 const g=loadPlan(closing({...raw(),theme:'investment'},'投資を推奨します。利益を保証します。'));assert.ok(rules(g).includes('disclaimer-affirmative'));
 const h=loadPlan(closing({...raw(),theme:'investment'},'これは学習用の解説です。実践の結果を保証するものではありません。'));
 assert.ok(errors(h).some(f=>f.rule==='disclaimer'&&f.message.includes('推奨')),'投資テーマは推奨の免責が必須');
});

test('旧形式（theme未指定）は投資扱いで、一般テーマ向けの軽い免責では通らない',()=>{
 const p=loadPlan(closing(raw(),'これは学習用の解説です。実践の結果を保証するものではありません。'));
 assert.ok(errors(p).some(f=>f.rule==='disclaimer'&&f.message.includes('推奨')));assert.equal(lintPlan(p).ok,false);
});

test('投資の台本のthemeをgeneralに変えても、禁止表現・出典なし数値・具体例の区別は検査される',()=>{
 const base=()=>{const p=raw();p.theme='general';return p};
 const a=loadPlan(base());a.scenes[1].narration='今すぐ買うのが正解です。';assert.ok(rules(a).includes('recommendation'));
 const b=loadPlan(base());b.scenes[1].narration='年率5%の例を考えます。';assert.ok(rules(b).includes('unsourced-number'));
 const c=loadPlan(base());c.scenes[1].fictional=false;assert.ok(rules(c).includes('example-label'));
 const d=loadPlan(base());d.thumbnail={headline:'必ず儲かる判断'};assert.ok(rules(d).includes('guarantee'));
});

test('導入文のlint: 欠落は短尺warning/本番尺error、出典か架空の明示が必要、数値・禁止表現も検査',()=>{
 const p=general();const m=lintPlan(p).findings.find(f=>f.rule==='intro-missing')!;assert.equal(m.level,'warning');
 const long=general();for(const s of long.scenes){s.seconds=40;s.cues=[{text:s.cues[0].text,seconds:40}]}
 assert.ok(lintPlan(long).findings.some(f=>f.rule==='intro-missing'&&f.level==='error'));
 const a=general();a.intro={text:'物価のニュースから考えます。',sources:[]};assert.ok(rules(a).includes('intro-source'));
 const b=general();b.intro={text:'スーパーで値札を見て迷った場面から考えます。',sources:[],fictional:true};assert.ok(!lintPlan(b).findings.some(f=>/intro/.test(f.rule)));
 const c=general();c.sources=[src];c.intro={text:'物価が3%上がったというニュースから考えます。',sources:[]};assert.ok(rules(c).includes('unsourced-number'));
 const d=general();d.sources=[src];d.intro={text:'必ず儲かる方法のニュースから考えます。',sources:['s1']};assert.ok(rules(d).includes('guarantee'));
 const e=general();e.sources=[src];e.intro={text:'物価のニュースから考えます。',sources:['s1']};
 const r=lintPlan(e);assert.ok(!r.findings.some(f=>/intro|unused-source/.test(f.rule)),'導入だけで使う出典は未使用扱いしない');
});

test('概要欄（T103）: 導入文を先頭に置き、出典の文献名・URL・確認日・使用箇所をmetadataに保存',()=>{
 const p=general();p.sources=[src,{id:'s2',title:'調査報告',url:'https://example.org/b',accessedAt:'2026-10-09'}];
 p.scenes[2].sources=['s2'];p.scenes[3].sources=['s2','s1'];p.intro={text:'物価のニュースから考えます。',sources:['s1']};
 const m=buildMetadata(p,{sources:sourcesText(p),stance:'免責'});
 assert.ok(m.description.startsWith('物価のニュースから考えます。'));
 assert.match(m.description,/1\. 調査報告（確認日 2026-10-09） https:\/\/example.org\/b/);
 assert.match(m.description,/2\. 公式資料（確認日 2026-10-10） https:\/\/example.org\/a/);
 assert.deepEqual(m.sources.map(s=>[s.number,s.id,s.url,s.accessedAt,s.scenes,s.intro]),[[1,'s2','https://example.org/b','2026-10-09',[3,4],false],[2,'s1','https://example.org/a','2026-10-10',[4],true]]);
 assert.match(m.sourcesNote,/主張/);
 assert.equal(m.intro,'物価のニュースから考えます。');
 const bad=general();bad.intro={text:'物価のニュースです。',sources:[],fictional:true};bad.intro.text='<b>導入</b>';assert.ok(!buildMetadata(bad,{sources:'',stance:''}).description.includes('<'));
});

test('新テーマのサンプル（fixtures/sample-general.json）: 一般テーマ・開発用の架空例・導入と出典あり・安全検査合格',()=>{
 const raw=JSON.parse(readFileSync('fixtures/sample-general.json','utf8'));const p=loadPlan(raw);
 assert.equal(themeOf(p),'general');assert.ok(p.intro&&p.intro.sources.length>0);assert.ok(p.sources.length>0);
 assert.match(raw.note,/開発用/);assert.ok(p.scenes.some(s=>s.fictional));
 const r=lintPlan(p);assert.equal(r.errors,0,JSON.stringify(r.findings));
 const m=buildMetadata(p,{sources:sourcesText(p),stance:'免責'});assert.equal(m.ok,true,m.issues.join(' / '));
 assert.ok(m.description.startsWith(p.intro!.text));for(const s of p.sources)assert.ok(m.description.includes(s.url));
 assert.ok(m.chapters.length>=3,'YouTubeのチャプター条件（3つ以上・各10秒以上）を満たす');
});
