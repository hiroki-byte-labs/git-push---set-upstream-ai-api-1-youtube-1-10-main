// 参考動画の動きを解析してJSONに保存する。
// 使い方: node tools/analyze.ts <動画> --out <出力先> --rights '<利用許可の根拠>' [--no-frames]
// 動画の取得（ダウンロード）機能は持たない。手元にある、利用を許可された素材だけを入力にする。
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import type {Analysis, ElementAnalysis, MotionSegment, Scene} from '../shared/analysis.ts';
import {analyzeElement, trackScene} from './lib/elements.ts';
import {extractSegmentFrames, ffmpegVersion, forEachFrame, probe, readFrames, sceneChanges} from './lib/ffmpeg.ts';
import {round} from './lib/fit.ts';
import {estimateBackground, hex, observe, type Observation} from './lib/vision.ts';

export const VERSION = '0.1.0';
export const PARAMS = {
  lowResWidth: 320, lowResHeight: 180,
  changedPixelLevel: 10, motionFraction: 0.0005, motionGap: 3, motionPad: 2,
  cutFraction: 0.35, cutMeanDiff: 15, scdetThreshold: 10, scdetStrong: 30,
  maskThreshold: 20, minArea: 12, backgroundMinCoverage: 0.4,
};

export type AnalyzeOptions = {rightsNote: string; outDir?: string; extractFrames?: boolean; log?: (s: string) => void};

