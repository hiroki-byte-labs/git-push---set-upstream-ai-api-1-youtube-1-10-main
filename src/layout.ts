// 文字配置の検査（T106）。render-report.json の各文字について、入れ物の枠（box）・描いた外接矩形（drawn）・区画（zone）から、
// 枠からのはみ出し、上下中央からのずれ、区画外への配置、区画の違う文字どうしの重なり（字幕と図解、強調とフッター等）を調べる。
// 座標は1280×720の論理座標（左下原点）。区画の定数は scripts/render.swift の ZONE_* と一致させる。
import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

export type Rect = [number, number, number, number];
export const ZONES: Record<string, Rect> = {
  header: [60, 618, 1160, 44],
  title: [60, 520, 1160, 92],
  emphasis: [60, 466, 1160, 40],
  diagram: [60, 235, 1160, 220],
  subtitle: [45, 92, 1190, 128],
  footer: [60, 22, 1160, 36],
};
// 許容差（論理座標のpt）。描画の端数と文字の外接矩形の丸めを許す。
export const TOLERANCE = 1;

type Rec = {file: string; role: string; text: string; zone?: string; box?: number[]; drawn?: number[]; align?: string};
export type LayoutResult = {ok: boolean; checked: number; issues: string[]};

const inside = (a: number[], b: number[], tol = TOLERANCE) => a[0] >= b[0] - tol && a[1] >= b[1] - tol && a[0] + a[2] <= b[0] + b[2] + tol && a[1] + a[3] <= b[1] + b[3] + tol;
const overlap = (a: number[], b: number[]) => a[0] < b[0] + b[2] - TOLERANCE && b[0] < a[0] + a[2] - TOLERANCE && a[1] < b[1] + b[3] - TOLERANCE && b[1] < a[1] + a[3] - TOLERANCE;

export function checkLayoutRecords(recs: Rec[]): LayoutResult {
  const issues: string[] = [];
  const add = (msg: string) => { if (!issues.includes(msg)) issues.push(msg); };
  const frames = recs.filter(r => r.box && r.drawn && r.zone && !/^thumbnail-/.test(r.file));
  for (const r of frames) {
    const label = `${r.file} ${r.role}「${r.text.slice(0, 12)}」`;
    if (!inside(r.drawn!, r.box!)) add(`${label}: 文字が入れ物の枠からはみ出す`);
    if (r.align === 'center') {
      const dy = r.drawn![1] + r.drawn![3] / 2 - (r.box![1] + r.box![3] / 2);
      if (Math.abs(dy) > TOLERANCE) add(`${label}: 枠の上下中央から${dy.toFixed(1)}ptずれる`);
    }
    const zone = ZONES[r.zone!];
    if (!zone) add(`${label}: 不明な区画 ${r.zone}`);
    else if (!inside(r.drawn!, zone)) add(`${label}: 区画「${r.zone}」の外に描かれている`);
  }
  const byFile = new Map<string, Rec[]>();
  for (const r of frames) byFile.set(r.file, [...(byFile.get(r.file) ?? []), r]);
  for (const [file, list] of byFile) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a.zone !== b.zone && overlap(a.drawn!, b.drawn!)) add(`${file}: ${a.zone}の「${a.text.slice(0, 10)}」と${b.zone}の「${b.text.slice(0, 10)}」が重なる`);
    }
  }
  return {ok: issues.length === 0, checked: frames.length, issues: issues.slice(0, 20)};
}

export function checkLayout(dir: string): LayoutResult {
  const path = join(dir, 'render-report.json');
  if (!existsSync(path)) throw Error('render-report.jsonがない');
  return checkLayoutRecords(JSON.parse(readFileSync(path, 'utf8')));
}
