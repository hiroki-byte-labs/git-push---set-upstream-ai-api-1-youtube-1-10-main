// サムネイルの検査（T073, T165, T173）。描画はscripts/render.swift / scripts/render-thumbnail.swift。
// 基準: YouTube公式のモバイル上限2MB（docs/RESEARCH-GROWTH.md 6章）、文字と背景のコントラスト比4.5以上（WCAG 2.x AA）。
// T165: 実画像・全テキスト・寸法・欠測・NaN/Infinity拒否・判定契約の追加。
// T173: モバイル・超縮小表示（160x90等）における見出し文字のコントラスト・エッジ維持率自動測定と品質ゲート拡充。
import {existsSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {inflateSync} from 'node:zlib';
import type {ThumbnailBrief} from './thumbnail-brief.ts';

export const THUMB_MAX_BYTES = 2 * 1024 * 1024;
export const MIN_CONTRAST = 4.5;
export const EXPECTED_WIDTH = 1280;
export const EXPECTED_HEIGHT = 720;

// T173: 縮小表示における視認性基準値
export const MIN_SCALED_CONTRAST = 3.0; // 縮小表示での最低許容コントラスト比（WCAG Large Text / モバイル下限）
export const MIN_SCALED_EDGE = 0.25; // 縮小文字領域の最低エッジ明瞭度（潰れ・線消失防止）
export const MIN_CONTRAST_RETENTION = 0.20; // 原寸コントラスト維持率下限

export type ScaledLegibility = {
  width: number;
  height: number;
  contrast: number; // 縮小文字領域の実測コントラスト比
  retention: number; // 原寸コントラスト比に対する維持率
  avgEdge: number; // 平均エッジ強度
  topEdge: number; // 上位10%エッジ強度
  legible: boolean; // 視認性合否判定
  issues: string[];
};

export type ThumbResult = {
  file: string;
  variant: string;
  bytes: number;
  contrast: number;
  headlineSize: number;
  ok: boolean;
  issues: string[];
  scaledLegibility?: ScaledLegibility;
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
  scaledLegibility?: ScaledLegibility;
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

// Paeth予測子（PNGフィルター4用）
function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

// 純粋Node.jsでの軽量PNG RGBAデコード
export function decodePngRgba(buf: Buffer): {width: number; height: number; data: Buffer} | null {
  if (buf.length < 24) return null;
  if (
    buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47 ||
    buf[4] !== 0x0d || buf[5] !== 0x0a || buf[6] !== 0x1a || buf[7] !== 0x0a
  ) {
    return null;
  }

  let pos = 8;
  const idatChunks: Buffer[] = [];
  let width = 0;
  let height = 0;
  let colorType = 0;

  while (pos < buf.length) {
    if (pos + 8 > buf.length) break;
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    if (pos + 8 + len > buf.length) break;
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }

  if (!width || !height || idatChunks.length === 0) return null;

  let decompressed: Buffer;
  try {
    decompressed = inflateSync(Buffer.concat(idatChunks));
  } catch {
    return null;
  }

  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 4;
  const stride = width * bpp;
  const raw = Buffer.alloc(width * height * 4);

  let offset = 0;
  const prevLine = Buffer.alloc(stride);
  const currLine = Buffer.alloc(stride);

  for (let y = 0; y < height; y++) {
    if (offset >= decompressed.length) return null;
    const filter = decompressed[offset++];
    for (let x = 0; x < stride; x++) {
      if (offset >= decompressed.length) return null;
      const byte = decompressed[offset++];
      const a = x >= bpp ? currLine[x - bpp] : 0;
      const b = prevLine[x];
      const c = x >= bpp ? prevLine[x - bpp] : 0;
      let val = 0;
      if (filter === 0) val = byte;
      else if (filter === 1) val = (byte + a) & 0xff;
      else if (filter === 2) val = (byte + b) & 0xff;
      else if (filter === 3) val = (byte + Math.floor((a + b) / 2)) & 0xff;
      else if (filter === 4) val = (byte + paethPredictor(a, b, c)) & 0xff;
      else val = byte;
      currLine[x] = val;
    }

    for (let x = 0; x < width; x++) {
      const dst = (y * width + x) * 4;
      if (colorType === 6) {
        raw[dst] = currLine[x * 4];
        raw[dst + 1] = currLine[x * 4 + 1];
        raw[dst + 2] = currLine[x * 4 + 2];
        raw[dst + 3] = currLine[x * 4 + 3];
      } else if (colorType === 2) {
        raw[dst] = currLine[x * 3];
        raw[dst + 1] = currLine[x * 3 + 1];
        raw[dst + 2] = currLine[x * 3 + 2];
        raw[dst + 3] = 255;
      } else {
        const g = currLine[x];
        raw[dst] = g;
        raw[dst + 1] = g;
        raw[dst + 2] = g;
        raw[dst + 3] = 255;
      }
    }
    currLine.copy(prevLine);
  }

  return {width, height, data: raw};
}

// 相対輝度計算 (sRGB)
function relativeLuminance(r: number, g: number, b: number): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

// 縮小表示における文字領域コントラスト維持率およびエッジ明瞭度測定（T173）
export function measureScaledLegibility(
  buf: Buffer,
  drawnBox?: {x: number; y: number; width: number; height: number},
  originalContrast = MIN_CONTRAST
): ScaledLegibility {
  const issues: string[] = [];
  const img = decodePngRgba(buf);
  if (!img) {
    issues.push('縮小PNG画像のデコードに失敗しました');
    return {
      width: 0,
      height: 0,
      contrast: 0,
      retention: 0,
      avgEdge: 0,
      topEdge: 0,
      legible: false,
      issues,
    };
  }

  const {width, height} = img;
  const scale = width / EXPECTED_WIDTH;

  // AppKit座標系（左下原点）を画像座標系（左上原点）へ射影
  let bx = 0;
  let by = 0;
  let bw = width;
  let bh = height;

  if (drawnBox && drawnBox.width > 0 && drawnBox.height > 0) {
    bx = Math.max(0, Math.floor(drawnBox.x * scale));
    by = Math.max(0, Math.floor((EXPECTED_HEIGHT - (drawnBox.y + drawnBox.height)) * scale));
    bw = Math.min(width - bx, Math.ceil(drawnBox.width * scale));
    bh = Math.min(height - by, Math.ceil(drawnBox.height * scale));
  } else {
    // 見出し配置想定領域（上部中央〜左側）
    bx = Math.floor(width * 0.06);
    by = Math.floor(height * 0.15);
    bw = Math.floor(width * 0.70);
    bh = Math.floor(height * 0.50);
  }

  // 領域内の輝度とエッジグラディエントをサンプリング
  const lums: number[] = [];
  const edges: number[] = [];

  for (let y = by; y < by + bh; y++) {
    for (let x = bx; x < bx + bw; x++) {
      const idx = (y * width + x) * 4;
      const l = relativeLuminance(img.data[idx], img.data[idx + 1], img.data[idx + 2]);
      lums.push(l);

      // Sobel 勾配フィルタ
      if (x > 0 && x < width - 1 && y > 0 && y < height - 1) {
        const getL = (dx: number, dy: number) => {
          const i = ((y + dy) * width + (x + dx)) * 4;
          return relativeLuminance(img.data[i], img.data[i + 1], img.data[i + 2]);
        };
        const gx = -getL(-1, -1) - 2 * getL(-1, 0) - getL(-1, 1) + getL(1, -1) + 2 * getL(1, 0) + getL(1, 1);
        const gy = -getL(-1, -1) - 2 * getL(0, -1) - getL(1, -1) + getL(-1, 1) + 2 * getL(0, 1) + getL(1, 1);
        edges.push(Math.sqrt(gx * gx + gy * gy));
      }
    }
  }

  if (lums.length === 0) {
    issues.push('縮小画像の測定サンプリング領域が空です');
    return {
      width,
      height,
      contrast: 0,
      retention: 0,
      avgEdge: 0,
      topEdge: 0,
      legible: false,
      issues,
    };
  }

  lums.sort((a, b) => a - b);
  // 最も暗い5%と最も明るい5%の点からコントラストを算出
  const darkLum = lums[Math.floor(lums.length * 0.05)] ?? 0;
  const brightLum = lums[Math.floor(lums.length * 0.95)] ?? 1;
  const contrast = Number(((Math.max(darkLum, brightLum) + 0.05) / (Math.min(darkLum, brightLum) + 0.05)).toFixed(2));

  edges.sort((a, b) => b - a);
  const avgEdge = edges.length > 0 ? Number((edges.reduce((acc, v) => acc + v, 0) / edges.length).toFixed(3)) : 0;
  const topEdge = edges.length > 0 ? Number((edges[Math.floor(edges.length * 0.10)] ?? 0).toFixed(3)) : 0;

  const retention = originalContrast > 0 ? Number((contrast / originalContrast).toFixed(2)) : 1.0;

  // 視認性合否判定
  if (contrast < MIN_SCALED_CONTRAST) {
    issues.push(`縮小表示(${width}x${height})のコントラスト比${contrast.toFixed(2)}が${MIN_SCALED_CONTRAST}未満（埋没・判読不能）`);
  }
  if (topEdge < MIN_SCALED_EDGE) {
    issues.push(`縮小表示(${width}x${height})の文字線エッジ強度${topEdge.toFixed(2)}が不足（文字潰れ・線消失）`);
  }
  if (retention < MIN_CONTRAST_RETENTION) {
    issues.push(`縮小表示(${width}x${height})のコントラスト維持率${(retention * 100).toFixed(0)}%が${MIN_CONTRAST_RETENTION * 100}%未満`);
  }

  return {
    width,
    height,
    contrast,
    retention,
    avgEdge,
    topEdge,
    legible: issues.length === 0,
    issues,
  };
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

    // T173: 縮小画像の視認性測定（160x90優先、なければ320x180）
    let scaledLegibility: ScaledLegibility | undefined = undefined;
    const small160 = join(dir, file.replace(/\.png$/, '-160.png'));
    const small320 = join(dir, file.replace(/\.png$/, '-320.png'));
    const candidateSmall = existsSync(small160) ? small160 : (existsSync(small320) ? small320 : null);

    if (candidateSmall) {
      try {
        const sBuf = readFileSync(candidateSmall);
        scaledLegibility = measureScaledLegibility(sBuf, r.drawnBox, contrastNum);
        if (!scaledLegibility.legible) {
          issues.push(...scaledLegibility.issues);
        }
      } catch (err: any) {
        issues.push(`縮小表示の視認性測定エラー: ${err.message}`);
      }
    }

    return {
      file,
      variant,
      bytes,
      contrast: contrastNum,
      headlineSize: typeof r?.headlineSize === 'number' ? r.headlineSize : 0,
      ok: !issues.length,
      issues,
      scaledLegibility,
    };
  });
}

// 厳格な品質検査契約（T165, T173）
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

  // T173: 実測レポート（thumbnails-report.json）への縮小視認性メトリクスの追記
  try {
    const reportPath = join(dir, 'thumbnails-report.json');
    if (existsSync(reportPath)) {
      const rawReport: any[] = JSON.parse(readFileSync(reportPath, 'utf8'));
      let modified = false;
      for (const item of rawReport) {
        const matchingResult = results.find(r => r.variant === item.variant || r.file === item.file);
        if (matchingResult?.scaledLegibility && !item.scaledLegibility) {
          item.scaledLegibility = matchingResult.scaledLegibility;
          modified = true;
        }
      }
      if (modified) {
        writeFileSync(reportPath, JSON.stringify(rawReport, null, 2), 'utf8');
      }
    }
  } catch {
    // レポート更新失敗時は継続
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
      scaledLegibility: r.scaledLegibility,
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
