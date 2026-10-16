import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, rmSync, existsSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildThumbnailCandidates} from '../src/thumbnail-candidates.ts';
import {renderThumbnails} from '../src/thumbnail-renderer.ts';
import {checkThumbnailQuality, readPngDimensions} from '../src/thumbnails.ts';
import {loadPlan} from '../src/plan.ts';

const loadFixture = (path: string) => loadPlan(JSON.parse(readFileSync(path, 'utf8')));

test('nativeとRemotionの共通サムネイル仕様（T164）: 同一Planから同一専用3候補が出力される', () => {
  const plan = loadFixture('fixtures/sample-v2.json');
  const brief = buildThumbnailCandidates(plan);

  assert.equal(brief.candidates.length, 3);
  assert.deepEqual(brief.candidates.map(c => c.id), ['a', 'b', 'c']);

  // 一時ディレクトリで専用描画を実行
  const d = mkdtempSync(join(tmpdir(), 'th-pipe-'));
  try {
    const reports = renderThumbnails({brief, outputDir: d});
    assert.equal(reports.length, 3);
    assert.ok(reports.every(r => r.ok));

    // 専用PNGファイルの実在と寸法（1280x720）
    for (const v of ['a', 'b', 'c']) {
      const file = `thumbnail-${v}.png`;
      assert.ok(existsSync(join(d, file)));
      const dims = readPngDimensions(readFileSync(join(d, file)));
      assert.deepEqual(dims, {width: 1280, height: 720});

      // 縮小画像（320x180, 160x90）
      assert.ok(existsSync(join(d, `thumbnail-${v}-320.png`)));
      assert.ok(existsSync(join(d, `thumbnail-${v}-160.png`)));
    }

    // 品質検査
    const quality = checkThumbnailQuality(d, brief, {selectedThumbnail: 'thumbnail-a.png'});
    assert.equal(quality.ok, true);
    assert.equal(quality.canProceed, true);
    assert.equal(quality.selectedVariant, 'a');
    assert.equal(quality.selectedOk, true);

    // briefの見出し・補足・モチーフと出力の一致
    for (const cand of brief.candidates) {
      const rep = reports.find(r => r.variant === cand.id);
      assert.ok(rep);
      assert.equal(rep.headline, cand.headline);
    }
  } finally {
    rmSync(d, {recursive: true, force: true});
  }
});

test('動画frame抽出との分離（T164）: RemotionVisualが動画からサムネイルを抜き出さない', async () => {
  const {RemotionVisual} = await import('../src/remotion-visual.ts');
  const rv = new RemotionVisual('burn', 720);

  // RemotionVisualのgenerateRenderReport実装を検証
  // 動画からのff呼び出しでサムネイル出力が行われていないことを確認
  const methodStr = (rv as any).generateRenderReport.toString();
  assert.ok(!methodStr.includes("thumbnail-"), 'RemotionVisualのffmpeg抽出にthumbnailが含まれない');
  assert.ok(methodStr.includes("scene-"), '動画フレームからのscene確認画像出力は保持する');
});

test('不合格サムネイルの安全停止契約（T164）: 破損・欠測時にcanProceedがfalseとなり進行を拒否', () => {
  const plan = loadFixture('fixtures/sample-v2.json');
  const brief = buildThumbnailCandidates(plan);

  const d = mkdtempSync(join(tmpdir(), 'th-fail-'));
  try {
    // 破損PNGを配置
    writeFileSync(join(d, 'thumbnail-a.png'), Buffer.from('corrupted data'));
    writeFileSync(join(d, 'thumbnails-report.json'), JSON.stringify([
      {file: 'thumbnail-a.png', variant: 'a', headlineSize: 80, fitted: true, contrast: 9.0},
    ]));

    const quality = checkThumbnailQuality(d, brief, {selectedThumbnail: 'thumbnail-a.png'});
    assert.equal(quality.canProceed, false);
    assert.equal(quality.ok, false);
    assert.ok(quality.reasons.length > 0);
  } finally {
    rmSync(d, {recursive: true, force: true});
  }
});
