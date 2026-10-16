// T138: synthetic tones only. No TTS provider, credentials, network or sample outputs.
import {mkdtempSync, realpathSync, readFileSync, writeFileSync, existsSync, renameSync, rmSync} from 'node:fs';
import {join, relative, sep} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {loadPlan, totalSeconds} from './plan.ts';
import type {Plan} from './plan.ts';
import {ffmpegPath} from './media.ts';
import {sliceScriptForNarration, checkSubtitleSync, calculateBgmDucking, checkAudioLoudness} from './audio-pipeline.ts';

const RATE = 24000;
const BGM_HZ = 220;
type Window = {start: number; end: number};
type Command = {args: string[]; exitCode: number | null; stderr: string};

function wav(file: string, samples: number, frequency: number, activeSamples: number, amplitude: number) {
  const b = Buffer.alloc(44 + samples * 2);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(RATE, 24); b.writeUInt32LE(RATE * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < activeSamples; i++) b.writeInt16LE(Math.round(32767 * amplitude * Math.sin(2 * Math.PI * frequency * i / RATE)), 44 + i * 2);
  writeFileSync(file, b, {flag: 'wx'});
}

function rmsDb(pcm: Buffer, window: Window) {
  const start = Math.round(window.start * RATE), end = Math.round(window.end * RATE);
  if (start < 0 || end > pcm.length / 2 || end <= start) throw Error('Invalid measurement window');
  let energy = 0;
  for (let i = start; i < end; i++) energy += (pcm.readInt16LE(i * 2) / 32768) ** 2;
  return 20 * Math.log10(Math.sqrt(energy / (end - start)));
}

// Orthogonal 100ms window: synthetic narration (660 + 20*k Hz) and BGM (220 Hz).
// This measures the BGM component in the final mix, independently of narration energy.
function bgmComponentDb(pcm: Buffer, window: Window) {
  const n = RATE / 10, start = Math.round(((window.start + window.end) / 2 - 0.05) * RATE);
  if (window.end - window.start < 0.1 || start < 0 || start + n > pcm.length / 2) throw Error('Short BGM measurement window');
  let sine = 0, cosine = 0;
  for (let j = 0; j < n; j++) {
    const value = pcm.readInt16LE((start + j) * 2) / 32768;
    const phase = 2 * Math.PI * BGM_HZ * j / RATE;
    sine += value * Math.sin(phase); cosine += value * Math.cos(phase);
  }
  return 20 * Math.log10(2 * Math.hypot(sine, cosine) / n / Math.sqrt(2));
}

/** Produces a fresh audio/ directory in an existing isolated temporary root.
 * Publication occurs only after full decoding and measurements; any failure removes staging.
 * Existing results and all other files are preserved. The API accepts validated Plan v2 data.
 */
