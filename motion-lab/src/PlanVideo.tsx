// Plan全体または個別Sceneを描画する汎用Remotionコンポーネント（T126）
import React from 'react';
import {MeasuredCanvas} from './layout-probe.tsx';
import {AbsoluteFill, Composition, Series, useCurrentFrame, useVideoConfig, interpolate, Easing} from 'remotion';
import type {RemotionPlanProps, RemotionSceneProps, RemotionContext} from './remotion-plan.ts';
import type {SubtitleMode} from '../../src/media.ts';
import {diagramStepProgress} from './diagram-timing.ts';
import {StandardDiagram} from './StandardDiagram.tsx';
import {illustrationReveals} from '../shared/illustration.ts';
import {VoidBackground, Spotlight, BurnInSubtitle, SuperstarIllustration} from './primitives/index.ts';

const easeOutQuart = Easing.bezier(0.16, 1, 0.3, 1);

export interface SceneTemplateProps {
  scene: RemotionSceneProps;
  fps: number;
  production?: RemotionContext;
  subtitles?: SubtitleMode;
  layoutFrames?: number[];
  layoutBackgroundOnly?: boolean;
}

// 札は見出しと図解の間、出典番号は字幕より下の専用行に置く。
// 長い題名や複数出典は結合せず、常に概要欄と同じ個別番号を示す。
export const SceneInformation: React.FC<Pick<SceneTemplateProps, 'scene' | 'production'>> = ({scene, production}) => {
  const badges = [
    ...(scene.fictional ? ['架空の例'] : []),
    ...(scene.role === 'reflection' ? [production?.mode === 'production' ? '本人の考察' : 'デモ: 仮の考察（本人ではない）'] : []),
    ...(scene.role === 'action' ? ['判断前チェックリスト'] : []),
  ];
  return <>
    {badges.length > 0 && <div data-layout-zone="badge" data-scene-badges style={{position: 'absolute', top: 145, left: 120, right: 120, height: 44, display: 'flex', justifyContent: 'flex-end', gap: 16, fontFamily: '"Hiragino Sans", "Noto Sans JP", sans-serif'}}>
      {badges.map(text => <span key={text} style={{padding: '6px 18px', borderRadius: 8, background: '#1e293b', color: '#f8fafc', fontSize: 24, lineHeight: '32px', whiteSpace: 'nowrap'}}>{text}</span>)}
    </div>}
    {(scene.sourceReferences?.length ?? 0) > 0 && <div data-layout-zone="source" data-scene-sources style={{position: 'absolute', top: 1032, left: 120, right: 120, height: 32, fontSize: 24, lineHeight: '32px', color: '#cbd5e1', fontFamily: '"Hiragino Sans", "Noto Sans JP", sans-serif'}}>
      {'出典: 概要欄 '}{scene.sourceReferences.map(source => <span key={source.id} data-source-id={source.id} data-source-number={source.number}>{`[${source.number}]`}</span>)}
    </div>}
  </>;
};

