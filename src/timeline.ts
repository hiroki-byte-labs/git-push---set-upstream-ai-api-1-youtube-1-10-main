// 映像の区間計算（T043）。場面ごとに「図解の何段目まで表示するか」と「どの字幕cueか」が
// 変わる時点で区間を切り、区間ごとに1枚の画像（scripts/render.swiftが描く）を割り当てる。
import type {Plan, Diagram} from './plan.ts';
import {thumbnailText, diagramSteps} from './plan.ts';
import {illustrationFrame, illustrationReveals, PERSON_CONTOURS} from './illustration.ts';
import type {IllustrationFrame} from './illustration.ts';
export {diagramSteps} from './plan.ts';

export const FPS = 24;
// fade: 最新の段の不透明度（1=完全表示）。highlight: 最新の段を縁取りで強調中か（T079）。
// motion（T106）: 動きのある段の進み具合（0〜1、1未満の区間だけ持つ）。1フレームずつの区間になる。
export type Segment = {file: string; scene: number; step: number; cue: number; startFrame: number; frames: number; fade: number; highlight: boolean; motion?: number; illustration?:IllustrationFrame};
export type RenderFrame = {file: string; scene: number; step: number; cue: number | null; fade?: number; highlight?: boolean; motion?: number; illustration?:IllustrationFrame};
// フェードは2フレームずつ3段階（不透明度1/3、2/3→1）。強調は段の出現から1秒。
export const FADE_STEPS = [1 / 3, 2 / 3];
export const FADE_FRAMES_EACH = 2;
export const HIGHLIGHT_FRAMES = 24;
// 意味を示す動き（T106）の長さ。0.5秒（docs/PRODUCTION-GUIDELINES.mdの目安）。次の段までに収まらなければ短くする。
export const MOTION_FRAMES = 12;
// その段に動きがあるか。meterは全段（棒が伸びる）、flowのtravelは2段目以降（矢印が伸びる）。
export function hasMotion(d: Diagram, stepIndex: number) {
  return d.type === 'meter' || (d.type === 'flow' && d.motion === 'travel' && stepIndex >= 1);
}
// サムネイル（T073、T106で再設計）: a=問い型、b=図解型、c=対比型。
export type ThumbSpec = {file: string; variant: 'a' | 'b' | 'c'; headline: string; sub: string; scene: number; keyword?: string; contrast?: [string, string]};
export type RenderSpec = {fps: number; subtitles: 'burn' | 'none'; frames: RenderFrame[]; thumbnails?: ThumbSpec[]; illustrationGlyph?:number[][][]};

// 段の出現間隔: 最大1秒、場面の前半40%以内に全段が出そろう。
export const revealInterval = (seconds: number, steps: number) => Math.min(1, (seconds * 0.4) / steps);

