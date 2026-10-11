import assert from 'node:assert/strict';
import test from 'node:test';
import type {Channel} from '../shared/analysis.ts';
import {channelValue as sharedValue} from '../shared/channels.ts';
import {EASINGS, EASING_NAMES} from '../shared/easing.ts';
import {channelValue as remotionValue, REMOTION_EASING} from '../src/channel-value.ts';

test('解析器のイージング候補はRemotionのEasingと同じ値を返す', () => {
  for (const name of EASING_NAMES) {
    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      assert.ok(Math.abs(EASINGS[name](t) - REMOTION_EASING[name](t)) < 1e-12, `${name} t=${t}`);
    }
  }
});

test('再現用チャンネルの値は解析器側とRemotion側（interpolate）で一致する', () => {
  const c: Channel = {
    initial: 10,
    segments: [
      {f0: 5.3, f1: 20.7, v0: 10, v1: 200, easing: {kind: 'named', name: 'easeOutBack'}, model: false},
      {f0: 30, f1: 34, v0: 200, v1: 180, easing: {kind: 'samples', frames: [30, 31, 32, 33, 34], values: [200, 195, 191, 182, 180]}, model: false},
      {f0: 40.5, f1: 60.25, v0: 180, v1: -40, easing: {kind: 'named', name: 'easeInOutSine'}, model: true},
    ],
  };
  for (let f = 0; f <= 70; f += 0.25) assert.ok(Math.abs(sharedValue(c, f) - remotionValue(c, f)) < 1e-9, `frame ${f}`);
  assert.equal(remotionValue(c, 0), 10);
  assert.equal(remotionValue(c, 25), 200);
  assert.equal(remotionValue(c, 36), 180);
  assert.equal(remotionValue(c, 70), -40);
  // easeOutBackは行き過ぎてから戻る（値の上限で切らない）
  assert.ok(Math.max(...Array.from({length: 61}, (_, i) => remotionValue(c, 5.3 + i * 0.25))) > 200);
});
