import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {illustrationFrame,smoothProgress,archetypeForMotif} from '../src/illustration.ts';
import {loadPlan} from '../src/plan.ts';
import {buildSegments,buildRenderSpec,FPS} from '../src/timeline.ts';

test('late reveal starts invisible and enters gradually, without resetting prior people',()=>{
  const state=(t:number)=>illustrationFrame('attention-concentration',t,[0,2,4],6);
  assert.equal(state(2).figures.at(-1)!.opacity,0);
  assert.ok(state(2.35).figures.at(-1)!.opacity>0 && state(2.35).figures.at(-1)!.opacity<1);
  assert.equal(state(3).figures.at(-1)!.opacity,1);
  assert.deepEqual(state(3).figures,state(4.1).figures);
  assert.ok(state(2.35).figures.at(-1)!.y>state(3).figures.at(-1)!.y);
});
test('digital listeners fade in after signal travel, not as binary threshold pops',()=>{
  const a=illustrationFrame('digital-reach',2.5,[0,2,4],6);
  assert.ok(a.figures[1].opacity>0 && a.figures[1].opacity<.82);
  assert.equal(a.figures[4].opacity,0);
  assert.equal(illustrationFrame('digital-reach',3.8,[0,2,4],6).figures[4].opacity,.82);
});
test('native render schedule carries continuous, cue-relative illustration frames',()=>{
  const plan=loadPlan(JSON.parse(readFileSync('fixtures/sample-superstar-illustration.json','utf8')));
  const segments=buildSegments(plan);
  const spec=buildRenderSpec(plan,segments);
  const nearReveal=segments.filter(s=>s.scene===0 && s.startFrame>=2*FPS && s.startFrame<2*FPS+12);
  assert.equal(nearReveal.length,12);
  assert.ok(nearReveal.every(s=>s.frames===1));
  const states=nearReveal.map(s=>spec.frames.find(f=>f.file===s.file) as unknown as {illustration?:{figures:{opacity:number}[]}});
  assert.equal(states[0].illustration?.figures.at(-1)?.opacity,0);
  assert.ok(states[6].illustration!.figures.at(-1)!.opacity>0);
  assert.equal(segments.reduce((n,s)=>n+s.frames,0),30*FPS);
});
test('easing is monotonic, bounded and stationary at endpoints; transitions=false settles',()=>{
  assert.equal(smoothProgress(-1,.7),0); assert.equal(smoothProgress(1,.7),1);
  const p=Array.from({length:101},(_,i)=>smoothProgress(i/100,.7));
  assert.ok(p.every((v,i)=>v>=0 && v<=1 && (!i || v>=p[i-1])));
  assert.ok(smoothProgress(.001,1)<.000001);
  const still=illustrationFrame('attention-concentration',5.9,[0,2,4],6,false);
  assert.equal(still.opacity,1); assert.equal(still.figures.at(-1)!.y,212);
});

test('branching-tree reveals generations gradually and marks extinction vs survival', () => {
  const early = illustrationFrame('branching-tree', 0.5, [0, 2, 4], 6);
  assert.equal(early.figures.length, 6);
  assert.ok(early.figures[0].opacity > 0);
  assert.equal(early.figures[1].opacity, 0);
  assert.equal(early.labels[0].text, '祖先');
  assert.ok(early.labels[0].opacity > 0);

  const mid = illustrationFrame('branching-tree', 2.8, [0, 2, 4], 6);
  assert.ok(mid.figures[1].opacity > 0);
  assert.ok(mid.lines[0].opacity > 0);
  assert.equal(mid.figures[4].opacity, 0); // gen2 not yet revealed

  const late = illustrationFrame('branching-tree', 5.0, [0, 2, 4], 6);
  assert.ok(late.figures[4].opacity > 0);
  assert.ok(late.labels.some(l => l.text === '途絶' && l.opacity > 0));
  assert.ok(late.labels.some(l => l.text === '残存と集中' && l.opacity > 0));
});

test('tolerance-boundary reveals protective perimeter and external containment', () => {
  const stage0 = illustrationFrame('tolerance-boundary', 0.5, [0, 2, 4], 6);
  assert.equal(stage0.figures.length, 4);
  assert.ok(stage0.figures[0].opacity > 0);
  assert.equal(stage0.figures[3].opacity, 0); // external figure invisible
  assert.equal(stage0.lines[0].opacity, 0); // boundary line invisible

  const stage1 = illustrationFrame('tolerance-boundary', 2.5, [0, 2, 4], 6);
  assert.ok(stage1.lines[0].opacity > 0); // boundary line visible
  assert.equal(stage1.figures[3].opacity, 0);
  assert.ok(stage1.labels.some(l => l.text === '防衛境界' && l.opacity > 0));

  const stage2 = illustrationFrame('tolerance-boundary', 4.8, [0, 2, 4], 6);
  assert.ok(stage2.figures[3].opacity > 0); // external figure visible
  assert.ok(stage2.lines[1].opacity > 0); // approach/rejection line visible
  assert.ok(stage2.labels.some(l => l.text === '不寛容の排除' && l.opacity > 0));
});

test('archetypeForMotif maps illustration motifs to valid scene archetypes', () => {
  assert.equal(archetypeForMotif('branching-tree'), 'data-quantity');
  assert.equal(archetypeForMotif('lineage-convergence'), 'resonance');
  assert.equal(archetypeForMotif('tolerance-boundary'), 'contrast');
  assert.equal(archetypeForMotif('social-division'), 'scenery');
  assert.equal(archetypeForMotif('attention-concentration'), 'causal-relation');
});
