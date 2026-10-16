import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ff} from '../src/media.ts';
import {inspectRemotionMedia} from '../src/remotion-media.ts';

function fixture(dir: string, audio = true, audioSeconds = 2, soft = false, videoSeconds = 2) {
  if (soft) writeFileSync(join(dir, 'subtitles.vtt'), 'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nTest\n');
  ff(['-f', 'lavfi', '-i', `color=c=blue:s=320x180:r=24:d=${videoSeconds}`,
    ...(audio ? ['-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=24000:duration=${audioSeconds}`] : []),
    ...(soft ? ['-i', join(dir, 'subtitles.vtt')] : []),
    '-map', '0:v', ...(audio ? ['-map', '1:a'] : []), ...(soft ? ['-map', `${audio ? 2 : 1}:s`, '-c:s', 'mov_text'] : []),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', ...(audio ? ['-c:a', 'aac'] : []), '-movflags', '+faststart', join(dir, 'sample.mp4')]);
}
const expected = {duration: 2, fps: 24, width: 320, height: 180, subtitles: 'burn' as const};
for (const scenario of ['valid', 'soft', 'truncated', 'duration', 'audio-duration', 'no-audio', 'no-subtitle', 'inspector-failure', 'decoder-failure', 'wrong-size', 'wrong-fps', 'frame-count']) {
  test(`Remotion media: ${scenario}`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'remotion-media-'));
    try {
      fixture(dir, scenario !== 'no-audio', scenario === 'audio-duration' ? 1 : 2, scenario === 'soft', scenario === 'frame-count' ? 47 / 24 : 2);
      if (scenario === 'truncated') {
        const b = readFileSync(join(dir, 'sample.mp4'));
        writeFileSync(join(dir, 'sample.mp4'), b.subarray(0, Math.floor(b.length * 0.7)));
      }
      const options = {...expected,
        ...(scenario === 'duration' ? {duration: 3} : {}),
        ...(scenario === 'wrong-size' ? {width: 640} : {}),
        ...(scenario === 'wrong-fps' ? {fps: 30} : {}),
        ...(['soft', 'no-subtitle'].includes(scenario) ? {subtitles: 'both' as const} : {}),
        ...(scenario === 'inspector-failure' ? {ffprobe: '/missing/ffprobe'} : {}),
        ...(scenario === 'decoder-failure' ? {ffmpeg: '/missing/ffmpeg'} : {}),
      };
      if (['valid', 'soft'].includes(scenario)) {
        const m = inspectRemotionMedia(dir, options);
        assert.equal(m.status, 'passed'); assert.equal(m.fullDecode, 'passed');
        assert.equal(m.videoFrames, 48); assert.equal(m.expectedFrames, 48);
        assert.equal(m.videoDuration, 2); assert.ok(Math.abs(m.decodedAudioDuration! - 2) < 0.1);
        assert.equal(m.subtitleStreams, scenario === 'soft' ? 1 : 0);
        assert.ok(m.audio!.peak > 0); assert.ok(m.commands.every(c => c.exitCode === 0));
      } else {
        assert.throws(() => inspectRemotionMedia(dir, options), /媒体検査/);
        const m = JSON.parse(readFileSync(join(dir, 'media-check.json'), 'utf8'));
        assert.equal(m.status, 'failed'); assert.ok(m.error);
        const reasons: Record<string, RegExp> = {duration: /duration不一致/, 'audio-duration': /audio duration不一致/, 'no-audio': /映像\/音声stream/, 'no-subtitle': /字幕stream/, 'wrong-size': /解像度/, 'wrong-fps': /fps/, 'frame-count': /frame数不一致/, 'inspector-failure': /ENOENT/, 'decoder-failure': /ENOENT/};
        if (reasons[scenario]) assert.match(m.error, reasons[scenario]);
        if (['truncated', 'inspector-failure', 'decoder-failure'].includes(scenario)) assert.notEqual(m.fullDecode, 'passed');
      }
    } finally { rmSync(dir, {recursive: true, force: true}); }
  });
}
