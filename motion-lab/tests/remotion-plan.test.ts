import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {toRemotionPlanProps} from '../src/remotion-plan.ts';
import {loadPlan} from '../../src/plan.ts';

test('toRemotionPlanProps: 台本JSONからRemotion Propsへの正常変換', () => {
  const planPath = new URL('../../fixtures/sample-v2.json', import.meta.url).pathname;
  const rawPlan = JSON.parse(readFileSync(planPath, 'utf8'));
  const plan = loadPlan(rawPlan);

  const props = toRemotionPlanProps(plan, 30, 1920, 1080);

  assert.equal(props.id, 'bias-check-demo');
  assert.equal(props.fps, 30);
  assert.equal(props.width, 1920);
  assert.equal(props.height, 1080);
  assert.equal(props.scenes.length, plan.scenes.length);

  // 総フレーム数の検証
  const expectedTotalSeconds = plan.scenes.reduce((acc, s) => acc + s.seconds, 0);
  assert.equal(props.totalFrames, expectedTotalSeconds * 30);

  // 第1シーンの検証
  const s0 = props.scenes[0];
  assert.equal(s0.index, 1);
  assert.equal(s0.startFrame, 0);
  assert.equal(s0.durationFrames, plan.scenes[0].seconds * 30);
  assert.equal(s0.cues.length, plan.scenes[0].cues.length);
  assert.equal(s0.cues[0].startFrame, 0);
  assert.equal(s0.cues[0].durationFrames, Math.round(plan.scenes[0].cues[0].seconds * 30));

  // 第2シーンの開始フレームが第1シーンの終端と一致すること
  const s1 = props.scenes[1];
  assert.equal(s1.startFrame, s0.startFrame + s0.durationFrames);
});
