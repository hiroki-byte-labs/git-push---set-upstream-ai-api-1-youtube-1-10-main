// サムネイルの検査（T073）。描画はscripts/render.swift、結果は<job>/thumbnails-report.json。
// 基準: YouTube公式のモバイル上限2MB（docs/RESEARCH-GROWTH.md 6章）、文字と背景のコントラスト比4.5以上（WCAG 2.x AA）。
import {existsSync, readFileSync, statSync} from 'node:fs';
import {join} from 'node:path';

export const THUMB_MAX_BYTES = 2 * 1024 * 1024;
export const MIN_CONTRAST = 4.5;
export type ThumbResult = {file: string; variant: string; bytes: number; contrast: number; headlineSize: number; ok: boolean; issues: string[]};

export function checkThumbnails(dir: string): ThumbResult[] {
  const path = join(dir, 'thumbnails-report.json');
  if (!existsSync(path)) throw Error('thumbnails-report.jsonがない');
  const report: {file: string; variant: string; headlineSize: number; fitted: boolean; contrast: number}[] = JSON.parse(readFileSync(path, 'utf8'));
  return report.map(r => {
    const issues: string[] = [];
    const bytes = existsSync(join(dir, r.file)) ? statSync(join(dir, r.file)).size : 0;
    if (!bytes) issues.push('画像がない');
    if (bytes > THUMB_MAX_BYTES) issues.push(`${THUMB_MAX_BYTES}バイト（モバイル上限）を超える`);
    if (!r.fitted) issues.push('見出しが収まらない');
    if (r.contrast < MIN_CONTRAST) issues.push(`コントラスト比${r.contrast.toFixed(2)}が${MIN_CONTRAST}未満`);
    return {file: r.file, variant: r.variant, bytes, contrast: Number(r.contrast.toFixed(2)), headlineSize: r.headlineSize, ok: !issues.length, issues};
  });
}