export function renderMockAudioMedia(input: Plan, isolatedRoot: string, options: {ffmpeg?: string} = {}) {
  const plan = loadPlan(input);
  const root = realpathSync(isolatedRoot);
  const isInside = (parent: string) => {
    const path = relative(realpathSync(parent), root);
    return Boolean(path) && path !== '..' && !path.startsWith(`..${sep}`);
  };
  const repoRelative = relative(realpathSync('.'), root);
  if (![tmpdir(), '/tmp'].some(isInside) ||
      (!repoRelative.startsWith(`..${sep}`) && repoRelative !== '..')) throw Error('An isolated temporary directory outside the repository is required');
  const target = join(root, 'audio');
  if (existsSync(target)) throw Error('Existing audio result is protected');
  const stage = mkdtempSync(join(root, '.audio-stage-'));
  const commands: Command[] = [];
  const executable = options.ffmpeg ?? ffmpegPath();
  const run = (args: string[]) => {
    const result = spawnSync(executable, ['-hide_banner', '-nostdin', '-n', ...args], {encoding: 'utf8', timeout: 600000, maxBuffer: 32 * 1024 * 1024});
    commands.push({args, exitCode: result.status, stderr: result.stderr ?? ''});
    if (result.status !== 0) throw Error(`FFmpeg failed (${result.status}): ${result.error?.message ?? result.stderr}`);
    return result.stderr;
  };
  const decode = (name: string) => {
    const path = join(stage, name);
    const decoded = `${path}.pcm`;
    run(['-v', 'error', '-xerror', '-i', path, '-map', '0:a:0', '-ac', '1', '-ar', String(RATE), '-c:a', 'pcm_s16le', '-f', 's16le', decoded]);
    const b = readFileSync(decoded);
    if (!b.length || b.length % 2) throw Error(`Invalid decoded PCM: ${name}`);
    return b;
  };
  try {
    const version = spawnSync(executable, ['-version'], {encoding: 'utf8', timeout: 30000});
    if (version.status !== 0) throw Error('FFmpeg version check failed');
    const slices = sliceScriptForNarration(plan);
    let totalSamples = 0;
    const cues = slices.map((slice, i) => {
      const samples = Math.round(slice.expectedDurationSec * RATE);
      const activeSamples = Math.round(samples * 0.6);
      const file = `slice-${i}.wav`;
      wav(join(stage, file), samples, 660 + (i % 8) * 20, activeSamples, 0.3);
      const pcm = decode(file);
      slice.actualDurationSec = pcm.length / 2 / RATE;
      slice.audioPath = file;
      const start = totalSamples / RATE;
      totalSamples += pcm.length / 2;
      return {sceneIndex: slice.sceneIndex, cueIndex: slice.cueIndex, text: slice.text, file,
        start, end: totalSamples / RATE, samples: pcm.length / 2, toneEnd: start + activeSamples / RATE};
    });
    writeFileSync(join(stage, 'concat.txt'), cues.map(c => `file '${c.file}'`).join('\n') + '\n', {flag: 'wx'});
    run(['-f', 'concat', '-safe', '1', '-i', join(stage, 'concat.txt'), '-c:a', 'pcm_s16le', join(stage, 'narration.wav')]);
    const narration = decode('narration.wav');
    if (narration.length / 2 !== totalSamples) throw Error('Concatenated sample count mismatch');
    const sync = checkSubtitleSync(plan, slices, 2 / RATE);
    if (!sync.ok || Math.abs(narration.length / 2 / RATE - totalSeconds(plan)) > 2 / RATE) throw Error('Subtitle duration mismatch');
    // Detect real signal edges in the concatenated PCM; do not infer them from text.
    const signal = cues.map(c => {
      let first = -1, last = -1;
      for (let j = Math.round(c.start * RATE); j < Math.round(c.end * RATE); j++) {
        if (Math.abs(narration.readInt16LE(j * 2)) > 327) { if (first < 0) first = j; last = j; }
      }
      if (first < 0 || Math.abs(first / RATE - c.start) > 2 / RATE || Math.abs((last + 1) / RATE - c.toneEnd) > 2 / RATE) throw Error('Decoded tone/subtitle position mismatch');
      return {start: first / RATE, end: (last + 1) / RATE};
    });
    const ducking = calculateBgmDucking(cues.flatMap((c, i) => [
      {sceneIndex: c.sceneIndex, cueIndex: c.cueIndex, text: 'synthetic tone', expectedDurationSec: signal[i].end - c.start},
      {sceneIndex: c.sceneIndex, cueIndex: c.cueIndex, text: '', expectedDurationSec: c.end - signal[i].end},
    ]));
    wav(join(stage, 'bgm.wav'), totalSamples, BGM_HZ, totalSamples, 0.5);
    const ranges = ducking.duckRangeSec.map(w => `between(t,${w.start},${w.end})`).join('+');
    const expression = `if(gt(${ranges},0),${10 ** (ducking.duckedVolumeDb / 20)},${10 ** (ducking.bgmVolumeDb / 20)})`;
    // Apply gain per sample; frame-level volume evaluation shifts short cue boundaries.
    run(['-i', join(stage, 'bgm.wav'), '-af', `aeval='val(0)*${expression}'`, '-c:a', 'pcm_s16le', join(stage, 'bgm-ducked.wav')]);
    run(['-i', join(stage, 'narration.wav'), '-i', join(stage, 'bgm-ducked.wav'), '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=longest:normalize=0[m]', '-map', '[m]', '-c:a', 'pcm_s16le', join(stage, 'mixed.wav')]);
    const background = decode('bgm-ducked.wav'), mixed = decode('mixed.wav');
    if (mixed.length !== narration.length || background.length !== narration.length) throw Error('Mix duration mismatch');
    const measurements = cues.map((c, i) => {
      const speech = {start: c.start + 0.06, end: signal[i].end - 0.01};
      const pause = {start: signal[i].end + 0.06, end: c.end - 0.01};
      const speechDbfs = rmsDb(background, speech), pauseDbfs = rmsDb(background, pause);
      const mixSpeechBgmDbfs = bgmComponentDb(mixed, speech), mixPauseBgmDbfs = bgmComponentDb(mixed, pause);
      const reductionDb = pauseDbfs - speechDbfs, mixReductionDb = mixPauseBgmDbfs - mixSpeechBgmDbfs;
      if (![reductionDb, mixReductionDb].every(d => Number.isFinite(d) && Math.abs(d - 10) < 0.5)) throw Error(`Measured BGM ducking failed at cue ${i}: stem=${reductionDb}, mix=${mixReductionDb}`);
      return {cueIndex: i, speech, pause, speechDbfs, pauseDbfs, reductionDb, mixSpeechBgmDbfs, mixPauseBgmDbfs, mixReductionDb};
    });
    const loud = run(['-i', join(stage, 'mixed.wav'), '-af', 'ebur128=peak=true', '-f', 'null', '-']);
    const last = (re: RegExp) => Number([...loud.matchAll(re)].at(-1)?.[1]);
    const integratedLufs = last(/I:\s+(-?[\d.]+) LUFS/g), truePeakDbfs = last(/Peak:\s+(-?[\d.]+) dBFS/g);
    if (!Number.isFinite(integratedLufs) || !Number.isFinite(truePeakDbfs)) throw Error('Missing loudness measurements');
    let peak = 0;
    for (let j = 0; j < mixed.length; j += 2) peak = Math.max(peak, Math.abs(mixed.readInt16LE(j)));
    if (peak === 0 || peak >= 32767) throw Error('Silent or clipped mix');
    const artifactFiles = [...cues.map(c => c.file), 'narration.wav', 'bgm.wav', 'bgm-ducked.wav', 'mixed.wav'];
    const artifacts = artifactFiles.map(file => {
      const bytes = readFileSync(join(stage, file));
      return {file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')};
    });
    const report = {schema: 1, mode: 'mock', material: 'locally synthesized sine tones; no TTS or human voice',
      planId: plan.id, planHash: createHash('sha256').update(JSON.stringify(plan)).digest('hex'), artifacts,
      narration: false, humanListeningEvaluation: 'not performed', costUsd: 0,
      ffmpeg: version.stdout.split('\n')[0], sampleRate: RATE, fullDecode: 'passed',
      expectedDurationSec: totalSeconds(plan), decodedDurationSec: mixed.length / 2 / RATE,
      decodedSamples: mixed.length / 2, samplePeak: peak, cues, detectedSignal: signal, sync, ducking, measurements,
      loudness: checkAudioLoudness(integratedLufs, truePeakDbfs),
      loudnessPolicy: 'Measured synthetic fixture only; production loudness targets are recorded, not required for this mock.',
      commands};
    writeFileSync(join(stage, 'media-check.json'), JSON.stringify(report, null, 2), {flag: 'wx'});
    // A new result path only; -n prevents FFmpeg from overwriting any stage input.
    if (existsSync(target)) throw Error('Existing audio result is protected');
    renameSync(stage, target);
    return {directory: target, report};
  } catch (error) {
    rmSync(stage, {recursive: true, force: true});
    throw error;
  }
}
