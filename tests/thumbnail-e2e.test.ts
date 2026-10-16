// T167: 3題材の実サムネイル自動制作・E2E整合性検証テスト
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadPlan} from '../src/plan.ts';
import {buildThumbnailCandidates} from '../src/thumbnail-candidates.ts';
import {renderThumbnails} from '../src/thumbnail-renderer.ts';
import {checkThumbnailQuality, readPngDimensions} from '../src/thumbnails.ts';
import {reviewBundle, bundleHash} from '../src/review.ts';

const FIXTURES = [
  {key: 'superstar', path: 'fixtures/sample-superstar-illustration.json'},
  {key: 'surname', path: 'fixtures/sample-surname-illustration.json'},
  {key: 'tolerance', path: 'fixtures/sample-tolerance-illustration.json'},
];

test('3題材E2E検証（T167）: 各3案の専用PNG生成、実寸法、品質合格、承認版一貫性', () => {
  const d = mkdtempSync(join(tmpdir(), 'th-e2e-'));
  try {
    for (const f of FIXTURES) {
      const plan = loadPlan(JSON.parse(readFileSync(f.path, 'utf8')));
      const brief = buildThumbnailCandidates(plan);

      assert.equal(brief.candidates.length, 3);
      assert.deepEqual(brief.candidates.map(c => c.id), ['a', 'b', 'c']);

      const subDir = join(d, f.key);
      const reports = renderThumbnails({brief, outputDir: subDir});

      assert.equal(reports.length, 3);
      assert.ok(reports.every(r => r.ok), `${f.key}の全候補がレポート上合格すること`);

      // 各画像の寸法と実在を検証
      for (const v of ['a', 'b', 'c']) {
        const full = join(subDir, `thumbnail-${v}.png`);
        const mid = join(subDir, `thumbnail-${v}-320.png`);
        const small = join(subDir, `thumbnail-${v}-160.png`);

        assert.ok(existsSync(full), `${full} が存在すること`);
        assert.ok(existsSync(mid), `${mid} が存在すること`);
        assert.ok(existsSync(small), `${small} が存在すること`);

        const dims = readPngDimensions(readFileSync(full));
        assert.deepEqual(dims, {width: 1280, height: 720});
      }

      // 品質検査契約
      const quality = checkThumbnailQuality(subDir, brief, {selectedThumbnail: 'thumbnail-a.png'});
      assert.equal(quality.ok, true);
      assert.equal(quality.canProceed, true);
      assert.equal(quality.selectedOk, true);
      assert.equal(quality.selectedVariant, 'a');
    }
  } finally {
    rmSync(d, {recursive: true, force: true});
  }
});
