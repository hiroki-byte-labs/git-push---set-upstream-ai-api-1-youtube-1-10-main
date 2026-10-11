import React from 'react';
import {AbsoluteFill, Composition, Sequence, staticFile, useCurrentFrame, useVideoConfig, type CalculateMetadataFunction} from 'remotion';
import type {Analysis, ElementAnalysis, Scene} from '../shared/analysis.ts';
import {channelValue} from './channel-value.ts';

// 解析JSONから演出を再現する合成。元動画の画素・音声は使わず、図形はすべてSVGで自前に描く。
// measured: 解析した色・形で描く（参考動画とフレーム比較するため）。
// house: 同じ動き（時刻・位置・大きさ・イージング）を独自の配色・角丸で描く。
// 要素の数と動きは解析JSONで決まるため、要素はループで生成する（Studioでの個別編集は想定しない）。
// 大きさの補間は測定した画素の値をそのまま再現するため、output: 'perceptual-scale' は使わない。

export type ReproductionProps = {
  readonly analysis: Analysis | null;
  readonly theme: 'measured' | 'house';
};

const HOUSE = {backgrounds: ['#0b132b', '#fefae0'], palette: ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#9d4edd', '#f4a261'], corner: 18};

const ElementShape: React.FC<{el: ElementAnalysis; index: number; sceneStart: number; theme: ReproductionProps['theme']}> = ({el, index, sceneStart, theme}) => {
  const frame = useCurrentFrame() + sceneStart;
  const r = el.render;
  if (frame < r.from || frame > r.to) return null;
  const v = (c: keyof typeof r.channels) => channelValue(r.channels[c], frame);
  const cx = v('cx'), cy = v('cy'), w = v('w'), h = v('h'), angle = v('angle'), opacity = Math.min(1, Math.max(0, v('opacity')));
  if (w <= 0 || h <= 0 || opacity <= 0) return null;
  const fill = theme === 'measured' ? r.color : HOUSE.palette[index % HOUSE.palette.length];
  const transform = angle ? `rotate(${angle} ${cx} ${cy})` : undefined;
  if (r.shape === 'ellipse') return <ellipse cx={cx} cy={cy} rx={w / 2} ry={h / 2} fill={fill} opacity={opacity} transform={transform} />;
  const radius = theme === 'measured' ? r.cornerRadius : Math.min(HOUSE.corner, w / 2, h / 2);
  return <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={radius} ry={radius} fill={fill} opacity={opacity} transform={transform} />;
};

const SceneView: React.FC<{scene: Scene; elements: ElementAnalysis[]; theme: ReproductionProps['theme']}> = ({scene, elements, theme}) => {
  const {width, height} = useVideoConfig();
  const background = theme === 'measured' ? scene.background.color ?? '#000000' : HOUSE.backgrounds[scene.index % HOUSE.backgrounds.length];
  return (
    <AbsoluteFill style={{backgroundColor: background}}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{position: 'absolute', inset: 0}}>
        {elements.map((el, i) => (
          <ElementShape key={el.id} el={el} index={i + scene.index * 3} sceneStart={scene.startFrame} theme={theme} />
        ))}
      </svg>
    </AbsoluteFill>
  );
};

export const Reproduction: React.FC<ReproductionProps> = ({analysis, theme}) => {
  const {fps} = useVideoConfig();
  if (!analysis) {
    return (
      <AbsoluteFill style={{backgroundColor: '#111', color: '#eee', justifyContent: 'center', alignItems: 'center', fontSize: 40, fontFamily: 'sans-serif'}}>
        解析JSONがありません（npm run lab で作成）
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill>
      {analysis.scenes.map(scene => (
        <Sequence key={scene.index} name={`Scene ${scene.index}`} from={scene.startFrame} durationInFrames={scene.endFrame - scene.startFrame + 1} premountFor={fps}>
          <SceneView scene={scene} elements={analysis.elements.filter(e => e.scene === scene.index)} theme={theme} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

// propsで解析JSONが渡されなければ public/latest-analysis.json（lab実行時に複製）を読む。尺・大きさ・fpsは解析した動画に合わせる。
const calculateMetadata: CalculateMetadataFunction<ReproductionProps> = async ({props, abortSignal}) => {
  let analysis = props.analysis;
  if (!analysis) {
    const res = await fetch(staticFile('latest-analysis.json'), {signal: abortSignal}).catch(() => null);
    if (res?.ok) analysis = (await res.json()) as Analysis;
  }
  if (!analysis) return {props};
  return {durationInFrames: analysis.video.frameCount, fps: analysis.video.fps, width: analysis.video.width, height: analysis.video.height, props: {...props, analysis}};
};

export const ReproductionComposition: React.FC = () => {
  return (
    <Composition
      id="Reproduction"
      component={Reproduction}
      durationInFrames={300}
      fps={30}
      width={1280}
      height={720}
      defaultProps={{analysis: null, theme: 'measured'}}
      calculateMetadata={calculateMetadata}
    />
  );
};
