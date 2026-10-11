import assert from 'node:assert/strict';
import test from 'node:test';
import {GROUND_TRUTH, renderFrame} from '../tools/make-reference.ts';
import {estimateBackground, observe, principal, softEdges} from '../tools/lib/vision.ts';

// 圧縮前の合成フレームで、背景・成分・サブピクセル計測を確かめる（FFmpeg不要）。
const W = GROUND_TRUTH.width, H = GROUND_TRUTH.height;

test('単色背景と、重ならない図形の位置・大きさをサブピクセルで測る', () => {
  const px = renderFrame(149);
  const bg = estimateBackground([px]);
  assert.deepEqual(bg.color.map(Math.round), [0x14, 0x21, 0x3d]);
  assert.ok(bg.coverage > 0.8);
  const obs = observe(px, W, H, bg, 149).sort((a, b) => a.cx - b.cx);
  assert.equal(obs.length, 3);
  const [card, bar, dot] = obs;
  assert.ok(Math.abs(card.left - 160) < 0.05 && Math.abs(card.right - 440) < 0.05 && Math.abs(card.top - 200) < 0.05 && Math.abs(card.bottom - 360) < 0.05, JSON.stringify(card));
  assert.ok(Math.abs(bar.right - bar.left - 800) < 0.05 && Math.abs(bar.bottom - bar.top - 24) < 0.05);
  assert.ok(Math.abs(dot.cx - 900) < 0.05 && Math.abs(dot.cy - 290) < 0.05);
  assert.ok(Math.abs(4 * Math.sqrt(dot.mxx) - 180) < 0.3, `円の直径 ${4 * Math.sqrt(dot.mxx)}`);
  // 外接矩形に対する面積比: 矩形≈1、円≈π/4
  assert.ok(card.area / ((card.right - card.left) * (card.bottom - card.top)) > 0.995);
  assert.ok(Math.abs(dot.area / ((dot.right - dot.left) * (dot.bottom - dot.top)) - Math.PI / 4) < 0.01);
  // 鋭い角の深さは小さい（角丸の判定に使う）
  assert.ok(card.cornerDepth < 0.6, `cornerDepth=${card.cornerDepth}`);
});

test('画面端で見切れた成分には見切れの印が付く', () => {
  const obs = observe(renderFrame(20), W, H, estimateBackground([renderFrame(0)]), 20);
  const card = obs.find(o => o.color[0] > 200 && o.color[2] < 100)!;
  assert.ok(card.clip.left && !card.clip.right);
});

test('細長い図形の主軸角（時計回りが正）を測る', () => {
  // 回転の途中（フレーム267: easeInOutQuadの中間で45度付近）
  const f = 267, p = (f - 252) / 30, angle = 90 * (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
  const px = renderFrame(f);
  const obs = observe(px, W, H, estimateBackground([renderFrame(150)]), f);
  const stick = obs.find(o => Math.abs(o.cx - 700) < 2 && Math.abs(o.cy - 520) < 2)!;
  assert.ok(Math.abs(principal(stick).angleDeg - angle) < 0.3, `${principal(stick).angleDeg} vs ${angle}`);
});

test('縁のサブピクセル位置: 被覆率の和だけ外側へ伸ばす', () => {
  assert.deepEqual(softEdges(Float64Array.from([0.3, 1, 1, 1, 0.6]), 10), [10.7, 14.6]);
});
