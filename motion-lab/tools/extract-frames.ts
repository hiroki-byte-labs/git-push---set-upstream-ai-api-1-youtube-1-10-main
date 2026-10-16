// 高FPSフレーム抽出とタイムスタンプ測定ツール（T115）。
// 指定FPS（30/60fps等）で正確な連番PNGフレーム画像列とタイムスタンプ対応表（frames.json）を出力する。
import {existsSync, mkdirSync, writeFileSync, readdirSync} from 'node:fs';
import {basename, join, resolve} from 'node:path';
import {ffmpeg, probe} from './lib/ffmpeg.ts';

export type FrameEntry = {
  index: number;
  file: string;
  timeSeconds: number;
  timeMilliseconds: number;
  timestamp: string;
};

export type ExtractionManifest = {
  video: string;
  sourceFps: number;
  targetFps: number;
  durationSeconds: number;
  totalFrames: number;
  width: number;
  height: number;
  extractedAt: string;
  frames: FrameEntry[];
};

export type ExtractOptions = {
  outDir?: string;
  fps?: number;
  startSeconds?: number;
  endSeconds?: number;
  maxFrames?: number;
  prefix?: string;
  quiet?: boolean;
};

export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds - Math.floor(seconds)) * 1000);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)}.${p(ms, 3)}`;
}

export function extractFrames(videoPath: string, options: ExtractOptions = {}): ExtractionManifest {
  const resolvedVideo = resolve(videoPath);
  if (!existsSync(resolvedVideo)) throw Error(`入力動画が見つかりません: ${videoPath}`);

  const info = probe(resolvedVideo);
  const targetFps = options.fps ?? info.fps;
  if (!Number.isFinite(targetFps) || targetFps <= 0) throw Error(`不正なFPS指定: ${options.fps}`);

  const startSec = Math.max(0, options.startSeconds ?? 0);
  const endSec = Math.min(info.duration, options.endSeconds ?? info.duration);
  if (startSec >= endSec) throw Error(`無効な時間範囲: start=${startSec}, end=${endSec}`);

  const effectiveDuration = endSec - startSec;
  const outDir = resolve(options.outDir ?? join('motion-lab', 'out', `frames-${basename(videoPath, '.mp4')}`));
  mkdirSync(outDir, {recursive: true});

  const prefix = options.prefix ?? 'frame_';

  // FFmpeg フィルター構築
  const filters: string[] = [];
  if (startSec > 0 || endSec < info.duration) {
    filters.push(`trim=start=${startSec}:end=${endSec},setpts=PTS-STARTPTS`);
  }
  filters.push(`fps=${targetFps}`);

  const outPattern = join(outDir, `${prefix}%04d.png`);
  const ffmpegArgs = [
    '-i', resolvedVideo,
    '-map', '0:v:0',
    '-vf', filters.join(','),
    '-vsync', '0',
    '-start_number', '0',
  ];
  if (options.maxFrames !== undefined && options.maxFrames > 0) {
    ffmpegArgs.push('-vframes', String(options.maxFrames));
  }
  ffmpegArgs.push(outPattern);

  ffmpeg(ffmpegArgs);

  // 抽出されたファイル一覧の収集
  const files = readdirSync(outDir)
    .filter(f => f.startsWith(prefix) && f.endsWith('.png'))
    .sort();

  const frames: FrameEntry[] = files.map((file, i) => {
    const timeSec = startSec + i / targetFps;
    return {
      index: i,
      file,
      timeSeconds: Number(timeSec.toFixed(4)),
      timeMilliseconds: Math.round(timeSec * 1000),
      timestamp: formatTime(timeSec),
    };
  });

  const manifest: ExtractionManifest = {
    video: basename(videoPath),
    sourceFps: info.fps,
    targetFps,
    durationSeconds: Number(effectiveDuration.toFixed(4)),
    totalFrames: frames.length,
    width: info.width,
    height: info.height,
    extractedAt: new Date().toISOString(),
    frames,
  };

  writeFileSync(join(outDir, 'frames.json'), JSON.stringify(manifest, null, 2));
  if (!options.quiet) {
    console.log(`抽出完了: ${frames.length} フレーム (${targetFps} fps) → ${outDir}`);
  }
  return manifest;
}

// CLI 実行部分
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (!args.length || args.includes('--help') || args.includes('-h')) {
    console.log(`使い方: ./scripts/run motion-lab/tools/extract-frames.ts <video-path> [options]
  --out-dir <dir>       出力先ディレクトリ
  --fps <number>        抽出FPS（既定: 動画のFPS）
  --start <seconds>     開始秒数
  --end <seconds>       終了秒数
  --max-frames <count>  最大フレーム数
  --prefix <string>     ファイル名接頭辞 (既定: frame_)
  --quiet               進行ログを抑制`);
    process.exit(args.length ? 0 : 1);
  }

  const video = args[0];
  const opts: ExtractOptions = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--out-dir') opts.outDir = args[++i];
    else if (args[i] === '--fps') opts.fps = Number(args[++i]);
    else if (args[i] === '--start') opts.startSeconds = Number(args[++i]);
    else if (args[i] === '--end') opts.endSeconds = Number(args[++i]);
    else if (args[i] === '--max-frames') opts.maxFrames = Number(args[++i]);
    else if (args[i] === '--prefix') opts.prefix = args[++i];
    else if (args[i] === '--quiet') opts.quiet = true;
  }
  extractFrames(video, opts);
}
