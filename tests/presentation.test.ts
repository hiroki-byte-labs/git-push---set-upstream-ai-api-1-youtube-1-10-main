// 見せ方の改善（T106）: 集計の図（meter）、意味を示す動き（travel）、説明の時刻に合わせた段の表示（reveal）、
// 文字配置の検査（layout）、サムネイル案の入力（keyword/contrast）、焼き込み字幕の既定。
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {loadPlan,validatePlanV2,diagramSteps,LIMITS} from '../src/plan.ts';
import {buildSegments,buildRenderSpec,buildThumbSpecs,thumbContrast,hasMotion,MOTION_FRAMES,FPS} from '../src/timeline.ts';
import {lintPlan} from '../src/lint.ts';
import {checkLayout,checkLayoutRecords,ZONES} from '../src/layout.ts';
import {injectReflection} from '../src/production.ts';
const draft=()=>JSON.parse(readFileSync('fixtures/draft-price-index.json','utf8'));
const filled=()=>loadPlan(injectReflection(draft(),'試験用の考察の文です。本人の考察ではありません。'));
const clone=(x:any)=>JSON.parse(JSON.stringify(x));

test('meterの検証: 棒は2〜5本、値は−1〜1、まとめの見出しが必要。motionはflowのtravelだけ',()=>{
 const base=draft();const meter=base.scenes[4].diagram;assert.equal(meter.type,'meter');assert.equal(diagramSteps(meter),meter.bars.length+1);
 for(const bad of [{...meter,bars:[meter.bars[0]]},{...meter,bars:[...meter.bars,...meter.bars]},{...meter,bars:[{label:'パン',value:1.5},meter.bars[1]]},{...meter,bars:[{label:'あ'.repeat(LIMITS.meterLabel+1),value:0},meter.bars[1]]},{...meter,total:''}]){const p=clone(base);p.scenes[4].diagram={...bad,reveal:undefined};assert.throws(()=>validatePlanV2(p),/図解が不正/)}
 const m=clone(base);m.scenes[1].diagram.motion='travel';assert.throws(()=>validatePlanV2(m),/motion/);
 const ok=clone(base);ok.scenes[5].diagram.motion='travel';assert.doesNotThrow(()=>validatePlanV2(ok));
});

test('revealの検証: 段数と同じ長さ・0始まり・昇順・場面の秒数未満',()=>{
 for(const r of [[0,2],[1,2,3],[0,3,2],[0,2,10],[0,2,'x']]){const p=draft();p.scenes[0].diagram.reveal=r;assert.throws(()=>validatePlanV2(p),/reveal/)}
 const p=draft();p.scenes[0].diagram.reveal=[0,1,9.5];assert.doesNotThrow(()=>validatePlanV2(p));
});

test('段の表示は説明の時刻（reveal）に合わせる。動きのある段は1フレームずつ進み、総フレーム数は変わらない',()=>{
 const p=filled();const g=buildSegments(p);
 assert.equal(g.reduce((n,x)=>n+x.frames,0),p.scenes.reduce((n,s)=>n+s.seconds,0)*FPS);
 const sceneStart=(i:number)=>p.scenes.slice(0,i).reduce((n,s)=>n+s.seconds,0)*FPS;
 // 場面1（flow・travel、reveal [0, 2.5, 5]）: 2段目は2.5秒、3段目は5秒（2つ目の字幕の開始）から。
 const s1=g.filter(x=>x.scene===0);assert.equal(s1.find(x=>x.step===2)!.startFrame,sceneStart(0)+2.5*FPS);assert.equal(s1.find(x=>x.step===3)!.startFrame,sceneStart(0)+5*FPS);
 const moving=s1.filter(x=>x.step===2&&x.motion!==undefined);assert.equal(moving.length,MOTION_FRAMES-1);assert.ok(moving.every(x=>x.frames===1&&/-m\d+/.test(x.file)));
 assert.deepEqual(moving.map(x=>x.motion),Array.from({length:MOTION_FRAMES-1},(_,k)=>(k+1)/MOTION_FRAMES));
 assert.ok(!s1.some(x=>x.step===1&&x.motion!==undefined),'flowの1段目は矢印がないので動きなし（フェード）');
 // 場面5（meter、reveal [0,1.2,2.4,3.6,6]）: まとめの棒は「まとめると」の字幕（6秒）と同時に伸び始める。
 const s5=g.filter(x=>x.scene===4);const total=s5.find(x=>x.step===5)!;assert.equal(total.startFrame,sceneStart(4)+6*FPS);assert.equal(total.cue,1);assert.ok(total.motion!>0&&total.motion!<1);
 assert.ok(hasMotion(p.scenes[4].diagram,0)&&hasMotion(p.scenes[0].diagram,1)&&!hasMotion(p.scenes[0].diagram,0)&&!hasMotion(p.scenes[1].diagram,1));
 const spec=buildRenderSpec(p,g,'burn');assert.ok(spec.frames.some(f=>f.motion!==undefined&&f.motion<1));
 const still=clone(p);still.style={transitions:false};assert.ok(buildSegments(still).every(x=>x.motion===undefined));
});

