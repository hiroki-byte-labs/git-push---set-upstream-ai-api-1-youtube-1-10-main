// 動画から独立したサムネイル専用PNG描画経路（T163）
// briefと自作素材からscripts/render-thumbnail.swiftを実行し、1280x720 PNGおよび実測レポートを生成する。
import {existsSync, readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import type {ThumbnailBrief} from './thumbnail-brief.ts';
import {validateThumbnailBrief} from './thumbnail-brief.ts';
import {verifyTypographyFonts} from './thumbnail-typography.ts';

export type DrawnBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ThumbnailRenderReport = {
  typography?: {family: string; fontName: string; weight: number; outline: boolean; glow: boolean; gradient: boolean};
  file: string;
  variant: string;
  headline: string;
  headlineSize: number;
  fitted: boolean;
  contrast: number;
  bytes: number;
  assetHashes: Record<string, string>;
  drawnBox: DrawnBox;
  ok: boolean;
  issues: string[];
};

export type RenderThumbnailOptions = {
  brief: ThumbnailBrief;
  assetsDir?: string;
  outputDir: string;
};

// サムネイル専用PNG描画を実行する
export function renderThumbnails(options: RenderThumbnailOptions): ThumbnailRenderReport[] {
  const {brief, outputDir} = options;
  const assetsDir = options.assetsDir ?? 'assets/thumbnail-originals';

  // 入力briefの検証
  validateThumbnailBrief(brief);
  if (brief.candidates.some(c => c.typography)) verifyTypographyFonts();

  mkdirSync(outputDir, {recursive: true});

  // 一時brief.jsonの配置
  const briefPath = join(outputDir, 'thumbnail-brief.json');
  writeFileSync(briefPath, JSON.stringify(brief, null, 2), 'utf8');

  const scriptPath = 'scripts/render-thumbnail.swift';
  if (!existsSync(scriptPath)) {
    throw Error(`描画スクリプトが見つかりません: ${scriptPath}`);
  }

  // Swiftスクリプトの実行
  try {
    execFileSync('swift', [scriptPath, briefPath, assetsDir, outputDir], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err: any) {
    const stderr = err.stderr ? err.stderr.toString() : '';
    throw Error(`サムネイル描画プロセスが失敗しました: ${err.message}\n${stderr}`);
  }

  // 出力レポートの読み込みと検査
  const reportPath = join(outputDir, 'thumbnails-report.json');
  if (!existsSync(reportPath)) {
    throw Error('描画レポート (thumbnails-report.json) が生成されませんでした');
  }

  const reports: ThumbnailRenderReport[] = JSON.parse(readFileSync(reportPath, 'utf8'));

  // 生成された各PNGファイルの存在と最低限の検査
  for (const r of reports) {
    const pngPath = join(outputDir, r.file);
    if (!existsSync(pngPath)) {
      r.ok = false;
      r.issues.push(`生成PNGファイル(${r.file})が存在しません`);
    }
  }

  return reports;
}
