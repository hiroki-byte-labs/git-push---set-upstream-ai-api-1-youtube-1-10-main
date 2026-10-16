import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {extractFrames, formatTime} from '../tools/extract-frames.ts';

test('formatTime: 正確なタイムスタンプ文字列フォーマット', () => {
  assert.equal(formatTime(0), '00:00:00.000');
  assert.equal(formatTime(1.5), '00:00:01.500');
  assert.equal(formatTime(65.123), '00:01:05.123');
  assert.equal(formatTime(3661.05), '01:01:01.050');
});

test('extractFrames: 30fps動画から指定FPSでフレーム抽出とframes.json検証', () => {
  const sampleVideo = resolveVideoPath();
  if (!existsSync(sampleVideo)) {
    throw Error(`テスト対象動画が存在しません: ${sampleVideo}`);
  }

  const testDir = join(tmpdir(), `extract-test-${Date.now()}`);
  try {
    // 1. デフォルト（30fps）抽出
    const manifest30 = extractFrames(sampleVideo, {
      outDir: join(testDir, 'fps30'),
      fps: 30,
      quiet: true,
    });

    assert.equal(manifest30.targetFps, 30);
    assert.equal(manifest30.totalFrames, 120);
    assert.equal(manifest30.frames.length, 120);
    assert.equal(manifest30.frames[0].file, 'frame_0000.png');
    assert.equal(manifest30.frames[0].timeMilliseconds, 0);
    assert.equal(manifest30.frames[119].index, 119);
    assert.ok(existsSync(join(testDir, 'fps30', 'frame_0000.png')));
    assert.ok(existsSync(join(testDir, 'fps30', 'frames.json')));

    // 2. 高FPS（60fps）抽出
    const manifest60 = extractFrames(sampleVideo, {
      outDir: join(testDir, 'fps60'),
      fps: 60,
      quiet: true,
    });

    assert.equal(manifest60.targetFps, 60);
    // 4.0秒 × 60fps = 240フレーム
    assert.equal(manifest60.totalFrames, 240);
    assert.equal(manifest60.frames.length, 240);
    assert.equal(manifest60.frames[239].file, 'frame_0239.png');

    // 3. 区間指定（1.0秒〜2.0秒、30fps = 30フレーム）
    const manifestTrim = extractFrames(sampleVideo, {
      outDir: join(testDir, 'trim'),
      fps: 30,
      startSeconds: 1.0,
      endSeconds: 2.0,
      quiet: true,
    });

    assert.equal(manifestTrim.totalFrames, 30);
    assert.equal(manifestTrim.frames.length, 30);
    assert.equal(manifestTrim.frames[0].timeSeconds, 1.0);
    assert.equal(manifestTrim.frames[0].timeMilliseconds, 1000);

  } finally {
    rmSync(testDir, {recursive: true, force: true});
  }
});

function resolveVideoPath(): string {
  const p1 = new URL('../out/prologue-question.mp4', import.meta.url).pathname;
  if (existsSync(p1)) return p1;
  const p2 = new URL('../../outputs/reflection-demo-80c35d82/sample.mp4', import.meta.url).pathname;
  if (existsSync(p2)) return p2;
  throw Error('テスト用動画が見つかりません');
}
