// 共通SVGピクトグラムコンポーネント（T117事前準備）
import React from 'react';

export interface IconProps {
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const PersonIcon: React.FC<IconProps> = ({size = 48, color = '#ffffff', style}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={style}>
    <circle cx="12" cy="5" r="3" />
    <path d="M12 9c-3.5 0-6 1.8-6 4v7a1.5 1.5 0 0 0 3 0v-5h1v5a1.5 1.5 0 0 0 3 0v-5h1v5a1.5 1.5 0 0 0 3 0v-7c0-2.2-2.5-4-6-4z" />
  </svg>
);

export const CrownIcon: React.FC<IconProps> = ({size = 48, color = '#f59e0b', style}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={style}>
    <path d="M3 18h18v2H3v-2zm1.5-12 4 6 3.5-7 3.5 7 4-6 1.5 10H3L4.5 6z" />
    <circle cx="4.5" cy="5" r="1.5" />
    <circle cx="12" cy="4" r="1.5" />
    <circle cx="19.5" cy="5" r="1.5" />
  </svg>
);

export const ScaleIcon: React.FC<IconProps> = ({size = 48, color = '#ffffff', style}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={style}>
    <rect x="11" y="4" width="2" height="15" rx="1" />
    <rect x="7" y="19" width="10" height="2" rx="1" />
    <circle cx="12" cy="4" r="1.5" />
    <path d="M4 7h16v1.5H4z" />
    <path d="M2 13l3-5 3 5c0 1.5-1.3 2.5-3 2.5s-3-1-3-2.5z" />
    <path d="M16 13l3-5 3 5c0 1.5-1.3 2.5-3 2.5s-3-1-3-2.5z" />
  </svg>
);

export const CoinStackIcon: React.FC<IconProps> = ({size = 48, color = '#f59e0b', style}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={style}>
    <ellipse cx="12" cy="6" rx="8" ry="2.5" />
    <path d="M4 6v4c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5V6c0 1.4-3.6 2.5-8 2.5S4 7.4 4 6z" />
    <path d="M4 11v4c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-4c0 1.4-3.6 2.5-8 2.5S4 12.4 4 11z" />
    <path d="M4 16v3c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-3c0 1.4-3.6 2.5-8 2.5S4 17.4 4 16z" />
  </svg>
);

export const ArrowTrendIcon: React.FC<IconProps> = ({size = 48, color = '#3b82f6', style}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={style}>
    <path d="M16 6h5v5l-2.5-2.5-5.5 5.5-4-4L2 17l1.5 1.5 5.5-5.5 4 4 7-7L16 6z" />
  </svg>
);
