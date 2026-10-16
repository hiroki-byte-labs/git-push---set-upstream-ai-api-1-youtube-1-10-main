// cubic-bezierで滑らかに順次伸長する比較・棒グラフコンポーネント
import React from 'react';
import {interpolate, Easing, useCurrentFrame} from 'remotion';

export interface BarItem {
  label: string;
  value: number;        // 0.0 〜 1.0 (最大値に対する比率)
  displayValue?: string; // 表示数値 (例: "2億1000万円")
  color?: string;
}

export interface ProgressiveBarProps {
  bars: BarItem[];
  startFrame?: number;
  staggerFrames?: number; // 各棒の開始間隔
  durationPerBar?: number;
  width?: number;
  height?: number;
}

export const ProgressiveBar: React.FC<ProgressiveBarProps> = ({
  bars,
  startFrame = 0,
  staggerFrames = 10,
  durationPerBar = 25,
  width = 600,
  height = 40,
}) => {
  const frame = useCurrentFrame();
  const easeOutQuart = Easing.bezier(0.16, 1, 0.3, 1);

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 24, width}}>
      {bars.map((bar, i) => {
        const barStart = startFrame + i * staggerFrames;
        const progress = interpolate(
          frame,
          [barStart, barStart + durationPerBar],
          [0, 1],
          {easing: easeOutQuart, extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
        );
        const barWidth = Math.max(8, width * bar.value * progress);
        const barColor = bar.color ?? (i === 0 ? '#3b82f6' : '#64748b');

        return (
          <div key={bar.label} style={{display: 'flex', flexDirection: 'column', gap: 6}}>
            <div style={{display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: 18, fontFamily: 'sans-serif'}}>
              <span>{bar.label}</span>
              {bar.displayValue && (
                <span style={{color: '#f8fafc', fontWeight: 600, opacity: progress}}>
                  {bar.displayValue}
                </span>
              )}
            </div>
            <div style={{width, height, background: 'rgba(255, 255, 255, 0.05)', borderRadius: 6, overflow: 'hidden'}}>
              <div
                style={{
                  width: barWidth,
                  height: '100%',
                  background: `linear-gradient(90deg, ${barColor} 0%, ${barColor}ee 100%)`,
                  borderRadius: 6,
                  boxShadow: i === 0 ? '0 0 20px rgba(59, 130, 246, 0.4)' : 'none',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
