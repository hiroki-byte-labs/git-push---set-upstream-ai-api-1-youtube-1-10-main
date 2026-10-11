// 合成した参考動画の正解値（ground-truth.json）と解析JSONを照合する。解析器の精度と「観測できない項目を断定しない」ことを確かめる。
// 使い方: node tools/score.ts <ground-truth.json> <analysis.json> [--out <score.json>]
import {readFileSync, writeFileSync} from 'node:fs';
import type {Analysis, ElementAnalysis} from '../shared/analysis.ts';
import {round} from './lib/fit.ts';
import type {GroundTruth, GTElement} from './make-reference.ts';

export type Check = {element: string; item: string; expected: string; actual: string; pass: boolean; note?: string};
export type Score = {checks: Check[]; passed: number; failed: number; pass: boolean};

const rgb = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const SHAPE: Record<string, string[]> = {rect: ['rectangle'], ellipse: ['circle', 'ellipse']};

function finalValues(g: GTElement) {
  const v = {...g.base};
  for (const a of g.anims) a.prop.forEach((p, i) => { v[p] = a.to[i]; });
  return v;
}

export function scoreAnalysis(gt: GroundTruth, a: Analysis): Score {
  const checks: Check[] = [];
  const add = (element: string, item: string, expected: unknown, actual: unknown, pass: boolean, note?: string) => checks.push({element, item, expected: String(expected), actual: String(actual), pass, ...(note ? {note} : {})});
  add('全体', 'シーン数', gt.scenes.length, a.scenes.length, gt.scenes.length === a.scenes.length);
  gt.scenes.slice(1).forEach((s, i) => add('全体', `シーン${i + 1}の切替フレーム`, s.start, a.scenes[i + 1]?.startFrame ?? '-', a.scenes[i + 1]?.startFrame === s.start));
  gt.scenes.forEach((s, i) => { const c = a.scenes[i]?.background.color; add('全体', `シーン${i}の背景色`, s.background, c ?? '-', !!c && Math.hypot(...rgb(c).map((v, k) => v - rgb(s.background)[k])) <= 8, 'RGB距離8以内'); });

  const used = new Set<string>();
  for (const g of gt.elements) {
    const fin = finalValues(g);
    const cand = a.elements.filter(e => e.scene === g.scene && !used.has(e.id)).map(e => ({e, d: Math.hypot(...rgb(e.color.value ?? '#000000').map((v, k) => v - rgb(g.color)[k])) + Math.hypot(e.layout.final.cx - fin.cx, e.layout.final.cy - fin.cy)})).sort((x, y) => x.d - y.d)[0];
    if (!cand) { add(g.id, '検出', 'あり', 'なし', false); continue; }
    const e: ElementAnalysis = cand.e;
    used.add(e.id);
    const L = e.layout.final;
    add(g.id, '対応する図形', g.label, e.id, true);
    add(g.id, '形', SHAPE[g.shape].join('/'), e.shape.value ?? 'unknown', SHAPE[g.shape].includes(e.shape.value ?? '') && (g.shape !== 'ellipse' || g.base.w !== g.base.h || e.shape.value === 'circle'));
    add(g.id, '色', g.color, e.color.value, Math.hypot(...rgb(e.color.value ?? '#000000').map((v, k) => v - rgb(g.color)[k])) <= 8, 'RGB距離8以内（H.264の色差間引きによる誤差を許容）');
    const pos = Math.hypot(L.cx - fin.cx, L.cy - fin.cy), size = Math.max(Math.abs(L.width - fin.w), Math.abs(L.height - fin.h));
    add(g.id, '最終位置（中心）', `(${fin.cx}, ${fin.cy})`, `(${L.cx}, ${L.cy})`, pos <= 1, `誤差${round(pos, 2)}px（許容1px）`);
    add(g.id, '最終の大きさ', `${fin.w}x${fin.h}`, `${L.width}x${L.height}`, size <= 1, `誤差${round(size, 2)}px（許容1px）`);
    if (fin.angle) add(g.id, '最終の角度', fin.angle, L.angleDeg, Math.abs(L.angleDeg - fin.angle) <= 1, '許容1度');
    g.anims.forEach((an, i) => {
      const ex = g.expect[i], x = e.animations.find(y => y.type === ex.type) ?? e.animations[i];
      if (!x) { add(g.id, `動き${i}`, ex.type, 'なし', false); return; }
      add(g.id, '動きの種類', ex.type, x.type, x.type === ex.type);
      add(g.id, '終了フレーム', an.t1, `${x.end.frame}（${x.end.status}）`, x.end.status === 'estimated' && Math.abs((x.end.frame ?? -99) - an.t1) <= 0.5, '許容0.5フレーム');
      if (ex.startObservable) {
        add(g.id, '開始フレーム', an.t0, `${x.start.frame}（${x.start.status}）`, x.start.status === 'estimated' && Math.abs((x.start.frame ?? -99) - an.t0) <= 0.5, '許容0.5フレーム');
      } else {
        // 観測できない開始は「上限」として報告され、真の開始がその上限以下であること（断定しないこと）を確認する。
        add(g.id, '開始フレーム（観測不能）', `≤ 上限で報告（真値${an.t0}）`, `${x.start.frame}（${x.start.status}）`, x.start.status === 'upper_bound' && an.t0 <= (x.start.frame ?? -Infinity), ex.note);
        add(g.id, '開始値（観測不能）', 'unknown', x.from.status, x.from.status === 'unknown', ex.note);
        if (x.start.modelFrame !== undefined) add(g.id, '開始フレームのモデル値（参考）', an.t0, `${x.start.modelFrame}±${x.start.uncertaintyFrames ?? '?'}`, true, `誤差${round(x.start.modelFrame - an.t0, 2)}フレーム。断定値ではないため合否に含めない`);
      }
      const inList = x.easing.candidates.slice(0, 3).some(c => c.name === an.easing);
      add(g.id, 'イージング', an.easing, `${x.easing.best ?? '-'}（${x.easing.status}）`, x.easing.status === 'estimated' ? x.easing.best === an.easing : x.easing.status === 'ambiguous' ? inList : false, x.easing.status === 'ambiguous' ? '曖昧と報告。候補上位3件に正解があれば合格' : undefined);
    });
  }
  for (const e of a.elements) if (!used.has(e.id)) add(e.id, '余分な検出', 'なし', e.id, false);
  const failed = checks.filter(c => !c.pass).length;
  return {checks, passed: checks.length - failed, failed, pass: failed === 0};
}

export function scoreMarkdown(s: Score): string {
  return [`# 正解値との照合: ${s.pass ? '合格' : '不合格'}（${s.passed}/${s.checks.length}）`, '', '| 図形 | 項目 | 正解 | 解析 | 判定 | 注 |', '|---|---|---|---|---|---|',
    ...s.checks.map(c => `| ${c.element} | ${c.item} | ${c.expected} | ${c.actual} | ${c.pass ? '○' : '×'} | ${c.note ?? ''} |`)].join('\n') + '\n';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [g, an] = process.argv.slice(2);
  if (!g || !an) throw Error('使い方: node tools/score.ts <ground-truth.json> <analysis.json> [--out <score.json>]');
  const s = scoreAnalysis(JSON.parse(readFileSync(g, 'utf8')), JSON.parse(readFileSync(an, 'utf8')));
  const i = process.argv.indexOf('--out');
  if (i > 0) writeFileSync(process.argv[i + 1], JSON.stringify(s, null, 2) + '\n');
  console.log(scoreMarkdown(s));
}
