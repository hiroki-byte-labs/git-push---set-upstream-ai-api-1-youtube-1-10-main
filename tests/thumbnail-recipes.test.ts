import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  THUMBNAIL_ORIGINAL_ASSETS,
  THUMBNAIL_RECIPES,
  verifyThumbnailAssets,
  renderRecipePreviewSvg,
} from '../src/thumbnail-recipes.ts';
import {generateAllThumbnailPreviews} from '../scripts/generate-thumbnail-previews.ts';

test('自作オリジナル素材台帳の整合性（T162）: 全ファイルの実在とSHA-256ハッシュ一致', () => {
  const result = verifyThumbnailAssets();
  assert.equal(result.ok, true, `素材検証エラー: ${result.errors.join(', ')}`);
  assert.equal(Object.keys(THUMBNAIL_ORIGINAL_ASSETS).length, 6);

  // 各素材の自作根拠と作者が記録されていること
  for (const [id, meta] of Object.entries(THUMBNAIL_ORIGINAL_ASSETS)) {
    assert.equal(meta.author, 'Project In-house');
    assert.ok(meta.rightsBasis.includes('self-made'));
    assert.match(meta.sha256, /^[a-f0-9]{64}$/);
    assert.ok(meta.description.length > 0);
  }
});

test('構図レシピのレイアウト定義（T162）: 1280x720の領域・見出し余白・コントラスト', () => {
  const recipeKeys = Object.keys(THUMBNAIL_RECIPES);
  assert.ok(recipeKeys.includes('contrast-dark'));
  assert.ok(recipeKeys.includes('symbol-dark'));
  assert.ok(recipeKeys.includes('relationship-dark'));
  assert.ok(recipeKeys.includes('scene-light'));

  for (const key of recipeKeys) {
    const r = THUMBNAIL_RECIPES[key];
    // 画面内に収まる領域（1280x720）
    assert.ok(r.headlineArea.x >= 0 && r.headlineArea.x + r.headlineArea.width <= 1280);
    assert.ok(r.headlineArea.y >= 0 && r.headlineArea.y + r.headlineArea.height <= 720);
    assert.ok(r.visualArea.x >= 0 && r.visualArea.x + r.visualArea.width <= 1280);
    assert.ok(r.visualArea.y >= 0 && r.visualArea.y + r.visualArea.height <= 720);

    // 文字フォントサイズ（主見出しは大きめ）
    assert.ok(r.headlineArea.fontSize >= 60, `${key}: 主見出しフォントサイズが60以上`);
    assert.ok(r.subArea.fontSize >= 28, `${key}: 補足フォントサイズが28以上`);
  }
});

test('プレビューSVGレンダリング（T162）: 構図ごとのSVG文字列生成', () => {
  const svg = renderRecipePreviewSvg(
    'contrast-dark',
    '格差の理由とは？',
    'わずかな実力差と大きな報酬',
    '<circle cx="100" cy="100" r="50"/>'
  );
  assert.ok(svg.includes('viewBox="0 0 1280 720"'));
  assert.ok(svg.includes('格差の理由とは？'));
  assert.ok(svg.includes('わずかな実力差と大きな報酬'));
  assert.ok(svg.includes('<circle cx="100" cy="100" r="50"/>'));
});

test('3題材比較プレビュー生成スクリプト（T162）: 隔離一時ディレクトリでの生成検証', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'thumb-preview-test-'));
  try {
    const res = generateAllThumbnailPreviews(tmp);
    assert.equal(res.count, 3);
    assert.ok(existsSync(res.htmlPath));
    assert.ok(existsSync(join(tmp, 'disparity-contrast.svg')));
    assert.ok(existsSync(join(tmp, 'surname-relationship.svg')));
    assert.ok(existsSync(join(tmp, 'moon-scene.svg')));
  } finally {
    rmSync(tmp, {recursive: true, force: true});
  }
});