export async function analyzeVideo(path: string, opts: AnalyzeOptions): Promise<Analysis> {
  if (!opts.rightsNote?.trim()) throw Error('利用許可の根拠を --rights で記録してください（例: 自作の合成動画、本人撮影、ライセンス名とURL）');
  const log = opts.log ?? (() => {});
  const bytes = readFileSync(path);
  const info = probe(path);
  const {width: W, height: H, fps, frameCount: N} = info;
  log(`入力 ${W}x${H} ${round(fps, 3)}fps ${N}フレーム（${round(info.duration, 2)}秒）`);

  // 1. 縮小フレームの差分でシーン切替と動きの区間を探す。FFmpegのscdetの結果と突き合わせる。
  const lw = PARAMS.lowResWidth, lh = PARAMS.lowResHeight;
  const changed = new Float64Array(N), meanDiff = new Float64Array(N);
  let prev: Uint8Array | null = null;
  await forEachFrame(path, W, H, (px, k) => {
    if (prev) {
      let c = 0, s = 0;
      for (let i = 0; i < lw * lh; i++) {
        const d = Math.max(Math.abs(px[i * 3] - prev[i * 3]), Math.abs(px[i * 3 + 1] - prev[i * 3 + 1]), Math.abs(px[i * 3 + 2] - prev[i * 3 + 2]));
        s += d; if (d > PARAMS.changedPixelLevel) c++;
      }
      changed[k] = c / (lw * lh); meanDiff[k] = s / (lw * lh);
    }
    prev = Uint8Array.from(px);
  }, {w: lw, h: lh});
  const scd = sceneChanges(path, fps, PARAMS.scdetThreshold);
  const cuts = new Map<number, {scdet: number | null; method: string}>();
  for (let k = 1; k < N; k++) {
    const byDiff = changed[k] > PARAMS.cutFraction && meanDiff[k] > PARAMS.cutMeanDiff, s = scd.find(x => Math.abs(x.frame - k) <= 0);
    if (byDiff || (s && s.score >= PARAMS.scdetStrong)) cuts.set(k, {scdet: s?.score ?? null, method: byDiff && s ? 'scdet+差分' : byDiff ? '差分のみ' : 'scdetのみ'});
  }
  const bounds = [0, ...cuts.keys(), N];
  const scenes: Scene[] = bounds.slice(0, -1).map((s, i) => ({
    index: i, startFrame: s, endFrame: bounds[i + 1] - 1, start: round(s / fps, 4), end: round(bounds[i + 1] / fps, 4),
    background: {color: null, coverage: 0, status: 'unknown'},
    cut: i === 0 ? {method: '動画の先頭', scdetScore: null, changedFraction: null} : {method: cuts.get(s)!.method, scdetScore: cuts.get(s)!.scdet, changedFraction: round(changed[s], 4)},
  }));
  log(`シーン ${scenes.length}（切替: ${[...cuts.keys()].join(', ') || 'なし'}）`);

  const motionSegments: MotionSegment[] = [];
  for (const sc of scenes) {
    let cur: {a: number; b: number; peak: number} | null = null;
    const flush = () => { if (cur) motionSegments.push({index: motionSegments.length, scene: sc.index, startFrame: Math.max(sc.startFrame, cur.a - PARAMS.motionPad), endFrame: Math.min(sc.endFrame, cur.b + PARAMS.motionPad), start: 0, end: 0, peakChangedFraction: round(cur.peak, 5), frames: null, elements: []}); cur = null; };
    for (let k = sc.startFrame + 1; k <= sc.endFrame; k++) {
      if (changed[k] <= PARAMS.motionFraction) continue;
      // 変化はフレームk-1→kの間。区間は変化の前後のフレームを含める。
      if (cur && k - 1 - cur.b <= PARAMS.motionGap) { cur.b = k; cur.peak = Math.max(cur.peak, changed[k]); }
      else { flush(); cur = {a: k - 1, b: k, peak: changed[k]}; }
    }
    flush();
  }
  for (const m of motionSegments) { m.start = round(m.startFrame / fps, 4); m.end = round((m.endFrame + 1) / fps, 4); }
  log(`動きの区間 ${motionSegments.length}: ${motionSegments.map(m => `${m.startFrame}-${m.endFrame}`).join(', ')}`);

  // 2. シーンごとに単色背景を推定（先頭・中央・末尾のうち被覆率が最大のフレーム）。
  const bgs = new Map<number, ReturnType<typeof estimateBackground>>();
  const unresolved: Analysis['unresolved'] = [];
  for (const sc of scenes) {
    const idx = [sc.startFrame, Math.floor((sc.startFrame + sc.endFrame) / 2), sc.endFrame];
    const frames = readFrames(path, W, H, idx);
    const bg = estimateBackground(idx.map(i => frames.get(i)!));
    if (bg.coverage < PARAMS.backgroundMinCoverage) {
      sc.background = {color: hex(bg.color), coverage: round(bg.coverage, 4), status: 'unknown', reason: `単色背景とみなせる画素が${(bg.coverage * 100).toFixed(1)}%しかない。図形の切り出しは行わない`};
      unresolved.push({item: `シーン${sc.index}の背景と図形`, reason: sc.background.reason!});
    } else {
      sc.background = {color: hex(bg.color), coverage: round(bg.coverage, 4), status: 'measured'};
      bgs.set(sc.index, bg);
    }
  }

  // 3. 全フレームの前景成分を計測し、シーン内で追跡して図形ごとに解析する。
  const sceneOf = (k: number) => scenes.find(s => k >= s.startFrame && k <= s.endFrame) ?? scenes[scenes.length - 1];
  const byScene = new Map<number, Map<number, Observation[]>>();
  await forEachFrame(path, W, H, (px, k) => {
    const sc = sceneOf(k), bg = bgs.get(sc.index);
    if (!bg) return;
    if (!byScene.has(sc.index)) byScene.set(sc.index, new Map());
    byScene.get(sc.index)!.set(k, observe(px, W, H, bg, k, PARAMS.maskThreshold, PARAMS.minArea));
  });
  const elements: ElementAnalysis[] = [];
  for (const sc of scenes) {
    const bg = bgs.get(sc.index);
    if (!bg) continue;
    const {tracks, dropped} = trackScene(byScene.get(sc.index) ?? new Map(), sc.startFrame, sc.endFrame, bg, W, H);
    if (dropped) log(`シーン${sc.index}: 3フレーム未満の短い成分${dropped}件を雑音として除外`);
    tracks.forEach(t => {
      const id = `s${sc.index}-e${elements.filter(e => e.scene === sc.index).length}`;
      const el = analyzeElement(t, id, {scene: sc.index, startFrame: sc.startFrame, endFrame: sc.endFrame, bg, width: W, height: H, fps, maskThreshold: PARAMS.maskThreshold, minArea: PARAMS.minArea});
      if (el) elements.push(el); else unresolved.push({item: `シーン${sc.index}の成分（追跡${t.id}）`, reason: '位置と大きさを復元できる観測がない（常に両端が見切れている等）'});
    });
  }
  for (const el of elements) {
    if (!el.shape.value) unresolved.push({item: `${el.id} の形`, reason: el.shape.reason ?? '不明'});
    for (const a of el.animations) {
      if (a.from.status === 'unknown') unresolved.push({item: `${a.id}（${a.type}）の開始値`, reason: a.from.reason!});
      if (a.start.status === 'upper_bound') unresolved.push({item: `${a.id}（${a.type}）の開始時刻`, reason: a.start.reason!});
      if (a.easing.status === 'unknown') unresolved.push({item: `${a.id}（${a.type}）のイージング`, reason: a.easing.reason!});
    }
  }
  for (const m of motionSegments) m.elements = elements.filter(e => e.animations.some(a => (a.start.modelFrame ?? a.start.frame ?? 0) <= m.endFrame && (a.end.modelFrame ?? a.end.frame ?? 0) >= m.startFrame)).map(e => e.id);

  // 4. 動きの区間の連続フレームを書き出す。
  if (opts.outDir && opts.extractFrames !== false) {
    for (const m of motionSegments) {
      const dir = join(opts.outDir, 'frames', `seg-${String(m.index).padStart(2, '0')}`);
      mkdirSync(dir, {recursive: true});
      const r = extractSegmentFrames(path, m.startFrame, m.endFrame, dir);
      m.frames = {dir: join('frames', `seg-${String(m.index).padStart(2, '0')}`), count: r.count, contactSheet: join('frames', `seg-${String(m.index).padStart(2, '0')}`, 'contact.png')};
    }
  }
  if (info.hasAudio) unresolved.push({item: '音声', reason: '音声は解析対象外。再現にも使わない'});
  unresolved.push({item: '文字・写真・グラデーション・重なり・遮蔽・3D・粒子', reason: 'この最小版の解析器は、単色背景上の重ならない単色図形だけを対象にする'});
  unresolved.push({item: 'ディゾルブ等の切替効果', reason: 'シーン切替はカット（瞬時の切替）だけを検出する'});

  return {
    schema: 'motion-lab/analysis@1',
    generatedAt: new Date().toISOString(),
    tool: {name: 'motion-lab analyze', version: VERSION, ffmpeg: ffmpegVersion()},
    source: {path, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: statSync(path).size, rightsNote: opts.rightsNote},
    video: {width: W, height: H, fps, frameCount: N, duration: round(info.duration, 4), hasAudio: info.hasAudio},
    params: PARAMS,
    scenes, motionSegments, elements, unresolved,
    assumptions: [
      'フレームkの時刻はk/fps（Remotionの描画と同じ）',
      '背景はシーンごとに単色。図形は単色で互いに重ならない',
      '図形の色は、十分大きく見えた観測のうち背景から最も遠い色を不透明度1とみなす。不透明度はその色への近さの比',
      '画面端で見切れている間は大きさが変わらないとみなして位置を復元する',
      '色はH.264（yuv420p）で圧縮後の値。元の色とは数段階ずれうる',
      'イージングは候補の関数（shared/easing.ts）からの選択。候補にない形はunknownとし、再現は測定値の折れ線で行う',
    ],
  };
}

