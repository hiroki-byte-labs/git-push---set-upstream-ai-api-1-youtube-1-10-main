import {existsSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import type {Plan} from './plan.ts';
import type {VisualProvider} from './providers.ts';
import type {SubtitleMode} from './media.ts';
import {DEFAULT_SUBTITLES} from './commands/sample.ts';
import {toRemotionPlanProps} from '../motion-lab/src/remotion-plan.ts';
import type {RemotionContext} from '../motion-lab/src/remotion-plan.ts';
import {ff} from './media.ts';
import {inspectRemotionMedia} from './remotion-media.ts';
import {generateMeasuredReport, layoutFrames} from './remotion-layout.ts';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MOTION_LAB = join(REPO_ROOT, 'motion-lab');

export class RemotionVisual implements VisualProvider {
  kind = 'local.remotion';
  subtitles: SubtitleMode;
  resolution: 720 | 1080;
  fps: number;
  scale: number;
  context?: RemotionContext;

  constructor(subtitles: SubtitleMode = DEFAULT_SUBTITLES, resolution: 720 | 1080 = 720, fps = 24, context?: RemotionContext) {
    this.subtitles = subtitles;
    this.resolution = resolution;
    this.fps = fps;
    this.scale = resolution / 720;
    this.context = context;
  }

  async render(plan: Plan, dir: string): Promise<void> {
    const width = this.resolution === 1080 ? 1920 : 1280;
    const height = this.resolution === 1080 ? 1080 : 720;
    const remotionProps = toRemotionPlanProps(plan, this.fps, width, height, this.context ?? plan.production, this.subtitles);

    remotionProps.layoutFrames = layoutFrames(remotionProps);

    // props.json を出力ディレクトリへ保存
    const propsFile = join(dir, 'remotion-props.json');
    writeFileSync(propsFile, JSON.stringify(remotionProps, null, 2));

    // Remotion renderer API: media + sampled DOM/background measurements
    const rawVideo = join(dir, 'remotion-raw.mp4');
    const args = [join(MOTION_LAB, 'tools/render-plan.mjs'), propsFile, rawVideo];

    const r = spawnSync(process.execPath, args, {
      cwd: MOTION_LAB,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      env: {
        ...process.env,
        PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ''}`,
      },
    });

    if (r.status !== 0) {
      throw Error(`Remotionレンダリング失敗 (${r.status}): ${r.stderr || r.stdout}`);
    }

    // 音声および字幕との多重化（H.264/AAC sample.mp4）
    const duration = plan.scenes.reduce((acc: number, s) => acc + s.seconds, 0);
    const audioPath = join(dir, 'audio.wav');
    const vttPath = join(dir, 'subtitles.vtt');
    const out = join(dir, 'sample.mp4');
    const soft = this.subtitles === 'soft' || this.subtitles === 'both';

    const ffArgs = [
      '-i', rawVideo,
      ...(existsSync(audioPath) ? ['-i', audioPath] : []),
      ...(soft && existsSync(vttPath) ? ['-i', vttPath] : []),
      '-map', '0:v',
      ...(existsSync(audioPath) ? ['-map', '1:a'] : []),
      ...(soft && existsSync(vttPath) ? ['-map', `${existsSync(audioPath) ? 2 : 1}:s`] : []),
      '-c:v', 'copy',
      ...(existsSync(audioPath) ? ['-c:a', 'aac', '-b:a', '96k'] : []),
      ...(soft && existsSync(vttPath) ? ['-c:s', 'mov_text', '-metadata:s:s:0', 'language=jpn'] : []),
      '-movflags', '+faststart',
      out,
    ];

    ff(ffArgs);

    // 媒体検査用の render-report.json と media-check.json 生成
    inspectRemotionMedia(dir, {duration, fps: this.fps, width, height, subtitles: this.subtitles});
    const records = generateMeasuredReport(remotionProps, dir);
    this.generateRenderReport(plan, dir, records);
  }

  private generateRenderReport(plan: Plan, dir: string, records: ReturnType<typeof generateMeasuredReport>): void {
    const outVideo = join(dir, 'sample.mp4');
    let frame = 0;
    for (const [i, scene] of plan.scenes.entries()) {
      frame += Math.round(scene.seconds * this.fps);
      ff(['-i', outVideo, '-vf', `select=eq(n\\,${frame-1})`, '-frames:v', '1', join(dir, `scene-${i+1}.png`)]);
    }
    // T164: 動画本文frameの確認画像（scene-*.png）とサムネイルを分離。
    // サムネイルは動画rendererに依存せず、専用描画（renderThumbnails）から共通で出力される。
  }
}
