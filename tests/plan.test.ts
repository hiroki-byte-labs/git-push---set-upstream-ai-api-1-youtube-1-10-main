import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {loadPlan,validatePlanV2,toV2,totalSeconds,LIMITS} from '../src/plan.ts';
import {buildVtt,vttStamp,parseSampleArgs} from '../src/commands/sample.ts';
const v1=JSON.parse(readFileSync('fixtures/sample.json','utf8'));
const v2=JSON.parse(readFileSync('fixtures/sample-v2.json','utf8'));
const clone=(x:any)=>JSON.parse(JSON.stringify(x));
test('v1は自動でv2へ変換される',()=>{const p=loadPlan(v1);assert.equal(p.schema,2);assert.equal(totalSeconds(p),36);assert.deepEqual(p.scenes[0].diagram,{type:'flow',items:v1.scenes[0].nodes});assert.equal(p.scenes[0].cues[0].text,v1.scenes[0].subtitle)});
test('v2サンプルは4種の図解を含み検証を通る',()=>{const p=loadPlan(v2);assert.deepEqual([...new Set(p.scenes.map(s=>s.diagram.type))].sort(),['branch','compare','flow','number'])});
test('cue合計と場面秒数の不一致を拒否',()=>{const p=clone(v2);p.scenes[0].cues[0].seconds=3;assert.throws(()=>validatePlanV2(p),/一致しない/)});
test('ナレーションが秒数に対して長すぎると拒否',()=>{const p=clone(v2);p.scenes[0].narration='あ'.repeat(8*LIMITS.narrationCharsPerSecond+1);assert.throws(()=>validatePlanV2(p),/長すぎる/)});
test('存在しない出典の参照を拒否、正しい出典は受理',()=>{const p=clone(v2);p.scenes[0].sources=['x'];assert.throws(()=>validatePlanV2(p),/出典/);p.sources=[{id:'x',title:'公式資料',url:'https://example.org/a',accessedAt:'2026-10-08'}];assert.equal(validatePlanV2(p).sources.length,1);p.sources[0].url='http://example.org';assert.throws(()=>validatePlanV2(p),/出典/)});
test('不正な図解を拒否',()=>{const p=clone(v2);p.scenes[0].diagram={type:'flow',items:['1']};assert.throws(()=>validatePlanV2(p),/図解/);p.scenes[0].diagram={type:'pie'};assert.throws(()=>validatePlanV2(p),/図解/)});
test('長尺: 20分は受理、25分超は拒否',()=>{const scene=(i:number)=>({title:`場面${i}`,narration:'テスト',cues:[{text:'テスト',seconds:60}],diagram:{type:'flow',items:['a','b']},sources:[],seconds:60});const p={schema:2,id:'long',title:'長尺',version:1,sources:[],scenes:Array.from({length:20},(_,i)=>scene(i))};assert.equal(totalSeconds(validatePlanV2(p)),1200);p.scenes=Array.from({length:26},(_,i)=>scene(i));assert.throws(()=>validatePlanV2(p),/総尺/)});
test('不正なidを拒否（出力先の逸脱防止）',()=>{const p=clone(v2);p.id='../escape';assert.throws(()=>validatePlanV2(p),/不正な企画/)});
test('台本で選べるオリジナルイラストを検証する',()=>{const p=clone(v2);p.scenes[0].diagram.illustration='attention-concentration';assert.equal(validatePlanV2(p).scenes[0].diagram.illustration,'attention-concentration');const q=clone(v2);q.scenes[0].diagram.illustration='reference-frame';assert.throws(()=>validatePlanV2(q),/未対応の図解イラスト/)})
test('VTTはcueごと・ミリ秒',()=>{assert.equal(vttStamp(3661.5),'01:01:01.500');const vtt=buildVtt(loadPlan(v2));assert.ok(vtt.startsWith('WEBVTT'));assert.equal(vtt.match(/-->/g)!.length,12);assert.ok(vtt.includes('00:00:04.000 --> 00:00:08.000'))});
test('sampleの引数',()=>{assert.deepEqual(parseSampleArgs([]),{});assert.deepEqual(parseSampleArgs(['--plan','a.json']),{plan:'a.json'});assert.deepEqual(parseSampleArgs(['--subtitles','soft']),{subtitles:'soft'});assert.throws(()=>parseSampleArgs(['--subtitles','x']),/不明/);assert.throws(()=>parseSampleArgs(['--x']),/不明/)});
test('--budget-usdの引数',()=>{assert.deepEqual(parseSampleArgs(['--budget-usd','1.5']),{budgetUsd:1.5});assert.throws(()=>parseSampleArgs(['--budget-usd','-1']),/不明/)});
test('roleとpromiseの検証（T075）',()=>{const p=clone(v2);p.scenes[0].role='x';assert.throws(()=>validatePlanV2(p),/role/);const q=clone(v2);q.promise='あ'.repeat(41);assert.throws(()=>validatePlanV2(q),/promise/)});
test('章（T080）: 一覧、全場面必須、連続必須',async()=>{const {chaptersOf}=await import('../src/plan.ts');const p=loadPlan(v2);assert.deepEqual(chaptersOf(p).map(c=>[c.index,c.title,c.startSeconds,c.seconds]),[[1,'導入',0,8],[2,'気持ちと事実',8,16],[3,'確かめ方',24,16],[4,'まとめ',40,8]]);assert.deepEqual(chaptersOf(loadPlan(v1)),[]);const a=clone(v2);delete a.scenes[1].chapter;assert.throws(()=>validatePlanV2(a),/全場面/);const b=clone(v2);b.scenes[5].chapter='導入';assert.throws(()=>validatePlanV2(b),/連続/)});
test('beatとfictionalの検証（T081）',()=>{const p=clone(v2);p.scenes[0].beat='climax';assert.throws(()=>validatePlanV2(p),/beat/);const q=clone(v2);q.scenes[0].fictional='yes';assert.throws(()=>validatePlanV2(q),/fictional/)});
test('glossaryの検証（T083）',()=>{const p=clone(v2);p.glossary=[{term:'解釈',definition:'a'},{term:'解釈',definition:'b'}];assert.throws(()=>validatePlanV2(p),/用語/);const q=clone(v2);q.glossary=[{term:'あ'.repeat(13),definition:'a'}];assert.throws(()=>validatePlanV2(q),/用語/)});
// 既定の字幕はT078ではsoftだったが、利用者の希望（T007所感）でT106から焼き込み（ADR-019）。soft/bothは引数で選べる。
test('emphasisの検証と既定の字幕（T078、T106でburn）',async()=>{const {DEFAULT_SUBTITLES}=await import('../src/commands/sample.ts');assert.equal(DEFAULT_SUBTITLES,'burn');assert.deepEqual(parseSampleArgs(['--subtitles','soft']),{subtitles:'soft'});assert.deepEqual(parseSampleArgs(['--subtitles','both']),{subtitles:'both'});const p=clone(v2);p.scenes[0].emphasis=['a','b','c','d'];assert.throws(()=>validatePlanV2(p),/emphasis/);const q=clone(v2);q.scenes[0].emphasis=['あ'.repeat(13)];assert.throws(()=>validatePlanV2(q),/emphasis/)});
test('styleの検証（T079）',()=>{const p=clone(v2);p.style={transitions:'no'};assert.throws(()=>validatePlanV2(p),/style/)});
test('aiDisclosureの検証（T071）',()=>{const p=clone(v2);p.aiDisclosure={scopes:[],supervisor:'誰か',verified:['確認']};assert.throws(()=>validatePlanV2(p),/scopes/);const q=clone(v2);q.aiDisclosure={scopes:['a'],supervisor:'',verified:['確認']};assert.throws(()=>validatePlanV2(q),/supervisor/);const r=clone(v2);r.aiDisclosure={scopes:['a'],supervisor:'誰か',verified:[]};assert.throws(()=>validatePlanV2(r),/verified/);const s=clone(v2);s.aiDisclosure={scopes:['a'],supervisor:'誰か',verified:['確認'],realisticSyntheticMedia:'yes'};assert.throws(()=>validatePlanV2(s),/realisticSyntheticMedia/);const ok=clone(v2);ok.aiDisclosure={scopes:['下書き作成'],supervisor:'制作責任者',verified:['出典照合'],realisticSyntheticMedia:false};assert.equal(validatePlanV2(ok).aiDisclosure?.supervisor,'制作責任者')});
test('T150: 名字絶滅と寛容パラドックスの図解サンプルが検証を通る',()=>{
  const surname=loadPlan(JSON.parse(readFileSync('fixtures/sample-surname-illustration.json','utf8')));
  assert.equal(surname.id,'surname-illustration-demo');
  assert.equal(surname.scenes[0].diagram.archetype,'causal-relation');
  assert.equal(surname.scenes[0].diagram.illustration,'branching-tree');

  const tolerance=loadPlan(JSON.parse(readFileSync('fixtures/sample-tolerance-illustration.json','utf8')));
  assert.equal(tolerance.id,'tolerance-illustration-demo');
  assert.equal(tolerance.scenes[0].diagram.archetype,'contrast');
  assert.equal(tolerance.scenes[0].diagram.illustration,'tolerance-boundary');

  const bad=clone(surname);
  bad.scenes[0].diagram.archetype='unknown-archetype';
  assert.throws(()=>validatePlanV2(bad),/未対応の場面型/);
});

test('VTT: cue本文の空行・前後の空白はcue終端にしない（T174追加修正）',()=>{
 const plan=loadPlan(v2);plan.scenes[0].cues[0].text='一行目\n\n二行目\n';
 const vtt=buildVtt(plan);
 assert.ok(vtt.includes('一行目\n二行目\n'),vtt.slice(0,120));
 assert.equal(vtt.match(/-->/g)!.length,12);
 for(const block of vtt.split('\n\n').slice(1))assert.match(block,/^\d\d:\d\d:\d\d\.\d{3} --> /,block);
});