export function summarize(a: Analysis): string {
  const lines = [`シーン${a.scenes.length}、動きの区間${a.motionSegments.length}、図形${a.elements.length}、未解決${a.unresolved.length}`];
  for (const e of a.elements) {
    lines.push(`- ${e.id} ${e.shape.value ?? '形不明'} ${e.color.value} 最終(${e.layout.final.left},${e.layout.final.top}) ${e.layout.final.width}x${e.layout.final.height}`);
    for (const x of e.animations) lines.push(`    ${x.type} ${x.start.status === 'upper_bound' ? '≤' : ''}${x.start.frame}→${x.end.frame}f イージング:${x.easing.best ?? '-'}（${x.easing.status}）${x.direction ? ' 方向:' + x.direction.label : ''}`);
  }
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2), opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const input = args[0];
  if (!input || input.startsWith('--')) throw Error('使い方: node tools/analyze.ts <動画> --out <出力先> --rights <利用許可の根拠> [--no-frames]');
  const out = resolve(opt('--out') ?? 'out/analysis');
  mkdirSync(out, {recursive: true});
  const a = await analyzeVideo(resolve(input), {rightsNote: opt('--rights') ?? '', outDir: out, extractFrames: !args.includes('--no-frames'), log: s => console.log(s)});
  writeFileSync(join(out, 'analysis.json'), JSON.stringify(a, null, 2) + '\n');
  console.log(summarize(a));
  console.log(`保存: ${join(out, 'analysis.json')}`);
}
