// 書出し（FFmpeg）と完成動画の検査。結果は <job>/media-check.json に残す。
import {existsSync, readdirSync, writeFileSync, readFileSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {spawnSync} from 'node:child_process';

// 媒体処理は場面の秒数だけを使う（v1/v2共通）。
type Timeline = {scenes: {seconds: number}[]};
export const FPS = 24;
// 描画画像と書出し後のフレームの一致基準（PSNR, dB）。H264の劣化を許し、別画像・黒画面・時刻ずれを検出する。
export const MIN_PSNR = 30;
// PSNRで照合する区間数の上限（長尺で検査時間が伸びすぎないよう、均等に間引く）。
export const MAX_PSNR_CHECKS = 120;

export function ffmpegPath() {
  const dir = 'work/python-deps/imageio_ffmpeg/binaries';
  if (existsSync(dir)) {
    const name = readdirSync(dir).find(n => n.startsWith('ffmpeg-'));
    if (name) return resolve(dir, name);
  }
  return 'ffmpeg';
}

export function ff(args: string[]) {
  const result = spawnSync(ffmpegPath(), ['-hide_banner', '-nostdin', '-y', ...args], {encoding: 'utf8', timeout: 600000, maxBuffer: 32 * 1024 * 1024});
  if (result.status !== 0) throw Error(`FFmpeg: ${result.error?.message ?? result.stderr}`);
  return result.stderr;
}

export function ffmpegVersion() {
  const r = spawnSync(ffmpegPath(), ['-version'], {encoding: 'utf8', timeout: 30000});
  return r.status === 0 ? r.stdout.split('\n')[0].trim() : 'unknown';
}

// segmentsを渡すと区間ごとの画像（T043）、省略すると場面ごとのscene-N.pngで書き出す。
export type EncodeSegment = {file: string; frames: number; startFrame?: number};
export function segmentsOf(plan: Timeline, segments?: EncodeSegment[]): Required<EncodeSegment>[] {
  const list: EncodeSegment[] = segments ?? plan.scenes.map((s, i) => ({file: `scene-${i + 1}.png`, frames: s.seconds * FPS}));
  let start = 0;
  return list.map(g => {
    const r = {file: g.file, frames: g.frames, startFrame: g.startFrame ?? start};
    start = r.startFrame + g.frames;
    return r;
  });
}
export function framesList(plan: Timeline, segments?: EncodeSegment[]) {
  const list = segmentsOf(plan, segments);
  return list.map(g => `file '${g.file}'\nduration ${g.frames / FPS}`).join('\n') + `\nfile '${list.at(-1)!.file}'\n`;
}

export type SubtitleMode = 'burn' | 'soft' | 'both';
export type EncodeOptions = {segments?: EncodeSegment[]; subtitles?: SubtitleMode; narration?: boolean};

// PSNR照合する区間（均等に最大MAX_PSNR_CHECKS件）。
export function psnrTargets<T>(list: T[], max = MAX_PSNR_CHECKS) {
  if (list.length <= max) return list;
  return Array.from({length: max}, (_, k) => list[Math.floor((k * list.length) / max)]);
}

const lastNumber = (text: string, re: RegExp) => {
  const all = [...text.matchAll(re)];
  return all.length ? Number(all.at(-1)![1]) : NaN;
};

// 描画画像との一致（T044）。区間の中央フレームを動画から取り出し、元のPNGとPSNRで比べる。
export function checkPsnr(dir: string, segments: Required<EncodeSegment>[]) {
  const psnr: {file: string; time: number; db: number}[] = [];
  for (const g of psnrTargets(segments)) {
    const time = (g.startFrame + Math.floor(g.frames / 2)) / FPS;
    const probe = join(dir, 'psnr-probe.png');
    ff(['-ss', time.toFixed(4), '-i', join(dir, 'sample.mp4'), '-frames:v', '1', probe]);
    const db = lastNumber(ff(['-i', probe, '-i', join(dir, g.file), '-lavfi', 'psnr', '-f', 'null', '-']), /average:(inf|[\d.]+)/g);
    psnr.push({file: g.file, time, db: Number.isNaN(db) ? Infinity : db});
  }
  const worst = psnr.reduce((m, x) => Math.min(m, x.db), Infinity);
  if (worst < MIN_PSNR) throw Error(`描画画像と動画のフレームが一致しない（最小PSNR ${worst.toFixed(1)} dB < ${MIN_PSNR}）`);
  return {psnr, worst};
}

export function encode(plan: Timeline, dir: string, opts: EncodeOptions = {}) {
  const duration = plan.scenes.reduce((n, s) => n + s.seconds, 0);
  const expectedFrames = duration * FPS;
  const segments = segmentsOf(plan, opts.segments);
  const mode = opts.subtitles ?? 'burn'; // encode単体の既定（sampleはDEFAULT_SUBTITLESを渡す）
  const soft = mode === 'soft' || mode === 'both';
  const out = join(dir, 'sample.mp4');
  writeFileSync(join(dir, 'frames.txt'), framesList(plan, opts.segments));

  // fpsフィルターで24fps固定、tpadで最終画像を延長し、-frames:vで総フレーム数ちょうどにする（T044。旧方式は区間が短いとフレームが欠落した）。
  ff([
    '-f', 'concat', '-safe', '1', '-i', join(dir, 'frames.txt'), '-i', join(dir, 'audio.wav'),
    ...(soft ? ['-i', join(dir, 'subtitles.vtt')] : []),
    '-map', '0:v', '-map', '1:a', ...(soft ? ['-map', '2:s'] : []),
    '-vf', `fps=${FPS},tpad=stop_mode=clone:stop_duration=2`, '-frames:v', String(expectedFrames), '-t', String(duration),
    '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k',
    ...(soft ? ['-c:s', 'mov_text', '-metadata:s:s:0', 'language=jpn'] : []),
    '-movflags', '+faststart', out,
  ]);

  // 完成動画の全フレーム・音声をデコードし、エラーを拒否。
  const decode = ff(['-v', 'error', '-xerror', '-i', out, '-f', 'null', '-']);
  if (decode.trim()) throw Error(`デコード警告: ${decode}`);

  // フレーム数（T044）。
  const videoFrames = lastNumber(ff(['-i', out, '-map', '0:v:0', '-f', 'null', '-']), /frame=\s*(\d+)/g);
  if (videoFrames !== expectedFrames) throw Error(`フレーム数が不一致: ${videoFrames} / 期待 ${expectedFrames}`);

  // ソフト字幕の有無（T044）。
  const info = spawnSync(ffmpegPath(), ['-hide_banner', '-i', out], {encoding: 'utf8'}).stderr;
  const subtitleStreams = (info.match(/Stream #\S+.*Subtitle:/g) ?? []).length;
  if (soft && subtitleStreams !== 1) throw Error(`ソフト字幕のストリームがない（${subtitleStreams}）`);

  // 音声: 長さ・音量・各場面冒頭の確認音。
  ff(['-i', out, '-vn', '-ac', '1', '-ar', '24000', '-f', 's16le', join(dir, 'decoded.pcm')]);
  const b = readFileSync(join(dir, 'decoded.pcm'));
  let peak = 0, energy = 0, nonzero = 0;
  for (let i = 0; i < b.length; i += 2) {
    const v = b.readInt16LE(i);
    peak = Math.max(peak, Math.abs(v));
    energy += v * v;
    if (v) nonzero++;
  }
  if (peak === 0 || peak >= 32767 || Math.abs(b.length / 48000 - duration) > 0.1) throw Error('音声の長さ・音量検査に失敗');
  let start = 0;
  const cuePeaks: number[] = [];
  for (let i = 0; i < plan.scenes.length; i++) {
    ff(['-ss', String(start + 1), '-i', out, '-frames:v', '1', join(dir, `frame-${i + 1}.png`)]);
    let p = 0;
    for (let j = start * 24000; j < (start + 0.7) * 24000; j++) p = Math.max(p, Math.abs(b.readInt16LE(j * 2)));
    if (!p) throw Error('場面の確認音なし');
    cuePeaks.push(p);
    start += plan.scenes[i].seconds;
  }

  const {psnr, worst} = checkPsnr(dir, segments);

  // 音量（記録のみ。確認音には目標値を設けず、ナレーション接続時に基準を決める）。
  const loud = ff(['-i', out, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const loudness = {integratedLufs: lastNumber(loud, /I:\s+(-?[\d.]+) LUFS/g), truePeakDbfs: lastNumber(loud, /Peak:\s+(-?[\d.]+) dBFS/g), target: '未設定（ナレーション接続時に決める）'};

  writeFileSync(join(dir, 'media-check.json'), JSON.stringify({
    expectedDuration: duration, expectedFrames, videoFrames, decodedAudioDuration: b.length / 48000, fullDecode: 'passed',
    subtitles: mode, subtitleStreams, audioPeak: peak, audioRms: Math.sqrt(energy / (b.length / 2)), nonzeroSamples: nonzero, cuePeaks,
    framesExtracted: plan.scenes.length, psnr: {minDb: worst, threshold: MIN_PSNR, checked: psnr.length, segments: segments.length, samples: psnr},
    loudness, renderer: 'AppKit + FFmpeg H264/AAC', narration: opts.narration ?? false,
  }, null, 2));
}
