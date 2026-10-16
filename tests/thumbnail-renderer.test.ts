import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, existsSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {loadPlan} from '../src/plan.ts';
import {buildThumbnailCandidates} from '../src/thumbnail-candidates.ts';
import {renderThumbnails} from '../src/thumbnail-renderer.ts';

const superstarPlan = () => loadPlan(JSON.parse(readFileSync('fixtures/sample-superstar-illustration.json', 'utf8')));
const surnamePlan = () => loadPlan(JSON.parse(readFileSync('fixtures/sample-surname-illustration.json', 'utf8')));

test('サムネイル専用PNG描画（T163）: 動画を生成せず3構図のPNGと実測レポートを出力', () => {
  const plan = superstarPlan();
  const brief = buildThumbnailCandidates(plan);

  const tmpDir = mkdtempSync(join(tmpdir(), 'thumb-render-test-'));
  try {
    const reports = renderThumbnails({
      brief,
      outputDir: tmpDir,
    });

    assert.equal(reports.length, 3);
    assert.deepEqual(reports.map(r => r.variant), ['a', 'b', 'c']);
    assert.deepEqual(reports.map(r => r.file), ['thumbnail-a.png', 'thumbnail-b.png', 'thumbnail-c.png']);

    // 各ファイルの寸法検査（sipsで1280x720を確認）
    for (const r of reports) {
      assert.equal(r.ok, true, `${r.file}の描画結果はokであること: ${r.issues.join(', ')}`);
      assert.ok(r.fitted, `${r.file}は枠内に収まっていること`);
      assert.ok(r.contrast >= 4.5, `${r.file}のコントラスト比(${r.contrast})が4.5以上`);
      assert.ok(r.bytes > 0 && r.bytes <= 2 * 1024 * 1024, `${r.file}の容量が2MiB以内`);

      const fullPng = join(tmpDir, r.file);
      assert.ok(existsSync(fullPng));

      const sipsOut = execFileSync('/usr/bin/sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', fullPng], {encoding: 'utf8'});
      assert.match(sipsOut, /pixelWidth:\s*1280/);
      assert.match(sipsOut, /pixelHeight:\s*720/);

      // 縮小画像の存在確認
      const small320 = join(tmpDir, `thumbnail-${r.variant}-320.png`);
      const small160 = join(tmpDir, `thumbnail-${r.variant}-160.png`);
      assert.ok(existsSync(small320));
      assert.ok(existsSync(small160));
    }
  } finally {
    rmSync(tmpDir, {recursive: true, force: true});
  }
});

test('名字題材でのPNG描画（T163）: 関係図解・ツリー構図のPNG生成', () => {
  const plan = surnamePlan();
  const brief = buildThumbnailCandidates(plan);

  const tmpDir = mkdtempSync(join(tmpdir(), 'thumb-render-surname-'));
  try {
    const reports = renderThumbnails({
      brief,
      outputDir: tmpDir,
    });
    assert.equal(reports.length, 3);
    for (const r of reports) {
      assert.equal(r.ok, true);
      assert.ok(r.headlineSize >= 48);
    }
  } finally {
    rmSync(tmpDir, {recursive: true, force: true});
  }
});
