// 台本データ（Plan）からRemotion用Propsへの変換と型定義（T117/ADR-021）
import type {Plan, Scene, Cue, Diagram, Source, ProductionInfo} from '../../src/plan.ts';
import type {SubtitleMode} from '../../src/media.ts';
import {subtitleDisplayText} from '../../src/subtitle-optimizer.ts';

export type RemotionSource = Source & {number: number};
export type RemotionContext = Pick<ProductionInfo, 'mode'> & Partial<Pick<ProductionInfo, 'project'>>;

export interface RemotionCueProps {
  text: string;
  // T187: 焼き込み字幕の表示文字列（textに文節境界の改行を入れたもの）。native描画と同じsubtitleDisplayTextの結果。
  display: string;
  startFrame: number;
  durationFrames: number;
}

export interface RemotionSceneProps {
  index: number;
  title: string;
  seconds: number;
  startFrame: number;
  durationFrames: number;
  narration: string;
  cues: RemotionCueProps[];
  diagram: Diagram;
  role?: string;
  chapter?: string;
  transitions?: boolean;
  sources: string[];
  sourceReferences: RemotionSource[];
  fictional?: boolean;
}

export interface RemotionPlanProps {
  id: string;
  title: string;
  fps: number;
  width: number;
  height: number;
  totalFrames: number;
  durationSeconds: number;
  scenes: RemotionSceneProps[];
  sources: RemotionSource[];
  production?: RemotionContext;
  subtitles?: SubtitleMode;
  layoutFrames?: number[];
  layoutBackgroundOnly?: boolean;
}

export function toRemotionPlanProps(plan: Plan, fps = 30, width = 1920, height = 1080, production: RemotionContext | undefined = plan.production, subtitles: SubtitleMode = 'burn'): RemotionPlanProps {
  // native sourceNumber / metadata.sourceRecords / channel.sourcesTextと同じ初出順。
  // ブラウザーでも読むため、node:fsを使うmetadataモジュールはimportしない。
  const order = [...new Set([...plan.scenes.flatMap(s => s.sources), ...plan.sources.map(s => s.id)])];
  const catalog = new Map(plan.sources.map(s => [s.id, s]));
  const sources = order.map((id, i) => ({...catalog.get(id)!, number: i + 1}));
  const byId = new Map(sources.map(s => [s.id, s]));
  let sceneSeconds = 0;
  const scenes: RemotionSceneProps[] = plan.scenes.map((s: Scene, idx: number) => {
    const sceneStartFrame = Math.round(sceneSeconds * fps);
    const sceneEndFrame = Math.round((sceneSeconds + s.seconds) * fps);
    const sceneDurationFrames = sceneEndFrame - sceneStartFrame;

    let cueSeconds = sceneSeconds;
    const cues: RemotionCueProps[] = s.cues.map((c: Cue, i: number) => {
      const startFrame = Math.round(cueSeconds * fps);
      cueSeconds += c.seconds;
      // 最後は場面終端を共有し、許容される浮動小数点誤差も持ち越さない。
      const endFrame = i === s.cues.length - 1 ? sceneEndFrame : Math.round(cueSeconds * fps);
      const cue: RemotionCueProps = {
        text: c.text,
        display: subtitleDisplayText(c.text),
        startFrame,
        durationFrames: endFrame - startFrame,
      };
      return cue;
    });

    sceneSeconds += s.seconds;
    return {
      index: idx + 1,
      title: s.title,
      seconds: s.seconds,
      startFrame: sceneStartFrame,
      durationFrames: sceneDurationFrames,
      narration: s.narration,
      cues,
      diagram: s.diagram,
      role: s.role,
      chapter: s.chapter,
      transitions: plan.style?.transitions,
      sources: [...s.sources],
      sourceReferences: s.sources.map(id => byId.get(id)!),
      fictional: s.fictional,
    };
  });

  const totalFrames = Math.round(sceneSeconds * fps);
  const durationSeconds = totalFrames / fps;

  return {
    id: plan.id,
    title: plan.title,
    fps,
    width,
    height,
    totalFrames,
    durationSeconds,
    scenes,
    sources,
    production,
    subtitles,
  };
}
