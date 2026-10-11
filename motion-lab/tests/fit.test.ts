import assert from 'node:assert/strict';
import test from 'node:test';
import type {EasingName} from '../shared/analysis.ts';
import {EASINGS} from '../shared/easing.ts';
import {classifyEasing, deltaNoise, detectRuns, fitSegment, type Series} from '../tools/lib/fit.ts';

// 再現できる疑似乱数（線形合同法＋Box-Muller）。
function rng(seed: number) {
  let s = seed;
  const u = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  return () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u());
}

function series(name: EasingName, t0: number, t1: number, v0: number, v1: number, n: number, noise: number, seed = 1, from = 0): Series {
  const g = rng(seed), frames: number[] = [], values: number[] = [];
  for (let f = from; f < n; f++) {
    const p = Math.min(1, Math.max(0, (f - t0) / (t1 - t0)));
    frames.push(f);
    values.push(v0 + (v1 - v0) * EASINGS[name](p) + noise * g());
  }
  return {frames, values};
}

function fitOne(s: Series, noise: number, bounds = {}) {
  const dn = deltaNoise(s), runs = detectRuns(s, Math.max(0.05, 5 * dn), Math.max(0.75, 10 * dn));
  assert.equal(runs.length, 1, `区間は1つ（${JSON.stringify(runs)}）`);
  const fit = fitSegment(s, runs[0], -1, s.values.length, 8, bounds);
  return {fit, easing: classifyEasing(fit.candidates, Math.max(noise, 0.02), fit.samples)};
}

test('イージングと開始・終了時刻（小数フレーム）を復元する', () => {
  for (const [name, t0, t1] of [['easeOutCubic', 10.3, 40.7], ['easeInOutCubic', 12, 54], ['linear', 8.5, 31.25], ['easeOutBack', 20, 50], ['easeInOutQuad', 5.6, 35.6]] as const) {
    const {fit, easing} = fitOne(series(name, t0, t1, 100, 400, 70, 0.05), 0.05);
    assert.equal(easing.status, 'estimated', `${name}: ${easing.reason}`);
    assert.equal(easing.best, name);
    assert.ok(Math.abs(fit.candidates[0].t0 - t0) < 0.15, `${name} t0=${fit.candidates[0].t0}`);
    assert.ok(Math.abs(fit.candidates[0].t1 - t1) < 0.15, `${name} t1=${fit.candidates[0].t1}`);
    assert.ok(fit.v0Observed && fit.v1Observed);
  }
});

test('雑音に対して候補の差が小さいときはambiguousとして断定しない', () => {
  // 振幅に対して雑音が大きいと、easeInOutSineとeaseInOutQuadは区別できない（区間は既知として当てはめだけ確かめる）。
  const noise = 1.5, s = series('easeInOutSine', 10, 40, 0, 30, 60, noise, 7);
  const fit = fitSegment(s, {ia: 11, ib: 40}, -1, s.values.length);
  const easing = classifyEasing(fit.candidates, noise, fit.samples);
  assert.equal(easing.status, 'ambiguous', JSON.stringify(easing));
  assert.ok(easing.candidates.some(c => c.name === 'easeInOutSine'));
});

test('候補にない動きはunknownとし、最良候補を断定しない', () => {
  // 途中で一度止まる2段階の動き（どの候補関数とも形が違う）。
  const frames: number[] = [], values: number[] = [];
  for (let f = 0; f < 70; f++) {
    frames.push(f);
    const a = Math.min(1, Math.max(0, (f - 10) / 10)), b = Math.min(1, Math.max(0, (f - 35) / 10));
    values.push(100 + 150 * a + 150 * b);
  }
  const s = {frames, values}, runs = detectRuns(s, 0.05, 0.75, 20);
  const fit = fitSegment(s, runs[0], -1, s.values.length);
  const e = classifyEasing(fit.candidates, 0.02, fit.samples);
  assert.equal(e.status, 'unknown');
  assert.equal(e.best, null);
  assert.ok(e.reason);
});

test('動作中から観測が始まる場合は開始値を観測済みとしない', () => {
  // フレーム16から観測（それ以前は画面外などで見えない）。
  const {fit} = fitOne(series('easeOutCubic', 15, 51, -140, 300, 90, 0.05, 3, 16), 0.05);
  assert.equal(fit.v0Observed, false);
  assert.equal(fit.v1Observed, true);
});

test('大きさの下限（0以上）を使って開始時刻のモデル値を決める', () => {
  // 幅0から直線で伸びる。開始が観測できず、下限がなければ開始時刻と開始値は決まらない。
  const s = series('linear', 78, 114, 0, 800, 150, 0.05, 5, 79);
  const {fit} = fitOne(s, 0.05, {lo: 0});
  const best = fit.candidates.find(c => c.name === 'linear')!;
  assert.ok(best.v0 >= 0, `v0=${best.v0}`);
  assert.ok(best.t0 <= 79);
});

test('半分以上のフレームで動く系列でも雑音を過大に見積もらない', () => {
  // 70フレーム中40フレームが動く（中央値は動きの差になる）。
  const s = series('linear', 10, 50, 0, 800, 70, 0.05, 9);
  assert.ok(deltaNoise(s) < 0.3, `noise=${deltaNoise(s)}`);
  // 動く割合がさらに多くても、上限capで頭打ちにする。
  assert.equal(deltaNoise(series('linear', 2, 66, 0, 800, 70, 0.05, 9), 0.3), 0.3);
});