export function buildSegments(plan: Plan): Segment[] {
  const segments: Segment[] = [];
  let sceneStart = 0;
  plan.scenes.forEach((s, i) => {
    const total = s.seconds * FPS;
    const steps = diagramSteps(s.diagram);
    // 段の表示開始。revealがあれば説明の時刻に合わせる（T106）。
    const stepStarts = s.diagram.reveal ? s.diagram.reveal.map(t => Math.round(t * FPS)) : Array.from({length: steps}, (_, k) => Math.round(k * revealInterval(s.seconds, steps) * FPS));
    const limitOf = (k: number) => (k + 1 < stepStarts.length ? stepStarts[k + 1] : total);
    const motionFrames = (k: number) => (hasMotion(s.diagram, k) ? Math.max(1, Math.min(MOTION_FRAMES, limitOf(k) - stepStarts[k])) : 0);
    const cueStarts: number[] = [];
    let acc = 0;
    for (const c of s.cues) {
      cueStarts.push(Math.round(acc * FPS));
      acc += c.seconds;
    }
    if(s.diagram.illustration){
      // Illustrations use independent clocks for each element. Render each changed
      // frame and merge only identical holds; the generic 3-step fade cannot do this.
      let previousKey='';
      for(let f=0;f<total;f++){
        const cue=cueStarts.filter(x=>x<=f).length-1;
        const step=stepStarts.filter(x=>x<=f).length;
        const illustration=illustrationFrame(s.diagram.illustration,f/FPS,stepStarts.map(x=>x/FPS),s.seconds,plan.style?.transitions!==false);
        const key=JSON.stringify([cue,step,illustration]);
        if(key===previousKey){segments[segments.length-1].frames++;continue;}
        segments.push({file:`s${i+1}-illustration-${f}-c${cue+1}.png`,scene:i,step,cue,startFrame:sceneStart+f,frames:1,fade:1,highlight:false,illustration});
        previousKey=key;
      }
      sceneStart+=total;
      return;
    }
    // 段の出現後のフェード・強調の境目（T079）。次の段までに収まらない分は付けない。
    const transitions = plan.style?.transitions !== false;
    const extra: number[] = [];
    if (transitions) stepStarts.forEach((st, k) => {
      const limit = limitOf(k);
      // 動きのある段はフェードの代わりに1フレームずつ進める（T106）。
      if (motionFrames(k)) for (let f = 1; f <= motionFrames(k); f++) extra.push(Math.min(limit, st + f));
      else FADE_STEPS.forEach((_, f) => extra.push(Math.min(limit, st + (f + 1) * FADE_FRAMES_EACH)));
      extra.push(Math.min(limit, st + HIGHLIGHT_FRAMES));
    });
    const bounds = [...new Set([...stepStarts, ...cueStarts, ...extra])].filter(b => b < total).sort((a, b) => a - b);
    bounds.forEach((b, k) => {
      const end = k + 1 < bounds.length ? bounds[k + 1] : total;
      const step = stepStarts.filter(x => x <= b).length;
      const cue = cueStarts.filter(x => x <= b).length - 1;
      const since = b - stepStarts[step - 1];
      const mf = transitions ? motionFrames(step - 1) : 0;
      const motion = mf && since + 1 < mf ? (since + 1) / mf : undefined;
      const fadeIndex = transitions && !mf ? Math.floor(since / FADE_FRAMES_EACH) : FADE_STEPS.length;
      const fade = fadeIndex < FADE_STEPS.length ? FADE_STEPS[fadeIndex] : 1;
      const highlight = transitions && since < HIGHLIGHT_FRAMES;
      const base = `s${i + 1}-st${step}-c${cue + 1}`;
      const name = motion !== undefined ? `${base}-m${since}${highlight ? '-h' : ''}.png` : fade === 1 && !highlight ? `${base}.png` : `${base}-f${fadeIndex}${highlight ? '-h' : ''}.png`;
      segments.push({file: name, scene: i, step, cue, startFrame: sceneStart + b, frames: end - b, fade, highlight, ...(motion !== undefined ? {motion} : {})});
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
    frames.push({file: g.file, scene: g.scene, step: g.step, cue: subtitles === 'burn' ? g.cue : null, fade: g.fade, highlight: g.highlight, ...(g.motion !== undefined ? {motion: g.motion} : {}), ...(g.illustration ? {illustration:g.illustration}: {})});
  }
  plan.scenes.forEach((s, i) => frames.push({file: `scene-${i + 1}.png`, scene: i, step: diagramSteps(s.diagram), cue: subtitles === 'burn' ? 0 : null, ...(s.diagram.illustration ? {illustration:illustrationFrame(s.diagram.illustration,s.seconds,illustrationReveals(s.diagram,s.seconds),s.seconds,false)}:{})}));
  return {fps: FPS, subtitles, frames, ...(plan.scenes.some(s=>s.diagram.illustration) ? {illustrationGlyph:PERSON_CONTOURS}:{})};
}

// サムネイルの描画仕様。図解に使う場面は指定がなければ最初のhook以外の場面。
// 対比型（c）の左右の文言。明示がなければ図解から補う（compare→左右、meter→最初の品目とまとめ、branch→はい/いいえ、flow→最初と最後）。
export function thumbContrast(plan: Plan): [string, string] | undefined {
  if (plan.thumbnail?.contrast) return plan.thumbnail.contrast;
  const order = plan.thumbnail?.scene !== undefined ? [plan.scenes[plan.thumbnail.scene - 1], ...plan.scenes] : plan.scenes;
  for (const s of order) {
    const d = s.diagram;
    if (d.type === 'compare') return [d.left, d.right];
    if (d.type === 'meter') return [d.bars[0].label, d.total];
  }
  const d = order.map(s => s.diagram).find(x => x.type === 'branch' || x.type === 'flow');
  return d?.type === 'branch' ? [d.yes, d.no] : d?.type === 'flow' ? [d.items[0], d.items.at(-1)!] : undefined;
}

export function buildThumbSpecs(plan: Plan): ThumbSpec[] {
  const {headline, sub} = thumbnailText(plan);
  const fallback = plan.scenes.findIndex(s => s.role !== 'hook');
  const scene = plan.thumbnail?.scene !== undefined ? plan.thumbnail.scene - 1 : Math.max(0, fallback);
  const keyword = plan.thumbnail?.keyword, contrast = thumbContrast(plan);
  return (['a', 'b', 'c'] as const).map(variant => ({file: `thumbnail-${variant}.png`, variant, headline, sub, scene, ...(keyword ? {keyword} : {}), ...(contrast ? {contrast} : {})}));
}
