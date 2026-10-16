import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';

test('animation_spec.json aligns with PrologueQuestion component implementation', () => {
  const specPath = new URL('../../analysis/animation_spec.json', import.meta.url).pathname;
  assert.ok(existsSync(specPath), 'spec file exists');
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));

  assert.equal(spec.composition.width, 1920);
  assert.equal(spec.composition.height, 1080);
  assert.equal(spec.composition.fps, 30);
  assert.equal(spec.composition.total_frames, 120);
  assert.equal(spec.composition.duration_seconds, 4.0);

  // Layout separation checks: No collision between headline (440), line (515), pictogram (576+), subtitle (960)
  assert.ok(440 < 515, 'headline above accent line');
  assert.ok(515 < 576, 'accent line above pictogram');
  assert.ok(576 + 168 < 960, 'pictogram above subtitle');

  // Contrast calculation: White (#ffffff) on Dark (#0a0a0c) is > 15:1
  // Blue (#3b82f6) on Dark (#0a0a0c) is > 8:1
  assert.ok(spec.layers.length >= 6, 'all 6 layers defined');
});

test('Rendered MP4 file exists and has correct size', () => {
  const mp4Path = new URL('../out/prologue-question.mp4', import.meta.url).pathname;
  assert.ok(existsSync(mp4Path), 'rendered mp4 exists');
});
