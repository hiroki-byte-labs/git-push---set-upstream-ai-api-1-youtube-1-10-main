// 見やすさの検査（T091）。render-report.json（文字ごとの大きさ・背景とのコントラスト比）から判定する。
// 基準:
// - コントラスト比4.5以上（WCAG 2.x AA、通常文字）。
// - 最小文字サイズは720p換算で16pt以上。研究の根拠はない暫定値（docs/RESEARCH-GROWTH.md G32/G33の
//   高年齢層・TV視聴を踏まえた目安）。人の確認（T007/T091の確認手順）で見直す。
import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

export const MIN_CONTRAST_TEXT = 4.5;
export const MIN_FONT_720 = 16;
export type Readability = {ok: boolean; scale: number; minFont720: number; minContrast: number; issues: string[]};

type Rec = {file: string; role: string; text: string; size: number; pixelSize: number; contrast: number};

export function checkReadability(dir: string, scale: number): Readability {
  const path = join(dir, 'render-report.json');
  if (!existsSync(path)) throw Error('render-report.jsonがない');
  const recs: Rec[] = JSON.parse(readFileSync(path, 'utf8'));
  const issues: string[] = [];
  const small = recs.filter(r => r.pixelSize / scale < MIN_FONT_720);
  const low = recs.filter(r => r.contrast < MIN_CONTRAST_TEXT);
  const uniq = (xs: Rec[], f: (r: Rec) => string) => [...new Set(xs.map(f))].slice(0, 5);
  if (small.length) issues.push(`${MIN_FONT_720}pt未満（720p換算）の文字 ${small.length}件: ${uniq(small, r => `${r.role}「${r.text.slice(0, 12)}」${(r.pixelSize / scale).toFixed(0)}pt`).join(', ')}`);
  if (low.length) issues.push(`コントラスト比${MIN_CONTRAST_TEXT}未満 ${low.length}件: ${uniq(low, r => `${r.role} ${r.contrast.toFixed(2)}`).join(', ')}`);
  return {
    ok: !issues.length, scale,
    minFont720: recs.length ? Math.min(...recs.map(r => r.pixelSize / scale)) : 0,
    minContrast: recs.length ? Number(Math.min(...recs.map(r => r.contrast)).toFixed(2)) : 0,
    issues,
  };
}
