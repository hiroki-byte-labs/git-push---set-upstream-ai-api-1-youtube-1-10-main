import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ff} from '../src/media.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {checkLayoutRecords} from '../src/layout.ts';
import {layoutFrames, validateCoverage, diagramTexts, generateMeasuredReport, contrastRatio} from '../src/remotion-layout.ts';
import {toRemotionPlanProps} from '../motion-lab/src/remotion-plan.ts';
import {validatePlanV2} from '../src/plan.ts';

test('stress Plan contains all diagram kinds, maximum fields, later 55-character cues', () => {
  const p = JSON.parse(readFileSync('fixtures/remotion-layout-stress.json','utf8'));
  validatePlanV2(p);
  assert.equal(p.scenes[0].title.length,30);
  assert.equal(p.scenes[0].cues[0].text.length,55);
  assert.equal(p.scenes.at(-1).cues[1].text.length,55);
  assert.deepEqual(p.scenes.map((s:any)=>s.diagram.type), ['flow','compare','number','branch','meter']);
  for (const height of [720,1080]) {
    const props = toRemotionPlanProps(p,24,height*16/9,height);
    assert.equal(layoutFrames(props).length,15);
    const branch = props.scenes.find((s:any)=>s.diagram.type === 'branch')!;
    assert.equal(branch.diagram.type, 'branch');
    if (branch.diagram.type !== 'branch') throw Error('branch fixture missing');
    assert.deepEqual(diagramTexts(branch), [branch.diagram.question, 'YES: ', branch.diagram.yes, 'NO: ', branch.diagram.no]);
    assert.throws(()=>validateCoverage(props,[]),/DOM測定欠落/);
    const source = readFileSync('src/remotion-visual.ts','utf8');
    assert.doesNotMatch(source,/contrast: 18\.5|drawn: \[120, 540/);
  }
});
const rec = {file:'frame-48.png',role:'diagram',text:'overflow',zone:'diagram',coordinateSystem:'remotion-720-bottom-left',box:[80,180,1120,390],zoneBounds:[80,180,1120,390],drawn:[90,200,100,30],parentBox:[80,180,1120,390]};
test('measured Remotion overflow, same-zone collision and third subtitle line fail layout',()=>{
  assert.equal(checkLayoutRecords([rec]).ok,true);
  assert.equal(checkLayoutRecords([{...rec,drawn:[90,200,1200,30]}]).ok,false);
  assert.equal(checkLayoutRecords([{...rec,parentBox:[90,200,10,10]}]).ok,false);
  assert.equal(checkLayoutRecords([rec,{...rec,text:'collision'}]).ok,false);
  assert.equal(checkLayoutRecords([{...rec,zone:'subtitle',maxLines:2,lines:[[0,0,1,1],[0,20,1,1],[0,40,1,1]]}]).ok,false);
});
test('contrast is calculated from actual color pairs',()=>{
  assert.equal(contrastRatio([255,255,255],[0,0,0]),21);
  assert.equal(contrastRatio([248,250,252],[248,250,252]),1);
});

test('coverage rejects a missing later cue, title and source sample in either resolution',()=>{
  const plan = validatePlanV2(JSON.parse(readFileSync('fixtures/remotion-layout-stress.json','utf8')));
  for (const h of [720,1080]) {
    const props = toRemotionPlanProps(plan,24,h*16/9,h);
    const samples = layoutFrames(props).map(frame=>{
      const s = props.scenes.find(s=>frame>=s.startFrame && frame<s.startFrame+s.durationFrames)!;
      const cue = s.cues.find(c=>frame>=c.startFrame && frame<c.startFrame+c.durationFrames)!;
      const r = {box:[0,0,1,1],drawn:[0,0,1,1],parentBox:[0,0,1,1],lines:[[0,0,1,1]],pixelSize:24,foreground:'rgb(255,255,255)',opacity:1,fontFamily:'sans-serif'};
      return {frame,scene:s.index,width:props.width,height:h,records:[{...r,zone:'title',text:s.title},{...r,zone:'subtitle',text:cue.text},{...r,zone:'source',text:s.sourceReferences.map(r=>`[${r.number}]`).join('')},...diagramTexts(s).map(text=>({...r,zone:'diagram',text}))]};
    });
    assert.doesNotThrow(()=>validateCoverage(props,samples));
    for (const zone of ['subtitle','title','source','diagram']) {
      const broken = structuredClone(samples); for (const x of broken) x.records = x.records.filter(r=>r.zone!==zone);
      assert.throws(()=>validateCoverage(props,broken),/測定欠落/);
    }
  }
});

test('measured box outside the output screen cannot pass by moving its zone with it',()=>{
  assert.equal(checkLayoutRecords([{...rec,box:[1400,0,100,100],zoneBounds:[1400,0,100,100],parentBox:[1400,0,100,100],drawn:[1410,10,40,20]}]).ok,false);
});

test('report converts DOM pixel rectangles and measures real background PNG colors at 720p/1080p (synthetic DOM input)',()=>{
  const plan = validatePlanV2(JSON.parse(readFileSync('fixtures/remotion-layout-stress.json','utf8')));
  plan.scenes = [{...plan.scenes[0],title:'title',sources:[],seconds:2,cues:[{text:'cue',seconds:2}],diagram:{type:'flow',items:['a','b']}}];
  for (const height of [720,1080]) {
    const props = toRemotionPlanProps(plan,24,height*16/9,height);
    props.layoutFrames = layoutFrames(props);
    const dir = mkdtempSync(join(tmpdir(),'T155-pixels-'));
    try {
      ff(['-f','lavfi','-i',`color=c=blue:s=${props.width}x${height}:r=24:d=2`,'-c:v','libx264','-pix_fmt','yuv420p',join(dir,'sample.mp4')]);
      const samples = props.layoutFrames.map(frame=>({frame,scene:1,width:props.width,height,records:['title','subtitle','diagram','diagram'].map((zone,i)=>({zone,text:['title','cue','a','b'][i],box:[0,0,props.width,height],drawn:[20,30+i*40,80,20],parentBox:[0,0,props.width,height],lines:[[20,30+i*40,80,20]],pixelSize:height/30,foreground:'rgb(255, 255, 255)',opacity:1,fontFamily:'sans-serif'}))}));
      writeFileSync(join(dir,'layout-dom.json'),JSON.stringify(samples));
      for (const frame of props.layoutFrames) ff(['-f','lavfi','-i',`color=c=black:s=${props.width}x${height}`,'-frames:v','1',join(dir,`background-${frame}.png`)]);
      const records = generateMeasuredReport(props,dir);
      assert.equal(records.length,8);
      assert.ok(records.every(r=>r.contrast===21));
      assert.ok(records.every(r=>r.size===24));
      assert.equal(records[0].drawn[0],20/(height/720));
      assert.equal(records[0].drawn[1],(height-50)/(height/720));
      assert.equal(records.filter(r=>r.zone==='subtitle' && r.readabilitySample).length,1);
    } finally {rmSync(dir,{recursive:true,force:true});}
  }
});

test('intentional overflow Plan is schema-valid and exceeds the dedicated source row',()=>{
  const plan = validatePlanV2(JSON.parse(readFileSync('fixtures/remotion-layout-overflow.json','utf8')));
  const props = toRemotionPlanProps(plan);
  assert.equal(props.scenes[0].sourceReferences.length,200);
  // Runtime DOM verification remains necessary; this validates the negative input,
  // while the measured-record negative cases above verify the layout decision.
});
