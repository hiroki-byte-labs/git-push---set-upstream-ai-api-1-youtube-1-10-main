// サムネイルの検査（T073, T165）。描画はscripts/render.swift / scripts/render-thumbnail.swift。
// 基準: YouTube公式のモバイル上限2MB（docs/RESEARCH-GROWTH.md 6章）、文字と背景のコントラスト比4.5以上（WCAG 2.x AA）。
// T165: 実画像・全テキスト・寸法・欠測・NaN/Infinity拒否・判定契約の追加。
import {existsSync, readFileSync, statSync} from 'node:fs';
import {join} from 'node:path';
import type {ThumbnailBrief} from './thumbnail-brief.ts';

export const THUMB_MAX_BYTES = 2 * 1024 * 1024;
export const MIN_CONTRAST = 4.5;
export const EXPECTED_WIDTH = 1280;
export const EXPECTED_HEIGHT = 720;

export type ThumbResult = {
  file: string;
  variant: string;
  bytes: number;
  contrast: number;
  headlineSize: number;
  ok: boolean;
  issues: string[];
};

export type CandidateAssessment = {
  variant: string;
  file: string;
  status: 'pass' | 'fail' | 'needs-review';
  bytes: number;
  width?: number;
  height?: number;
  contrast: number;
  headlineSize: number;
  fitted: boolean;
  issues: string[];
};

export type ThumbnailQualityAssessment = {
  ok: boolean;
  canProceed: boolean;
  allPassed: boolean;
  selectedVariant?: string;
  selectedOk: boolean;
  candidates: CandidateAssessment[];
  reasons: string[];
};

// PNGヘッダー（IHDR）から寸法を読み取る
export function readPngDimensions(buffer: Buffer): {width: number; height: number} | null {
  if (buffer.length < 24) return null;
  // PNGシグネチャ: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47 ||
    buffer[4] !== 0x0d || buffer[5] !== 0x0a || buffer[6] !== 0x1a || buffer[7] !== 0x0a
  ) {
    return null;
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return {width, height};
}

// 既存互換の検査関数（T073互換）
export function checkThumbnails(dir: string): ThumbResult[] {
  const path = join(dir, 'thumbnails-report.json');
  if (!existsSync(path)) throw Error('thumbnails-report.jsonがない');
  const report: any = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(report)) throw Error('thumbnails-report.jsonが配列ではありません');
  if (report.length === 0) throw Error('thumbnails-report.jsonのレコードが空です');

  return report.map((r, idx) => {
    const issues: string[] = [];
    const file = r?.file ?? `unknown-${idx}.png`;
    const variant = r?.variant ?? String(idx);
    const filePath = join(dir, file);

    let bytes = 0;
    if (!existsSync(filePath)) {
      issues.push('画像がない');
    } else {
      bytes = statSync(filePath).size;
      if (!bytes) issues.push('画像が空（0バイト）');
    }

    if (bytes > THUMB_MAX_BYTES) issues.push(`${THUMB_MAX_BYTES}バイト（モバイル上限）を超える`);

    // 欠測・NaN/Infinity検査
    if (r?.headlineSize === undefined || typeof r.headlineSize !== 'number' || !Number.isFinite(r.headlineSize) || r.headlineSize <= 0) {
      issues.push('見出しサイズの測定値が不正または欠落');
    }
    if (r?.fitted !== true) {
      issues.push('見出しが収まらない');
    }
    if (r?.contrast === undefined || typeof r.contrast !== 'number' || !Number.isFinite(r.contrast)) {
      issues.push('コントラスト比の測定値が不正または欠落');
    } else if (r.contrast < MIN_CONTRAST) {
      issues.push(`コントラスト比${r.contrast.toFixed(2)}が${MIN_CONTRAST}未満`);
    }

    const contrastNum = (typeof r?.contrast === 'number' && Number.isFinite(r.contrast))
      ? Number(r.contrast.toFixed(2))
      : 0;

    return {
      file,
      variant,
      bytes,
      contrast: contrastNum,
      headlineSize: typeof r?.headlineSize === 'number' ? r.headlineSize : 0,
      ok: !issues.length,
      issues,
    };
  });
}

// 厳格な品質検査契約（T165）
export function checkThumbnailQuality(
  dir: string,
  brief?: ThumbnailBrief,
  options: {selectedThumbnail?: string} = {}
): ThumbnailQualityAssessment {
  const selectedVariant = options.selectedThumbnail ? options.selectedThumbnail.replace(/^thumbnail-|\.png$/g, '') : 'a';
  const reasons: string[] = [];

  let results: ThumbResult[];
  try {
    results = checkThumbnails(dir);
  } catch (err: any) {
    return {
      ok: false,
      canProceed: false,
      allPassed: false,
      selectedVariant,
      selectedOk: false,
      candidates: [],
      reasons: [err.message],
    };
  }

  const candidateAssessments: CandidateAssessment[] = [];

  for (const r of results) {
    const issues = [...r.issues];
    const fullPath = join(dir, r.file);
    let dims: {width: number; height: number} | null = null;

    if (existsSync(fullPath)) {
      const buf = readFileSync(fullPath);
      dims = readPngDimensions(buf);
      if (!dims) {
        issues.push('破損したPNG画像または不正な画像形式');
      } else if (dims.width !== EXPECTED_WIDTH || dims.height !== EXPECTED_HEIGHT) {
        issues.push(`画像寸法(${dims.width}x${dims.height})が期待値(${EXPECTED_WIDTH}x${EXPECTED_HEIGHT})と不一致`);
      }
    }

    // briefとの照合
    if (brief) {
      const candBrief = brief.candidates.find(c => c.id === r.variant);
      if (!candBrief) {
        issues.push(`briefに候補id「${r.variant}」が存在しません`);
      } else if (candBrief.status === 'needs-review') {
        issues.push(`briefの候補「${r.variant}」がneeds-reviewです（未確認事項あり）`);
      }
    }

    let status: 'pass' | 'fail' | 'needs-review' = 'pass';
    if (issues.some(i => i.includes('needs-review'))) {
      status = 'needs-review';
    } else if (issues.length > 0) {
      status = 'fail';
    }

    if (status !== 'pass') {
      reasons.push(`${r.file}(${r.variant}): ${issues.join(' / ')}`);
    }

    candidateAssessments.push({
      variant: r.variant,
      file: r.file,
      status,
      bytes: r.bytes,
      width: dims?.width,
      height: dims?.height,
      contrast: r.contrast,
      headlineSize: r.headlineSize,
      fitted: !issues.some(i => i.includes('収まらない')),
      issues,
    });
  }

  // 採用候補の検査
  const selectedCand = candidateAssessments.find(c => c.variant === selectedVariant);
  const selectedOk = selectedCand?.status === 'pass';
  if (!selectedCand) {
    reasons.push(`採用サムネイル候補「${selectedVariant}」の評価が存在しません`);
  } else if (!selectedOk) {
    reasons.push(`採用サムネイル「${selectedCand.file}」が不合格です(${selectedCand.status})`);
  }

  const allPassed = candidateAssessments.length > 0 && candidateAssessments.every(c => c.status === 'pass');
  const ok = allPassed;
  // canProceed: 採用候補がpassであればパイプライン進行は許可（ただし全体がすべて合格でなければ完全合格ではない）
  const canProceed = Boolean(selectedOk);

  return {
    ok,
    canProceed,
    allPassed,
    selectedVariant,
    selectedOk: Boolean(selectedOk),
    candidates: candidateAssessments,
    reasons,
  };
}