test('meterとサムネイルの文言も禁止表現の検査対象（改行で分けても検出）',()=>{
 const a=filled();(a.scenes[4].diagram as any).bars[0].label='必ず儲かる';assert.ok(lintPlan(a).findings.some(f=>f.rule==='guarantee'&&f.where.includes('図解')));
 const b=filled();b.thumbnail={...b.thumbnail!,keyword:'爆上げ'};assert.ok(lintPlan(b).findings.some(f=>f.rule==='hype'&&f.where==='サムネイル'));
 const c=filled();c.thumbnail={...c.thumbnail!,headline:'必ず\n儲かる'};assert.ok(lintPlan(c).findings.some(f=>f.rule==='guarantee'&&f.where==='サムネイル'));
 const d=draft();d.thumbnail.contrast=['あ'.repeat(LIMITS.thumbContrast+1),'b'];assert.throws(()=>validatePlanV2(d),/contrast/);
 const e=draft();e.thumbnail.keyword='あ'.repeat(LIMITS.thumbKeyword+1);assert.throws(()=>validatePlanV2(e),/keyword/);
});

test('サムネイル案: 問い型・図解型・対比型。対比の文言は明示か図解から補う',()=>{
 const p=filled();const s=buildThumbSpecs(p);assert.deepEqual(s.map(x=>x.variant),['a','b','c']);assert.equal(s[0].keyword,'物価');assert.deepEqual(s[2].contrast,['1つの値札','家計全体']);assert.equal(s[1].scene,4);
 const q=clone(p);delete q.thumbnail.contrast;assert.deepEqual(thumbContrast(q),['パン','まとめた物価'],'thumbnail.sceneのmeterから');
 const v2=loadPlan(JSON.parse(readFileSync('fixtures/sample-v2.json','utf8')));assert.deepEqual(thumbContrast(v2),['事実','解釈']);
});

// 修正前の描画（scripts/render.swiftを固定の高さ100の枠の上端から描いていた）で起きていたずれを、記録の形で再現して検出できることを確かめる。
const rec=(o:any)=>({file:'s1-st1-c1.png',role:'字幕',text:'テスト',zone:'subtitle',box:[70,102,1140,108],drawn:[600,138,80,36],align:'center',...o});
test('文字配置の検査: 正しい配置は合格',()=>{assert.deepEqual(checkLayoutRecords([rec({})]),{ok:true,checked:1,issues:[]})});
test('文字配置の検査: 旧描画のずれ（番号が枠の外、1行の字幕が枠の上寄り、字幕とフッターの重なり、強調と図解の重なり）を検出',()=>{
 const numberOutside=rec({role:'図解番号',text:'01',zone:'diagram',box:[78,376,60,24],drawn:[78,404,24,24]});
 const subtitleTop=rec({drawn:[600,174,80,36]});
 const overlapFooter=[rec({drawn:[600,40,80,36],box:[70,30,1140,108]}),rec({role:'フッター',text:'音声：自作の確認音',zone:'footer',box:[480,22,600,36],drawn:[560,30,300,20]})];
 const chipOnDiagram=[rec({role:'強調',text:'物価',zone:'emphasis',box:[76,468,60,28],drawn:[76,450,60,24]}),rec({role:'図解',text:'ニュース',zone:'diagram',box:[78,294,300,76],drawn:[78,440,100,30]})];
 const r=checkLayoutRecords([numberOutside,subtitleTop,...overlapFooter,...chipOnDiagram]);
 assert.equal(r.ok,false);
 assert.ok(r.issues.some(i=>/図解番号「01」: 文字が入れ物の枠からはみ出す/.test(i)));
 assert.ok(r.issues.some(i=>/字幕「テスト」: 枠の上下中央から\d+\.\dptずれる/.test(i)));
 assert.ok(r.issues.some(i=>/subtitleの「テスト」とfooterの「音声：自作の確認音」が重なる/.test(i)));
 assert.ok(r.issues.some(i=>/区画「subtitle」の外/.test(i)));
 assert.ok(r.issues.some(i=>/emphasisの「物価」とdiagramの「ニュース」が重なる|diagramの「ニュース」とemphasisの「物価」が重なる/.test(i)));
 assert.equal(checkLayoutRecords([rec({file:'thumbnail-a.png',drawn:[0,0,10,10]})]).checked,0,'サムネイルは区画の検査の対象外');
 const d=mkdtempSync(join(tmpdir(),'layout-'));try{writeFileSync(join(d,'render-report.json'),JSON.stringify([numberOutside]));assert.equal(checkLayout(d).ok,false)}finally{rmSync(d,{recursive:true,force:true})}
 assert.throws(()=>checkLayout(tmpdir()+'/no-such-dir-'+Date.now()),/render-report/);
});
test('区画どうしは重ならない（scripts/render.swiftのZONE_*と同じ値）',()=>{
 const z=Object.entries(ZONES);for(let i=0;i<z.length;i++)for(let j=i+1;j<z.length;j++){const [a,b]=[z[i][1],z[j][1]];assert.ok(!(a[0]<b[0]+b[2]&&b[0]<a[0]+a[2]&&a[1]<b[1]+b[3]&&b[1]<a[1]+a[3]),`${z[i][0]}と${z[j][0]}`)}
 const swift=readFileSync('scripts/render.swift','utf8');for(const [k,[x,y,w,h]] of z)assert.ok(swift.includes(`ZONE_${k==='emphasis'?'EMPH':k==='subtitle'?'SUB':k.toUpperCase()}=NSRect(x:${x},y:${y},width:${w},height:${h})`),k);
});

test('下書き（fixtures/draft-price-index.json）: 考察を差し込めば安全検査に合格し、構成案の章がそろう',()=>{
 const p=filled();const r=lintPlan(p);assert.equal(r.errors,0,JSON.stringify(r.findings));assert.equal(r.warnings,0,JSON.stringify(r.findings));
 assert.deepEqual([...new Set(p.scenes.map(s=>s.chapter))],['導入','身近な例','仕組み','本人の考察','活かし方']);
 assert.equal(p.scenes.filter(s=>s.role==='reflection').length,1);assert.ok(p.scenes.some(s=>s.diagram.type==='meter'));
});
