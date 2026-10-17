// T163追加修正: 背景の明暗は見出しの語句ではなくbriefの明示指定（tone）で決める
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadPlan} from '../src/plan.ts';
import {buildThumbnailCandidates} from '../src/thumbnail-candidates.ts';
import {validateThumbnailBrief} from '../src/thumbnail-brief.ts';
import {renderThumbnails} from '../src/thumbnail-renderer.ts';
import {decodePngRgba} from '../src/thumbnails.ts';

const corner = (file: string) => {const png = decodePngRgba(readFileSync(file))!; return [png.data[0], png.data[1], png.data[2]];};
const lum = ([r, g, b]: number[]) => (r + g + b) / 3;

test('サムネイルの明暗: 見出しの語句では変わらず、tone:lightの指定でだけ明背景になる（T163追加修正）', () => {
  const d = mkdtempSync(join(tmpdir(), 'th-tone-'));
  try {
    const brief = buildThumbnailCandidates(loadPlan(JSON.parse(readFileSync('fixtures/sample-tolerance-illustration.json', 'utf8'))));
    brief.candidates = brief.candidates.map(c => ({...c, composition: 'scene', headline: 'なぜ差別は残る？'}));
    (brief.candidates[1] as any).tone = 'light';
    renderThumbnails({brief, outputDir: d});
    assert.ok(lum(corner(join(d, 'thumbnail-a.png'))) < 60, '語句だけでは暗背景のまま');
    assert.ok(lum(corner(join(d, 'thumbnail-b.png'))) > 200, 'tone:lightで明背景');
    assert.throws(() => validateThumbnailBrief({...brief, candidates: brief.candidates.map(c => ({...c, tone: 'sepia'}))}), /tone/);
  } finally {
    rmSync(d, {recursive: true, force: true});
  }
});
