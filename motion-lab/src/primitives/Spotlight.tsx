// 動的スポットライトコンポーネント
import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';

export interface SpotlightProps {
  x?: number;        // 中心X (px)
  y?: number;        // 中心Y (px)
  radius?: number;   // 半径 (px)
  color?: string;    // 光の色
  startFrame?: number;
  durationInFrames?: number;
}

export const Spotlight: React.FC<SpotlightProps> = ({
  x = 960,
  y = 540,
  radius = 450,
  color = 'rgba(59, 130, 246, 0.18)',
  startFrame = 0,
  durationInFrames = 30,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [startFrame, startFrame + durationInFrames],
    [0, 1],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
  );

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        opacity,
        background: `radial-gradient(circle ${radius}px at ${x}px ${y}px, ${color} 0%, transparent 100%)`,
      }}
    />
  );
};
