import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, readFileSync, writeFileSync, readdirSync, chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {loadPlan} from '../src/plan.ts';
import {renderMockAudioMedia} from '../src/mock-audio-media.ts';
import {ffmpegPath} from '../src/media.ts';

function fixture(seconds = 2) {
  return loadPlan({schema: 2, id: 'mock-audio-test', title: '模擬音声の媒体検査', version: 1,
    theme: 'general', sources: [], scenes: Array.from({length: 2}, () => ({title: '合成トーン', narration: '模擬音です', seconds: 4 * seconds,
    cues: Array.from({length: 4}, (_, i) => ({text: `模擬トーン${i + 1}`, seconds})),
    sources: [], diagram: {type: 'flow', items: ['入力', '確認', '結果']}}))});
}

test('real WAV slices concatenate, decode, synchronize and duck BGM in both stem and final mix', () => {
  const root = mkdtempSync(join(tmpdir(), 'T138-measure-'));
  try {
    const {directory, report} = renderMockAudioMedia(fixture(), root);
    assert.equal(report.mode, 'mock'); assert.equal(report.narration, false);
    assert.equal(report.fullDecode, 'passed'); assert.equal(report.sync.ok, true);
    assert.equal(report.decodedSamples, 16 * 24000);
    assert.equal(report.cues.length, 8);
    assert.deepEqual(report.cues.map(c => c.start), [0, 2, 4, 6, 8, 10, 12, 14]);
    for (const m of report.measurements) {
      assert.ok(m.reductionDb > 9.5 && m.reductionDb < 10.5);
      assert.ok(m.mixReductionDb > 9.5 && m.mixReductionDb < 10.5);
    }
    assert.ok(Number.isFinite(report.loudness.integratedLufs));
    assert.ok(report.loudness.truePeakDbfs < -1);
    assert.ok(report.commands.every(c => c.exitCode === 0));
    assert.equal(readFileSync(join(directory, 'mixed.wav')).toString('ascii', 0, 4), 'RIFF');
    assert.equal(report.artifacts.find(a => a.file === 'mixed.wav')?.sha256,
      createHash('sha256').update(readFileSync(join(directory, 'mixed.wav'))).digest('hex'));
    // A second run cannot overwrite a published result.
    const before = readFileSync(join(directory, 'mixed.wav'));
    assert.throws(() => renderMockAudioMedia(fixture(), root), /protected/);
    assert.deepEqual(readFileSync(join(directory, 'mixed.wav')), before);
  } finally {rmSync(root, {recursive: true, force: true});}
});

test('minimum 0.5 second cues still have measured tone and pause windows', () => {
  const root = mkdtempSync(join(tmpdir(), 'T138-short-'));
  try {
    const {report} = renderMockAudioMedia(fixture(0.5), root);
    assert.equal(report.decodedDurationSec, 4);
    assert.equal(report.sync.driftSec, 0);
    assert.equal(report.measurements.length, 8);
  } finally {rmSync(root, {recursive: true, force: true});}
});

test('FFmpeg mix failure removes partial results and preserves existing files byte for byte', () => {
  const root = mkdtempSync(join(tmpdir(), 'T138-failure-'));
  try {
    writeFileSync(join(root, 'existing.wav'), 'existing artifact sentinel');
    const shim = join(root, 'fail-mix.sh');
    const escaped = ffmpegPath().replaceAll("'", "'\\''");
    writeFileSync(shim, `#!/bin/sh\ncase "$*" in *mixed.wav*) echo 'injected mix failure' >&2; exit 17;; esac\nexec '${escaped}' "$@"\n`);
    chmodSync(shim, 0o700);
    assert.throws(() => renderMockAudioMedia(fixture(), root, {ffmpeg: shim}), /FFmpeg failed \(17\).*injected mix failure/s);
    assert.equal(readFileSync(join(root, 'existing.wav'), 'utf8'), 'existing artifact sentinel');
    assert.deepEqual(readdirSync(root).sort(), ['existing.wav', 'fail-mix.sh']);
    // Retrying after failure publishes a new, complete result.
    assert.equal(renderMockAudioMedia(fixture(), root).report.fullDecode, 'passed');
  } finally {rmSync(root, {recursive: true, force: true});}
});

test('repository outputs and malformed cue timing are rejected before media writes', () => {
  assert.throws(() => renderMockAudioMedia(fixture(), '.'), /isolated temporary/);
  const root = mkdtempSync(join(tmpdir(), 'T138-invalid-'));
  try {
    const plan = fixture(); plan.scenes[0].cues[0].seconds = 3;
    assert.throws(() => renderMockAudioMedia(plan, root), /一致しない/);
    assert.deepEqual(readdirSync(root), []);
  } finally {rmSync(root, {recursive: true, force: true});}
});
