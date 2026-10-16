import React, {useId} from 'react';
import type {DiagramIllustration} from '../../../src/plan.ts';
import {illustrationFrame, PERSON_CONTOURS, contourToSvg} from '../../shared/illustration.ts';

export interface SuperstarIllustrationProps {
  motif: DiagramIllustration;
  frame: number;
  fps: number;
  seconds: number;
  reveal: number[];
  transitions?: boolean;
}

/** Same anatomical contours, staggered reveals and continuous clocks as native. */
export const SuperstarIllustration: React.FC<SuperstarIllustrationProps> = ({motif, frame, fps, seconds, reveal, transitions=true}) => {
  const state=illustrationFrame(motif,frame/fps,reveal,seconds,transitions);
  const glowId=useId().replaceAll(':','');
  return (
    <svg width="1000" height="240" viewBox="0 0 1000 240" role="img" aria-label="人物と注目の関係を説明するイラスト" style={{maxWidth:'100%',opacity:state.opacity}}>
      <defs>
        <radialGradient id={glowId}>
          <stop offset="0" stopColor="#3b82f6" stopOpacity="1" />
          <stop offset="1" stopColor="#3b82f6" stopOpacity="0" />
        </radialGradient>
      </defs>
      {state.halos.map((h,i)=><ellipse key={`h${i}`} cx={h.x} cy={h.y} rx={h.rx} ry={h.ry} fill={`url(#${glowId})`} opacity={h.opacity} />)}
      {state.lines.map((l,i)=><line key={`l${i}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#3b82f6" strokeWidth={l.width} strokeLinecap="round" opacity={l.opacity} />)}
      {state.figures.map((p,i)=>(
        <g key={`p${i}`} transform={`translate(${p.x} ${p.y-p.height}) scale(${p.height/100})`} fill={p.accent?'#3b82f6':'#94a3b8'} opacity={p.opacity}>
          {PERSON_CONTOURS.map((contour,j)=><path key={j} d={contourToSvg(contour)} />)}
        </g>
      ))}
      {state.labels.map((l,i)=>(
        <text
          key={`t${i}`}
          x={l.x}
          y={l.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#ffffff"
          stroke="#0f172a"
          strokeWidth="4"
          paintOrder="stroke fill"
          opacity={l.opacity}
          fontSize="24"
          fontFamily="sans-serif"
          fontWeight={l.accent ? 'bold' : 'normal'}
        >
          {l.text}
        </text>
      ))}
    </svg>
  );
};

export const SceneIllustration = SuperstarIllustration;
export type SceneIllustrationProps = SuperstarIllustrationProps;
