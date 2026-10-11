// 検証用の参考動画（10秒、1280x720、30fps）を数式から作る。外部の素材・音声は使わない。
// 正解値（ground-truth.json）は採点（tools/score.ts）だけが読み、解析器（tools/analyze.ts）は読まない。
// Remotion（Chromium）とは独立した自作の描画器で作ることで、解析と再現の両方を検証できるようにする。
// 使い方: node tools/make-reference.ts --out <出力先>
import {spawn} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import type {EasingName} from '../shared/analysis.ts';
import {EASINGS} from '../shared/easing.ts';
import {ffmpegPath} from './lib/ffmpeg.ts';

type Prop = 'cx' | 'cy' | 'w' | 'h' | 'angle' | 'opacity';
type Anim = {prop: Prop[]; from: number[]; to: number[]; t0: number; t1: number; easing: EasingName};
export type GTElement = {
  id: string; scene: number; label: string; shape: 'rect' | 'ellipse'; color: string;
  base: Record<Prop, number>; anims: Anim[];
  expect: {type: string; startObservable: boolean; note?: string}[];
};
export type GroundTruth = {width: number; height: number; fps: number; frames: number; scenes: {start: number; end: number; background: string}[]; elements: GTElement[]};

const W = 1280, H = 720, FPS = 30, FRAMES = 300;
const base = (o: Partial<Record<Prop, number>>): Record<Prop, number> => ({cx: 0, cy: 0, w: 0, h: 0, angle: 0, opacity: 1, ...o});

export const GROUND_TRUTH: GroundTruth = {
  width: W, height: H, fps: FPS, frames: FRAMES,
  scenes: [{start: 0, end: 149, background: '#14213d'}, {start: 150, end: 299, background: '#f1faee'}],
  elements: [
    {id: 'card', scene: 0, label: '左の画面外から滑り込む矩形', shape: 'rect', color: '#fca311', base: base({cx: 300, cy: 280, w: 280, h: 160}),
      anims: [{prop: ['cx'], from: [-140], to: [300], t0: 15, t1: 51, easing: 'easeOutCubic'}],
      expect: [{type: 'translate', startObservable: false, note: '開始時は完全に画面外。開始位置と開始時刻は観測できない'}]},
    {id: 'dot', scene: 0, label: '中心から拡大する円（行き過ぎあり）', shape: 'ellipse', color: '#2ec4b6', base: base({cx: 900, cy: 290, w: 180, h: 180}),
      anims: [{prop: ['w', 'h'], from: [0, 0], to: [180, 180], t0: 36, t1: 66, easing: 'easeOutBack'}],
      expect: [{type: 'scale', startObservable: false, note: '大きさ0から始まるため開始の瞬間は見えない'}]},
    {id: 'bar', scene: 0, label: '左端を固定して右へ伸びる帯', shape: 'rect', color: '#e5e5e5', base: base({cx: 640, cy: 532, w: 800, h: 24}),
      anims: [{prop: ['cx', 'w'], from: [240, 0], to: [640, 800], t0: 78, t1: 114, easing: 'linear'}],
      expect: [{type: 'grow', startObservable: false, note: '幅0から始まる'}]},
    {id: 'square', scene: 1, label: '左下から右上へ移動する正方形', shape: 'rect', color: '#e63946', base: base({cx: 260, cy: 560, w: 120, h: 120}),
      anims: [{prop: ['cx', 'cy'], from: [260, 560], to: [1000, 200], t0: 168, t1: 210, easing: 'easeInOutCubic'}],
      expect: [{type: 'translate', startObservable: true}]},
    {id: 'banner', scene: 1, label: 'フェードインする帯', shape: 'rect', color: '#457b9d', base: base({cx: 280, cy: 110, w: 400, h: 100, opacity: 0}),
      anims: [{prop: ['opacity'], from: [0], to: [1], t0: 216, t1: 246, easing: 'easeInOutSine'}],
      expect: [{type: 'fade-in', startObservable: false, note: '不透明度0では見えない'}]},
    {id: 'stick', scene: 1, label: '中心で90度回転する細長い矩形', shape: 'rect', color: '#1d3557', base: base({cx: 700, cy: 520, w: 260, h: 50}),
      anims: [{prop: ['angle'], from: [0], to: [90], t0: 252, t1: 282, easing: 'easeInOutQuad'}],
      expect: [{type: 'rotate', startObservable: true}]},
  ],
};

function valueAt(el: GTElement, prop: Prop, f: number): number {
  let v = el.base[prop];
  for (const a of el.anims) {
    const i = a.prop.indexOf(prop);
    if (i < 0) continue;
    if (f < a.t0) { v = a.from[i]; break; }
    const p = Math.min(1, (f - a.t0) / (a.t1 - a.t0));
    v = a.from[i] + (a.to[i] - a.from[i]) * EASINGS[a.easing](p);
  }
  return v;
}

