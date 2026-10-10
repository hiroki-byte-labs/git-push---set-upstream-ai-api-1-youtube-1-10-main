// 映像の区間計算（T043）。場面ごとに「図解の何段目まで表示するか」と「どの字幕cueか」が
// 変わる時点で区間を切り、区間ごとに1枚の画像（scripts/render.swiftが描く）を割り当てる。
import type {Plan, Diagram} from './plan.ts';
import {thumbnailText} from './plan.ts';

export const FPS = 24;
// fade: 最新の段の不透明度（1=完全表示）。highlight: 最新の段を縁取りで強調中か（T079）。
export type Segment = {file: string; scene: number; step: number; cue: number; startFrame: number; frames: number; fade: number; highlight: boolean};
export type RenderFrame = {file: string; scene: number; step: number; cue: number | null; fade?: number; highlight?: boolean};
// フェードは2フレームずつ3段階（不透明度1/3、2/3→1）。強調は段の出現から1秒。
export const FADE_STEPS = [1 / 3, 2 / 3];
export const FADE_FRAMES_EACH = 2;
export const HIGHLIGHT_FRAMES = 24;
// サムネイル（T073）: a=見出し中心、b=図解つき、c=反転配色。
export type ThumbSpec = {file: string; variant: 'a' | 'b' | 'c'; headline: string; sub: string; scene: number};
export type RenderSpec = {fps: number; subtitles: 'burn' | 'none'; frames: RenderFrame[]; thumbnails?: ThumbSpec[]};

// 図解を段階表示するときの段数。flowは要素ごと、compareは左右、branchは問い→答え、numberは一度に表示。
export function diagramSteps(d: Diagram) {
  return d.type === 'flow' ? d.items.length : d.type === 'compare' ? 2 : d.type === 'branch' ? 2 : 1;
}

// 段の出現間隔: 最大1秒、場面の前半40%以内に全段が出そろう。
export const revealInterval = (seconds: number, steps: number) => Math.min(1, (seconds * 0.4) / steps);

export function buildSegments(plan: Plan): Segment[] {
  const segments: Segment[] = [];
  let sceneStart = 0;
  plan.scenes.forEach((s, i) => {
    const total = s.seconds * FPS;
    const steps = diagramSteps(s.diagram);
    const stepStarts = Array.from({length: steps}, (_, k) => Math.round(k * revealInterval(s.seconds, steps) * FPS));
    const cueStarts: number[] = [];
    let acc = 0;
    for (const c of s.cues) {
      cueStarts.push(Math.round(acc * FPS));
      acc += c.seconds;
    }
    // 段の出現後のフェード・強調の境目（T079）。次の段までに収まらない分は付けない。
    const transitions = plan.style?.transitions !== false;
    const extra: number[] = [];
    if (transitions) stepStarts.forEach((st, k) => {
      const limit = k + 1 < stepStarts.length ? stepStarts[k + 1] : total;
      FADE_STEPS.forEach((_, f) => extra.push(Math.min(limit, st + (f + 1) * FADE_FRAMES_EACH)));
      extra.push(Math.min(limit, st + HIGHLIGHT_FRAMES));
    });
    const bounds = [...new Set([...stepStarts, ...cueStarts, ...extra])].filter(b => b < total).sort((a, b) => a - b);
    bounds.forEach((b, k) => {
      const end = k + 1 < bounds.length ? bounds[k + 1] : total;
      const step = stepStarts.filter(x => x <= b).length;
      const cue = cueStarts.filter(x => x <= b).length - 1;
      const since = b - stepStarts[step - 1];
      const fadeIndex = transitions ? Math.floor(since / FADE_FRAMES_EACH) : FADE_STEPS.length;
      const fade = fadeIndex < FADE_STEPS.length ? FADE_STEPS[fadeIndex] : 1;
      const highlight = transitions && since < HIGHLIGHT_FRAMES;
      const name = fade === 1 && !highlight ? `s${i + 1}-st${step}-c${cue + 1}.png` : `s${i + 1}-st${step}-c${cue + 1}-f${fadeIndex}${highlight ? '-h' : ''}.png`;
      segments.push({file: name, scene: i, step, cue, startFrame: sceneStart + b, frames: end - b, fade, highlight});
    });
    sceneStart += total;
  });
  return segments;
}

// 描画仕様。区間の画像（重複なし）に加え、確認用に各場面の完成状態（全段・最初のcue）をscene-N.pngとして描く。
export function buildRenderSpec(plan: Plan, segments: Segment[], subtitles: RenderSpec['subtitles'] = 'burn'): RenderSpec {
  const seen = new Set<string>();
  const frames: RenderFrame[] = [];
  for (const g of segments) {
    if (seen.has(g.file)) continue;
    seen.add(g.file);
    frames.push({file: g.file, scene: g.scene, step: g.step, cue: subtitles === 'burn' ? g.cue : null, fade: g.fade, highlight: g.highlight});
  }
  plan.scenes.forEach((s, i) => frames.push({file: `scene-${i + 1}.png`, scene: i, step: diagramSteps(s.diagram), cue: subtitles === 'burn' ? 0 : null}));
  return {fps: FPS, subtitles, frames};
}

// サムネイルの描画仕様。図解に使う場面は指定がなければ最初のhook以外の場面。
export function buildThumbSpecs(plan: Plan): ThumbSpec[] {
  const {headline, sub} = thumbnailText(plan);
  const fallback = plan.scenes.findIndex(s => s.role !== 'hook');
  const scene = plan.thumbnail?.scene !== undefined ? plan.thumbnail.scene - 1 : Math.max(0, fallback);
  return (['a', 'b', 'c'] as const).map(variant => ({file: `thumbnail-${variant}.png`, variant, headline, sub, scene}));
}