export const SceneTemplate: React.FC<SceneTemplateProps> = ({scene, fps, production, subtitles = 'burn', layoutFrames, layoutBackgroundOnly}) => {
  const frame = useCurrentFrame();
  const {width} = useVideoConfig();

  // シーン導入のフェードとタイトルアニメーション (0 -> 15フレーム)
  const headerOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeOutQuart,
  });
  const headerTranslateY = interpolate(frame, [0, 20], [-20, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeOutQuart,
  });

  // 現在の字幕cueを判定
  const activeCue = scene.cues.find(
    c => frame >= (c.startFrame - scene.startFrame) && frame < (c.startFrame - scene.startFrame + c.durationFrames)
  );

  return (
    <AbsoluteFill style={{backgroundColor: '#0a0a0c', overflow: 'hidden'}}>
      <MeasuredCanvas scene={scene} frames={layoutFrames} disabled={layoutBackgroundOnly} width={width}>
      {layoutBackgroundOnly && <style>{`[data-layout-root] * {color: transparent !important; text-shadow: none !important} [data-layout-root] svg text {visibility: hidden}`}</style>}
      {/* 1. 背景暗黒空間と環境グロー */}
      <VoidBackground baseColor="#0a0a0c" glowColor="#1e293b" glowIntensity={0.3} />

      {/* 2. 動的スポットライト */}
      <Spotlight x={960} y={480} radius={500} color="rgba(59, 130, 246, 0.12)" startFrame={0} durationInFrames={20} />

      {/* 3. シーンタイトル・ヘッダー */}
      <div
        data-layout-zone="title"
        style={{
          position: 'absolute',
          top: 80,
          left: 120,
          right: 120,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          height: 72,
          gap: 24,
          opacity: scene.transitions === false ? 1 : headerOpacity,
          transform: `translateY(${scene.transitions === false ? 0 : headerTranslateY}px)`,
        }}
      >
        <div style={{display: 'flex', alignItems: 'center', gap: 16, minWidth: 0, flex: 1}}>
          <span style={{color: '#3b82f6', fontSize: 24, fontWeight: 700, fontFamily: 'monospace'}}>
            {String(scene.index).padStart(2, '0')}
          </span>
          <span style={{color: '#f8fafc', fontSize: 36, overflowWrap: 'anywhere', fontWeight: 700, fontFamily: '"Hiragino Sans", "Noto Sans JP", sans-serif'}}>
            {scene.title}
          </span>
        </div>
        {scene.chapter && (
          <span style={{display: 'block', minHeight: 52, color: '#cbd5e1', maxWidth: 360, lineHeight: '26px', overflowWrap: 'anywhere', fontSize: 24, fontWeight: 500, fontFamily: 'sans-serif'}}>
            {scene.chapter}
          </span>
        )}
      </div>

      {/* 4. 図解・メインビジュアルエリア */}
      <div data-layout-zone="diagram"
        style={{
          position: 'absolute',
          top: 200,
          bottom: 230,
          left: 120,
          right: 120,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {renderDiagram(scene, frame, fps)}
      </div>

      {/* 5. 焼き込み字幕 */}
      {subtitles !== 'soft' && activeCue && (
        <BurnInSubtitle
          text={activeCue.display}
          startFrame={activeCue.startFrame - scene.startFrame}
          durationInFrames={activeCue.durationFrames}
          transitions={scene.transitions}
          fontSize={34}
          color="#f8fafc"
        />
      )}
      <SceneInformation scene={scene} production={production} />
      </MeasuredCanvas>
    </AbsoluteFill>
  );
};

export function renderDiagram(scene: RemotionSceneProps, frame: number, fps: number) {
  const d = scene.diagram;
  if (!d) return null;

  if (d.illustration) {
    return <SuperstarIllustration motif={d.illustration} frame={frame} fps={fps} seconds={scene.seconds} reveal={illustrationReveals(d,scene.seconds)} transitions={scene.transitions} />;
  }

  if (d.type === 'meter' || d.type === 'compare' || d.type === 'number') {
    return <StandardDiagram diagram={d} frame={frame} fps={fps} seconds={scene.seconds} transitions={scene.transitions} />;
  }

  if (d.type === 'flow') {
    return (
      <div style={{display: 'flex', alignItems: 'center', gap: 16, width: '100%'}}>
        {d.items.map((item, i) => {
          const op = diagramStepProgress(d, i, frame, fps, scene.seconds, scene.transitions);
          const sc = 0.8 + 0.2 * op;
          return (
            <React.Fragment key={item}>
              <div
                data-diagram-step={i}
                style={{
                  flex: 1, minWidth: 0, overflowWrap: 'anywhere', padding: '24px 24px',
                  background: 'rgba(30, 41, 59, 0.7)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  borderRadius: 12,
                  color: '#ffffff',
                  fontSize: 28,
                  fontWeight: 600,
                  fontFamily: '"Hiragino Sans", "Noto Sans JP", sans-serif',
                  opacity: op,
                  transform: `scale(${sc})`,
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
                }}
              >
                {item}
              </div>
              {i < d.items.length - 1 && (
                <div style={{color: '#60a5fa', fontSize: 32, opacity: diagramStepProgress(d, i + 1, frame, fps, scene.seconds, scene.transitions)}}>→</div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  }

  if (d.type === 'branch') {
    return (
      <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30, width: '100%', overflowWrap: 'anywhere'}}>
        <div data-diagram-step={0} style={{color: '#f8fafc', fontSize: 36, fontWeight: 700, opacity: diagramStepProgress(d, 0, frame, fps, scene.seconds, scene.transitions)}}>{d.question}</div>
        <div data-diagram-step={1} style={{display: 'flex', gap: 60, width: '100%', opacity: diagramStepProgress(d, 1, frame, fps, scene.seconds, scene.transitions)}}>
          <div style={{color: '#60a5fa', fontSize: 28, flex: 1, minWidth: 0, fontWeight: 600}}>YES: {d.yes}</div>
          <div style={{color: '#f87171', fontSize: 28, flex: 1, minWidth: 0, fontWeight: 600}}>NO: {d.no}</div>
        </div>
      </div>
    );
  }

  // 全supported typeは上で専用描画する。情報のない人型へ置き換えない。
  return null;
}

export const PlanVideo: React.FC<Record<string, unknown>> = (rawProps) => {
  const props = rawProps as unknown as RemotionPlanProps;
  return (
    <Series>
      {(props.scenes ?? []).map((scene) => (
        <Series.Sequence key={scene.index} durationInFrames={scene.durationFrames} premountFor={props.fps}>
          <SceneTemplate scene={scene} fps={props.fps ?? 30} production={props.production} subtitles={props.subtitles} layoutFrames={props.layoutFrames} layoutBackgroundOnly={props.layoutBackgroundOnly} />
        </Series.Sequence>
      ))}
    </Series>
  );
};

export const PlanVideoComposition: React.FC = () => {
  const defaultProps: RemotionPlanProps = {
    id: 'default-plan',
    title: 'サンプル',
    fps: 30,
    width: 1920,
    height: 1080,
    totalFrames: 300,
    durationSeconds: 10,
    scenes: [],
    sources: [],
  };

  return (
    <Composition
      id="PlanVideo"
      component={PlanVideo}
      durationInFrames={300}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={defaultProps as unknown as Record<string, unknown>}
      calculateMetadata={({props}) => {
        const p = props as unknown as RemotionPlanProps;
        return {
          durationInFrames: p.totalFrames ?? 300,
          fps: p.fps ?? 30,
          width: p.width ?? 1920,
          height: p.height ?? 1080,
          props,
        };
      }}
    />
  );
};
