// 暗黒空間（The Void）背景コンポーネント
import React from 'react';

export interface VoidBackgroundProps {
  baseColor?: string;
  glowColor?: string;
  glowIntensity?: number;
}

export const VoidBackground: React.FC<VoidBackgroundProps> = ({
  baseColor = '#0a0a0c',
  glowColor = '#1e293b',
  glowIntensity = 0.25,
}) => {
  return (
    <div
      style={{
        position: 'absolute',
        width: '100%',
        height: '100%',
        backgroundColor: baseColor,
        backgroundImage: `radial-gradient(circle at 50% 40%, rgba(30, 41, 59, ${glowIntensity}) 0%, transparent 70%)`,
        overflow: 'hidden',
      }}
    />
  );
};
