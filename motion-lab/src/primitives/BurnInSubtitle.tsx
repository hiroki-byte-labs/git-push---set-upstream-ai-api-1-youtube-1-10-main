// 洗練された枠なし焼き込み字幕コンポーネント（T106/T117方針準拠）
import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';

export interface BurnInSubtitleProps {
  text: string;
  startFrame?: number;
  durationInFrames?: number;
  fontSize?: number;
  color?: string;
  transitions?: boolean;
}

export const BurnInSubtitle: React.FC<BurnInSubtitleProps> = ({
  text,
  startFrame = 0,
  durationInFrames = 60,
  fontSize = 32,
  color = '#ffffff',
  transitions = true,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const local = frame - startFrame;
  // 最短0.5秒cueにも少なくとも2/3の完全表示ホールドを残す。
  const fade = transitions ? Math.min(Math.round(fps * 0.1), Math.floor(durationInFrames / 6)) : 0;
  const opacity = local < 0 || local >= durationInFrames ? 0
    : Math.min(1, (local + 1) / (fade + 1), (durationInFrames - local) / (fade + 1));

  if (opacity <= 0 || !text) return null;

  return (
    <div data-layout-zone="subtitle"
      style={{
        position: 'absolute',
        bottom: 70,
        left: 0,
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        pointerEvents: 'none',
        opacity,
      }}
    >
      <div
        style={{
          color,
          fontSize,
          fontWeight: 500,
          fontFamily: '"Hiragino Sans", "Noto Sans JP", sans-serif',
          textAlign: 'center',
          lineHeight: 1.5,
          whiteSpace: 'pre-line',
          maxWidth: '80%',
          overflowWrap: 'anywhere',
          textShadow: '0 2px 6px rgba(0, 0, 0, 0.65)',
          letterSpacing: '0.04em',
        }}
      >
        {text}
      </div>
    </div>
  );
};
