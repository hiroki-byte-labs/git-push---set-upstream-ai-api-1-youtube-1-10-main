// Remotion成果物を描画処理とは独立して検査する。native固有のPSNRはmedia.tsに残す。
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {ffmpegPath} from './media.ts';
import type {SubtitleMode} from './media.ts';

export function remotionFfprobePath(): string {
  // Remotionに同梱された同一platform/archのffprobe。無ければPATHを使い、起動失敗は未検査として拒否する。
  try {
    const cli = createRequire(new URL('../motion-lab/package.json', import.meta.url)).resolve('@remotion/cli/package.json');
    const renderer = createRequire(cli).resolve('@remotion/renderer/package.json');
    const pkg = createRequire(renderer).resolve(`@remotion/compositor-${process.platform}-${process.arch}/package.json`);
    return join(dirname(pkg), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
  } catch { return 'ffprobe'; }
}

type Expectations = {duration: number; fps: number; width: number; height: number; subtitles: SubtitleMode; ffprobe?: string; ffmpeg?: string};
type Command = {executable: string; args: string[]; exitCode: number | null; signal: string | null; stdout: string; stderr: string; error?: string; env: {DYLD_LIBRARY_PATH?: string}};
type Stream = {codec_type: string; codec_name: string; width?: number; height?: number; avg_frame_rate?: string; duration?: string; sample_rate?: string; channels?: number};
type Report = {
  status: 'failed' | 'passed'; fullDecode: 'not_run' | 'failed' | 'passed';
  expectedDuration: number; expectedFrames: number; expected: Expectations;
  videoFrames?: number; videoDuration?: number; audioDuration?: number; decodedAudioDuration?: number;
  subtitleStreams?: number; streams?: Stream[]; containerDuration?: number;
  audio?: {sampleRate: number; channels: number; samples: number; peak: number; rms: number; nonzeroSamples: number};
  unmeasured: string[]; tolerances: {durationSeconds: number}; commands: Command[]; error?: string;
  artifact?: {sha256: string}; subtitles: SubtitleMode; narration: false; renderer: string;
};

export function inspectRemotionMedia(dir: string, expected: Expectations): Report {
  const out = join(dir, 'sample.mp4');
  const report: Report = {
    status: 'failed', fullDecode: 'not_run', expectedDuration: expected.duration,
    expectedFrames: Math.round(expected.duration * expected.fps), expected,
    subtitles: expected.subtitles, narration: false, renderer: 'Remotion + FFmpeg H264/AAC',
    // AAC末尾paddingとframe量子化を許容。フレーム数は別途厳密一致。
    tolerances: {durationSeconds: 0.1}, commands: [],
    unmeasured: ['LUFS / true peak', '場面ごとの確認音・自然音声品質', 'PSNR（native固有）', '字幕表示内容・時刻'],
  };
  let scratch: string | undefined;
  const run = (executable: string, args: string[]) => {
    const env = process.platform === 'darwin' && executable.includes('@remotion/compositor-') ? {DYLD_LIBRARY_PATH: dirname(executable)} : {};
    const r = spawnSync(executable, args, {env: {...process.env, ...env}, encoding: 'utf8', timeout: 600000, maxBuffer: 32 * 1024 * 1024});
    report.commands.push({executable, args, env, exitCode: r.status, signal: r.signal, stdout: r.stdout ?? '', stderr: r.stderr ?? '', ...(r.error ? {error: r.error.message} : {})});
    if (r.error || r.status !== 0) throw Error(`inspector failed: ${r.error?.message ?? r.stderr}`);
    return r;
  };
  const requireCheck = (ok: boolean, reason: string) => { if (!ok) throw Error(reason); };
  const durationCheck = (value: number, label: string) => requireCheck(Number.isFinite(value) && Math.abs(value - expected.duration) <= report.tolerances.durationSeconds, `${label} duration不一致: ${value} / ${expected.duration}`);
  try {
    requireCheck([expected.duration, expected.fps, expected.width, expected.height].every(n => Number.isFinite(n) && n > 0), 'invalid expectations');
    report.artifact = {sha256: createHash('sha256').update(readFileSync(out)).digest('hex')};
    const probe = run(expected.ffprobe ?? remotionFfprobePath(), ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', out]);
    requireCheck(!probe.stderr.trim(), `probe errors: ${probe.stderr}`);
    const info = JSON.parse(probe.stdout) as {streams: Stream[]; format: {duration: string}};
    report.streams = info.streams;
    const video = info.streams.filter(s => s.codec_type === 'video');
    const audio = info.streams.filter(s => s.codec_type === 'audio');
    report.subtitleStreams = info.streams.filter(s => s.codec_type === 'subtitle').length;
    requireCheck(video.length === 1 && audio.length === 1, '必要な映像/音声streamがない、または複数');
    requireCheck(video[0].codec_name === 'h264' && audio[0].codec_name === 'aac', 'H264/AAC streamが必要');
    requireCheck(video[0].width === expected.width && video[0].height === expected.height, '映像解像度不一致');
    const rate = (video[0].avg_frame_rate ?? '').split('/').map(Number);
    requireCheck(Math.abs(rate[0] / rate[1] - expected.fps) < 0.000001, '映像fps不一致');
    const soft = expected.subtitles !== 'burn';
    requireCheck(report.subtitleStreams === (soft ? 1 : 0) && (!soft || info.streams.some(s => s.codec_type === 'subtitle' && s.codec_name === 'mov_text')), '字幕stream不一致');
    report.videoDuration = Number(video[0].duration);
    report.audioDuration = Number(audio[0].duration);
    report.containerDuration = Number(info.format.duration);
    durationCheck(report.videoDuration, 'video'); durationCheck(report.audioDuration, 'audio'); durationCheck(report.containerDuration, 'container');

    // 出力同期によるフレーム補完を禁止し、全映像/音声を明示mapして実デコード。
    // progressの最終frameは実際に出力したframe数であり、コンテナのnb_framesとは別。
    report.fullDecode = 'failed';
    const decoded = run(expected.ffmpeg ?? ffmpegPath(), ['-hide_banner', '-nostdin', '-v', 'error', '-xerror', '-err_detect', 'explode', '-i', out,
      '-map', '0:v:0', '-map', '0:a:0', '-fps_mode', 'passthrough', '-progress', 'pipe:1', '-nostats', '-f', 'null', '-']);
    requireCheck(!decoded.stderr.trim() && /progress=end/.test(decoded.stdout), '全デコード終了を確認できない');
    const frames = [...decoded.stdout.matchAll(/^frame=(\d+)\s*$/gm)];
    report.videoFrames = frames.length ? Number(frames.at(-1)![1]) : NaN;
    requireCheck(report.videoFrames === report.expectedFrames, `実デコードframe数不一致: ${report.videoFrames} / ${report.expectedFrames}`);
    report.fullDecode = 'passed';

    // PCMは一時領域で測定・削除。sample rate/channelsは原stream、PCM統計は24kHz mono変換後。
    scratch = mkdtempSync(join(tmpdir(), 'remotion-inspect-'));
    const pcm = join(scratch, 'audio.pcm');
    run(expected.ffmpeg ?? ffmpegPath(), ['-hide_banner', '-nostdin', '-v', 'error', '-xerror', '-i', out, '-map', '0:a:0', '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', '-f', 's16le', pcm]);
    const b = readFileSync(pcm);
    requireCheck(b.length > 0 && b.length % 2 === 0, '音声PCM未測定');
    let peak = 0, energy = 0, nonzeroSamples = 0;
    for (let i = 0; i < b.length; i += 2) {
      const v = b.readInt16LE(i); peak = Math.max(peak, Math.abs(v)); energy += v * v; if (v) nonzeroSamples++;
    }
    report.decodedAudioDuration = b.length / 48000;
    report.audio = {sampleRate: 24000, channels: 1, samples: b.length / 2, peak, rms: Math.sqrt(energy / (b.length / 2)), nonzeroSamples};
    durationCheck(report.decodedAudioDuration, 'decoded audio');
    requireCheck(peak > 0 && peak < 32767, '音声無音またはclipping');
    report.status = 'passed';
    return report;
  } catch (e) {
    report.error = String(e);
    throw Error(`Remotion媒体検査に失敗: ${e}`);
  } finally {
    if (scratch) rmSync(scratch, {recursive: true, force: true});
    writeFileSync(join(dir, 'media-check.json'), JSON.stringify(report, null, 2));
  }
}
