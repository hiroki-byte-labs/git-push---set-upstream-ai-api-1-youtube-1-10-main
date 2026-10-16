// 人型シルエットの配列と単一フォーカス（勝者/注目対象）ハイライト
import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {PersonIcon} from './icons';

export interface SilhouetteGroupProps {
  count?: number;             // 人型の総数
  highlightIndex?: number;    // ハイライトするインデックス（0始まり）
  highlightColor?: string;
  dimColor?: string;
  size?: number;
  gap?: number;
  startFrame?: number;
  durationInFrames?: number;
}

export const SilhouetteGroup: React.FC<SilhouetteGroupProps> = ({
  count = 5,
  highlightIndex = 0,
  highlightColor = '#3b82f6',
  dimColor = '#334155',
  size = 56,
  gap = 20,
  startFrame = 0,
  durationInFrames = 20,
}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(
    frame,
    [startFrame, startFrame + durationInFrames],
    [0, 1],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
  );

  return (
    <div style={{display: 'flex', alignItems: 'center', gap, opacity: progress}}>
      {Array.from({length: count}, (_, i) => {
        const isHighlight = i === highlightIndex;
        const color = isHighlight ? highlightColor : dimColor;
        const scale = isHighlight ? 1.15 : 1.0;

        return (
          <div
            key={i}
            style={{
              transform: `scale(${scale})`,
              transition: 'transform 0.3s ease',
              filter: isHighlight ? `drop-shadow(0 0 16px ${highlightColor}88)` : 'none',
            }}
          >
            <PersonIcon size={size} color={color} />
          </div>
        );
      })}
    </div>
  );
};
