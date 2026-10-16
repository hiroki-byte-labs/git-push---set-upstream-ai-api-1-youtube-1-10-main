// 3題材（格差・名字・月）の自作サムネイルプレビュー生成（T162）
// 原寸（1280x720）および縮小表示（320x180, 160x90）の比較HTMLとSVGを生成する。
import {mkdirSync, writeFileSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {
  THUMBNAIL_RECIPES,
  renderRecipePreviewSvg,
  verifyThumbnailAssets,
} from '../src/thumbnail-recipes.ts';

export function generateAllThumbnailPreviews(outDir: string): {count: number; htmlPath: string} {
  mkdirSync(outDir, {recursive: true});

  // 素材検証
  const assetCheck = verifyThumbnailAssets();
  if (!assetCheck.ok) {
    throw Error(`素材検証エラー:\n${assetCheck.errors.join('\n')}`);
  }

  const personSvg = readFileSync('assets/thumbnail-originals/person-solo.svg', 'utf8')
    .replace(/<svg[^>]*>|<\/svg>/g, '');
  const crowdSvg = readFileSync('assets/thumbnail-originals/crowd-silhouette.svg', 'utf8')
    .replace(/<svg[^>]*>|<\/svg>/g, '');
  const treeSvg = readFileSync('assets/thumbnail-originals/branching-tree.svg', 'utf8')
    .replace(/<svg[^>]*>|<\/svg>/g, '');
  const arrowSvg = readFileSync('assets/thumbnail-originals/convergence-arrow.svg', 'utf8')
    .replace(/<svg[^>]*>|<\/svg>/g, '');
  const moonSvg = readFileSync('assets/thumbnail-originals/moon-glow.svg', 'utf8')
    .replace(/<svg[^>]*>|<\/svg>/g, '');
  const phoneSvg = readFileSync('assets/thumbnail-originals/smartphone-frame.svg', 'utf8')
    .replace(/<svg[^>]*>|<\/svg>/g, '');

  const previews = [
    {
      id: 'disparity-contrast',
      topic: '格差・スーパースター経済学',
      recipeKey: 'contrast-dark' as const,
      headline: 'なぜ一人に富が集中するのか？',
      sub: '実力差はわずかなのに報酬が大きく開く理由',
      snippet: `
        <!-- 左: 単独の勝者（アクセントカラー） -->
        <g transform="translate(180, 20) scale(3)" fill="#e05a47">
          ${personSvg}
        </g>
        <text x="270" y="380" font-family="sans-serif" font-size="28" fill="#e05a47" font-weight="bold" text-anchor="middle">1位（単独）</text>
        
        <!-- 中央: VS記号 -->
        <text x="560" y="240" font-family="sans-serif" font-size="48" fill="#4a5568" font-weight="bold" text-anchor="middle">VS</text>

        <!-- 右: 群衆・多数の参加者 -->
        <g transform="translate(620, 100) scale(1.1)" fill="#9bb3c8">
          ${crowdSvg}
        </g>
        <text x="840" y="380" font-family="sans-serif" font-size="28" fill="#9bb3c8" text-anchor="middle">2位以下（群衆）</text>
      `,
    },
    {
      id: 'surname-relationship',
      topic: '名字絶滅・分枝過程',
      recipeKey: 'relationship-dark' as const,
      headline: 'なぜ名字は絶滅する運命なのか？',
      sub: '世代交代だけで無数の姓が消え去る確率の数理',
      snippet: `
        <!-- 左: 家系分岐ツリー -->
        <g transform="translate(60, 20) scale(1.1)" stroke="#e2e8f0">
          ${treeSvg}
        </g>
        <!-- 右: 収束矢印 -->
        <g transform="translate(560, 80) scale(1.2)" stroke="#ed8936" fill="#ed8936">
          ${arrowSvg}
        </g>
        <text x="850" y="320" font-family="sans-serif" font-size="32" fill="#ed8936" font-weight="bold">極少数の姓へ集約</text>
      `,
    },
    {
      id: 'moon-scene',
      topic: '月とスマホ・知覚の食い違い',
      recipeKey: 'symbol-dark' as const,
      headline: '月はなぜ小さく写るのか？',
      sub: '肉眼の巨大な月とスマホ画面の食い違い',
      snippet: `
        <!-- 背景の大きな月 -->
        <g transform="translate(0, 40) scale(1.2)">
          ${moonSvg}
        </g>
        <!-- 手前のスマホ（画面内に小さな月） -->
        <g transform="translate(240, 100) scale(0.9)" stroke="#4ea8de" fill="#4ea8de">
          ${phoneSvg}
        </g>
      `,
    },
  ];

  for (const p of previews) {
    const svgContent = renderRecipePreviewSvg(p.recipeKey, p.headline, p.sub, p.snippet);
    writeFileSync(join(outDir, `${p.id}.svg`), svgContent, 'utf8');
  }

  // 比較HTMLの出力（原寸1280x720、320x180、160x90を並列表示）
  const htmlContent = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>自作サムネイル 3題材・構図比較プレビュー（T162）</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #1a1e26; color: #e2e8f0; margin: 0; padding: 24px; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    p.note { color: #a0aec0; margin-bottom: 24px; font-size: 14px; }
    .card { background: #252b36; border-radius: 8px; padding: 20px; margin-bottom: 32px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
    .card h2 { font-size: 18px; margin-top: 0; color: #63b3ed; }
    .card .meta { font-size: 13px; color: #a0aec0; margin-bottom: 16px; }
    .preview-row { display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-end; }
    .scale-box { background: #000; border: 1px solid #4a5568; border-radius: 4px; overflow: hidden; }
    .scale-box img { display: block; width: 100%; height: auto; }
    .scale-box.full { width: 640px; } /* 表示用に50%縮小（実寸1280x720） */
    .scale-box.quarter { width: 320px; } /* YouTube一覧サイズ相当 */
    .scale-box.eighth { width: 160px; } /* サイドバー・関連動画サイズ相当 */
    .label { font-size: 12px; color: #cbd5e0; margin-top: 6px; }
  </style>
</head>
<body>
  <h1>自作サムネイル 3題材・構図比較プレビュー（T162）</h1>
  <p class="note">公開参考画像に依存せず、プロジェクト内自作素材（SVG）と構図レシピのみで構成したプレビューです。小サイズ（320x180, 160x90）での主見出し可読性とモチーフの視認性を確認します。</p>

  ${previews.map(p => `
    <div class="card">
      <h2>${p.topic}（${p.recipeKey}）</h2>
      <div class="meta">主見出し: 「${p.headline}」 | 補足: 「${p.sub}」</div>
      <div class="preview-row">
        <div>
          <div class="scale-box full">
            <img src="${p.id}.svg" alt="${p.id} full">
          </div>
          <div class="label">原寸基準（1280×720, 表示幅640px）</div>
        </div>
        <div>
          <div class="scale-box quarter">
            <img src="${p.id}.svg" alt="${p.id} 320">
          </div>
          <div class="label">320×180（モバイル・一覧サイズ）</div>
        </div>
        <div>
          <div class="scale-box eighth">
            <img src="${p.id}.svg" alt="${p.id} 160">
          </div>
          <div class="label">160×90（サイドバー・縮小サイズ）</div>
        </div>
      </div>
    </div>
  `).join('\n')}
</body>
</html>`;

  const htmlPath = join(outDir, 'index.html');
  writeFileSync(htmlPath, htmlContent, 'utf8');

  return {count: previews.length, htmlPath};
}

// CLI直接実行時
if (process.argv[1]?.endsWith('generate-thumbnail-previews.ts')) {
  const out = process.argv[2] ?? 'work/thumbnail-previews';
  const res = generateAllThumbnailPreviews(out);
  console.log(`OK: ${res.count} previews generated at ${res.htmlPath}`);
}