const rgb = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

/** 1フレームを描く。被覆率は画素内8x8の標本で求め（軸平行の矩形は厳密な面積）、sRGBのまま重ねる（ブラウザーと同じ）。 */
export function renderFrame(f: number, gt = GROUND_TRUTH): Uint8Array {
  const sc = gt.scenes.findIndex(s => f >= s.start && f <= s.end);
  const out = new Float32Array(gt.width * gt.height * 3), bg = rgb(gt.scenes[sc].background);
  for (let i = 0; i < out.length; i += 3) { out[i] = bg[0]; out[i + 1] = bg[1]; out[i + 2] = bg[2]; }
  for (const el of gt.elements.filter(e => e.scene === sc)) {
    const g = Object.fromEntries((['cx', 'cy', 'w', 'h', 'angle', 'opacity'] as Prop[]).map(p => [p, valueAt(el, p, f)])) as Record<Prop, number>;
    if (g.w <= 0 || g.h <= 0 || g.opacity <= 0) continue;
    const col = rgb(el.color), th = (g.angle * Math.PI) / 180, cos = Math.cos(th), sin = Math.sin(th);
    const r = Math.hypot(g.w, g.h) / 2 + 1;
    const x0 = Math.max(0, Math.floor(g.cx - r)), x1 = Math.min(gt.width - 1, Math.ceil(g.cx + r)), y0 = Math.max(0, Math.floor(g.cy - r)), y1 = Math.min(gt.height - 1, Math.ceil(g.cy + r));
    const inside = (x: number, y: number) => {
      const dx = x - g.cx, dy = y - g.cy, u = dx * cos + dy * sin, v = -dx * sin + dy * cos;
      return el.shape === 'rect' ? Math.abs(u) <= g.w / 2 && Math.abs(v) <= g.h / 2 : (u / (g.w / 2)) ** 2 + (v / (g.h / 2)) ** 2 <= 1;
    };
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      let cov: number;
      if (el.shape === 'rect' && g.angle === 0) {
        const ox = Math.max(0, Math.min(x + 1, g.cx + g.w / 2) - Math.max(x, g.cx - g.w / 2)), oy = Math.max(0, Math.min(y + 1, g.cy + g.h / 2) - Math.max(y, g.cy - g.h / 2));
        cov = ox * oy;
      } else {
        // 画素中心が縁から十分離れていれば標本化を省く（画素の半対角は約0.71px）。
        const dx = x + 0.5 - g.cx, dy = y + 0.5 - g.cy, u = dx * cos + dy * sin, v = -dx * sin + dy * cos;
        let sure: number | null = null;
        if (el.shape === 'rect') {
          if (Math.abs(u) > g.w / 2 + 0.75 || Math.abs(v) > g.h / 2 + 0.75) sure = 0;
          else if (Math.abs(u) < g.w / 2 - 0.75 && Math.abs(v) < g.h / 2 - 0.75) sure = 1;
        } else {
          const m = 1 / Math.min(g.w / 2, g.h / 2), q = Math.hypot(u / (g.w / 2), v / (g.h / 2));
          if (q > 1 + m) sure = 0; else if (q < 1 - m) sure = 1;
        }
        if (sure !== null) cov = sure;
        else { let n = 0; for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) if (inside(x + (i + 0.5) / 8, y + (j + 0.5) / 8)) n++; cov = n / 64; }
      }
      if (!cov) continue;
      const a = cov * g.opacity, k = (y * gt.width + x) * 3;
      for (let c = 0; c < 3; c++) out[k + c] = out[k + c] * (1 - a) + col[c] * a;
    }
  }
  const px = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) px[i] = Math.round(out[i]);
  return px;
}

export async function makeReference(outDir: string) {
  mkdirSync(outDir, {recursive: true});
  const video = join(outDir, 'reference.mp4');
  const ff = spawn(ffmpegPath(), ['-hide_banner', '-nostdin', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', video], {stdio: ['pipe', 'ignore', 'pipe']});
  let err = '';
  ff.stderr.on('data', d => { err = (err + d).slice(-3000); });
  for (let f = 0; f < FRAMES; f++) {
    if (!ff.stdin.write(renderFrame(f))) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  const code: number = await new Promise(r => ff.on('close', r));
  if (code !== 0) throw Error(`エンコード失敗: ${err}`);
  writeFileSync(join(outDir, 'ground-truth.json'), JSON.stringify(GROUND_TRUTH, null, 2) + '\n');
  return {video, groundTruth: join(outDir, 'ground-truth.json')};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf('--out');
  const r = await makeReference(resolve(i > 0 ? process.argv[i + 1] : 'out/reference'));
  console.log(`参考動画: ${r.video}\n正解値: ${r.groundTruth}`);
}
