// FFmpegの呼び出し。探索順: FFMPEG_BIN → リポジトリのwork/（scripts/setup-mediaで取得）→ PATH。
import {spawn, spawnSync} from 'node:child_process';
import {existsSync, readdirSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const LAB = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function ffmpegPath(): string {
  if (process.env.FFMPEG_BIN) return process.env.FFMPEG_BIN;
  const dir = join(LAB, '..', 'work', 'python-deps', 'imageio_ffmpeg', 'binaries');
  if (existsSync(dir)) {
    const name = readdirSync(dir).find(n => n.startsWith('ffmpeg-'));
    if (name) return join(dir, name);
  }
  return 'ffmpeg';
}

export function ffmpegVersion(): string {
  const r = spawnSync(ffmpegPath(), ['-version'], {encoding: 'utf8'});
  if (r.error) throw Error(`FFmpegが見つからない（FFMPEG_BINで指定可）: ${r.error.message}`);
  return r.stdout.split('\n')[0].replace(/^ffmpeg version\s+/, '').split(' ')[0];
}

/** FFmpegを実行し、失敗なら標準エラーの末尾つきで例外。標準エラー全文を返す。 */
export function ffmpeg(args: string[]): string {
  const r = spawnSync(ffmpegPath(), ['-hide_banner', '-nostdin', '-y', ...args], {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
  if (r.error) throw r.error;
  if (r.status !== 0) throw Error(`ffmpeg失敗 (${r.status}): ${args.join(' ')}\n${r.stderr.slice(-2000)}`);
  return r.stderr;
}

export type VideoInfo = {width: number; height: number; fps: number; frameCount: number; duration: number; hasAudio: boolean; codec: string};

/** ffprobeを使わずに、ffmpegの情報表示と全フレームのデコードで尺・フレーム数を確定する。 */
export function probe(path: string): VideoInfo {
  const info = spawnSync(ffmpegPath(), ['-hide_banner', '-i', path], {encoding: 'utf8'}).stderr;
  const v = info.match(/Stream #\S+.*?Video: (\w+).*?, (\d{2,5})x(\d{2,5})[ ,].*?, ([\d.]+(?:\/[\d.]+)?) fps/);
  if (!v) throw Error(`映像ストリームを読めない: ${path}\n${info.slice(-800)}`);
  const [num, den] = v[4].split('/').map(Number);
  const fps = den ? num / den : num;
  const counted = ffmpeg(['-i', path, '-map', '0:v:0', '-f', 'null', '-']);
  const frames = [...counted.matchAll(/frame=\s*(\d+)/g)].at(-1);
  if (!frames) throw Error('フレーム数を数えられない');
  const frameCount = Number(frames[1]);
  return {codec: v[1], width: Number(v[2]), height: Number(v[3]), fps, frameCount, duration: frameCount / fps, hasAudio: /Stream #\S+.*?Audio:/.test(info)};
}

/** 全フレームをRGB24で順に渡す。scale指定時は縮小（解析用）。 */
export async function forEachFrame(path: string, width: number, height: number, onFrame: (rgb: Uint8Array, index: number) => void, scale?: {w: number; h: number}) {
  const w = scale?.w ?? width, h = scale?.h ?? height, size = w * h * 3;
  const args = ['-hide_banner', '-nostdin', '-i', path, '-map', '0:v:0'];
  if (scale) args.push('-vf', `scale=${w}:${h}:flags=area`);
  args.push('-f', 'rawvideo', '-pix_fmt', 'rgb24', '-');
  const child = spawn(ffmpegPath(), args, {stdio: ['ignore', 'pipe', 'pipe']});
  let err = '';
  child.stderr.on('data', d => { err = (err + d).slice(-4000); });
  let buf: Buffer = Buffer.alloc(0), index = 0;
  for await (const chunk of child.stdout) {
    buf = buf.length ? Buffer.concat([buf, chunk as Buffer]) : (chunk as Buffer);
    while (buf.length >= size) {
      onFrame(new Uint8Array(buf.buffer, buf.byteOffset, size), index++);
      buf = buf.subarray(size);
    }
  }
  const code: number = await new Promise(r => child.on('close', r));
  if (code !== 0) throw Error(`デコード失敗 (${code}): ${err}`);
  return index;
}

/** 指定フレームだけをRGB24で取り出す。 */
export function readFrames(path: string, width: number, height: number, indices: number[]): Map<number, Uint8Array> {
  const uniq = [...new Set(indices)].sort((a, b) => a - b);
  const expr = uniq.map(n => `eq(n\\,${n})`).join('+');
  const r = spawnSync(ffmpegPath(), ['-hide_banner', '-nostdin', '-i', path, '-map', '0:v:0', '-vf', `select='${expr}'`, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {maxBuffer: width * height * 3 * (uniq.length + 1)});
  if (r.status !== 0) throw Error(`フレーム抽出失敗: ${r.stderr?.toString().slice(-1000)}`);
  const size = width * height * 3, out = new Map<number, Uint8Array>();
  if (r.stdout.length !== size * uniq.length) throw Error(`抽出数の不一致: ${r.stdout.length / size} / ${uniq.length}`);
  uniq.forEach((n, i) => out.set(n, new Uint8Array(r.stdout.buffer, r.stdout.byteOffset + i * size, size)));
  return out;
}

/** FFmpegのscdetフィルターでシーン切替候補を得る（フレーム番号とスコア）。 */
export function sceneChanges(path: string, fps: number, threshold = 10): {frame: number; score: number}[] {
  const log = ffmpeg(['-i', path, '-map', '0:v:0', '-vf', `scdet=threshold=${threshold}`, '-f', 'null', '-']);
  return [...log.matchAll(/lavfi\.scd\.score:\s*([\d.]+),\s*lavfi\.scd\.time:\s*([\d.]+)/g)].map(m => ({frame: Math.round(Number(m[2]) * fps), score: Number(m[1])}));
}

/** 区間の連続フレームをPNGで書き出し、一覧画像（コンタクトシート）も作る。 */
export function extractSegmentFrames(path: string, start: number, end: number, dir: string, cols = 8): {count: number; contactSheet: string} {
  const select = `select='between(n\\,${start}\\,${end})'`;
  ffmpeg(['-i', path, '-map', '0:v:0', '-vf', select, '-fps_mode', 'passthrough', '-start_number', String(start), join(dir, 'f%04d.png')]);
  const count = end - start + 1, rows = Math.ceil(count / cols);
  const sheet = join(dir, 'contact.png');
  // 各コマに元のフレーム番号を描く（フォントがなければ番号なし）。
  const font = ['/System/Library/Fonts/Supplemental/Arial.ttf', '/System/Library/Fonts/Helvetica.ttc'].find(existsSync);
  const label = font ? `,drawtext=fontfile=${font}:text='%{eif\\:n+${start}\\:d}':x=4:y=4:fontsize=16:fontcolor=white:box=1:boxcolor=black@0.6` : '';
  ffmpeg(['-i', path, '-map', '0:v:0', '-vf', `${select},scale=240:-2${label},tile=${cols}x${rows}:padding=2:color=gray`, '-frames:v', '1', sheet]);
  return {count, contactSheet: sheet};
}
