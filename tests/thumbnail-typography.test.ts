import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync, cpSync, appendFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateTypography, verifyTypographyFonts} from '../src/thumbnail-typography.ts';
import {loadPlan} from '../src/plan.ts';
import {buildThumbnailCandidates} from '../src/thumbnail-candidates.ts';
import {calculatePlanThumbnailInputHash} from '../src/thumbnail-brief.ts';
import {renderThumbnails} from '../src/thumbnail-renderer.ts';
import {checkThumbnailQuality, measureScaledLegibility, decodePngRgba} from '../src/thumbnails.ts';

test('typography validates family/weight, effects and emphasis without adding unseen words', () => {
  assert.throws(() => validateTypography({family: 'unknown', weight: 900}, '問い'), /family/);
  assert.throws(() => validateTypography({family: 'mincho', weight: 100}, '問い'), /weight/);
  assert.throws(() => validateTypography({family: 'gothic', weight: 900, emphasis: ['別の語']}, '問い'), /emphasis/);
  assert.throws(() => validateTypography({family: 'gothic', weight: 900, glow: 'yes'}, '問い'), /真偽値/);
});

test('font and OFL files are hash-bound; tampered font rejected', () => {
  assert.equal(verifyTypographyFonts().fonts.length, 2);
  const dir = mkdtempSync(join(tmpdir(), 'font-integrity-'));
  try {
    cpSync('assets/fonts', dir, {recursive: true});
    appendFileSync(join(dir, 'noto-serif-jp/NotoSerifJP.ttf'), 'tamper');
    assert.throws(() => verifyTypographyFonts(dir), /SHA-256/);
  } finally {rmSync(dir, {recursive: true, force: true});}
});

test('Plan typography changes input hash and propagates to normal production candidates', () => {
  const plan = loadPlan(JSON.parse(readFileSync('fixtures/sample-superstar-illustration.json', 'utf8')));
  const before = calculatePlanThumbnailInputHash(plan);
  plan.thumbnail = {...plan.thumbnail!, typography: {family: 'gothic', weight: 900, outline: true}};
  loadPlan(plan);
  assert.notEqual(calculatePlanThumbnailInputHash(plan), before);
  const brief = buildThumbnailCandidates(plan);
  assert.equal(brief.candidates[0].typography?.family, 'gothic');
});

for (const [family, fixture] of [['mincho', 'sample-superstar-illustration'], ['gothic', 'sample-surname-illustration']] as const) {
  test(`${family}: actual embedded variable font, decorated PNG and both scaled image gates`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'typography-render-'));
    try {
      const plan = loadPlan(JSON.parse(readFileSync(`fixtures/${fixture}.json`, 'utf8')));
      const brief = buildThumbnailCandidates(plan, {typography: {family, weight: 900, outline: true, glow: true, gradient: true}});
      const reports = renderThumbnails({brief, outputDir: dir});
      for (const r of reports) {
        assert.equal(r.ok, true, r.issues.join('\n'));
        assert.equal(r.typography?.family, family); assert.equal(r.typography?.weight, 900);
        assert.match(r.typography!.fontName, /Noto/);
        assert.equal(r.assetHashes[`font:${family}`].length, 64);
        for (const width of [160, 320]) {
          const score = measureScaledLegibility(readFileSync(join(dir, `thumbnail-${r.variant}-${width}.png`)), r.drawnBox, r.contrast);
          assert.ok(score.legible, JSON.stringify(score));
          assert.ok(score.contrast >= 3 && score.topEdge >= 0.25);
        }
      }
      if (family === 'gothic') {
        // This fixture previously reflowed from the measured container into a
        // narrower draw rect and cropped the last line halfway through glyphs.
        const image = decodePngRgba(readFileSync(join(dir, 'thumbnail-a.png')))!;
        const foregroundByRow: number[] = [];
        for (let y = 160; y < 440; y++) {
          let count = 0;
          for (let x = 80; x < 700; x++) {
            const i = (y * image.width + x) * 4;
            if (image.data[i] > 150 && image.data[i + 1] > 140 && image.data[i + 2] > 90) count++;
          }
          foregroundByRow.push(count);
        }
        // A complete first-line kanji has a normal flat baseline (~41 pixels).
        // The broken second line lost 145 foreground pixels at the clip edge.
        assert.ok(!foregroundByRow.some((n, i) => i > 0 && n === 0 && foregroundByRow[i - 1] > 100), 'last line must not end in an abrupt wide horizontal crop');
      }
      assert.equal(checkThumbnailQuality(dir, brief).canProceed, true);
    } finally {rmSync(dir, {recursive: true, force: true});}
  });
}
