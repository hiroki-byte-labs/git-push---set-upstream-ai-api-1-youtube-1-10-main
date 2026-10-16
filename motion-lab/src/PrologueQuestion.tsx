import React from 'react';
import {AbsoluteFill, Composition, interpolate, Easing, useCurrentFrame} from 'remotion';

// Easing curves defined in analysis/animation_spec.json
const easeOutCubic = Easing.bezier(0.33, 1.0, 0.68, 1.0);
const easeOutQuad = Easing.bezier(0.25, 1.0, 0.5, 1.0);
const easeInOutCubic = Easing.bezier(0.65, 0.0, 0.35, 1.0);

export const PrologueQuestion: React.FC = () => {
  const frame = useCurrentFrame();

  // L02: Spotlight opacity (frames 0 -> 30)
  const spotlightOpacity = interpolate(frame, [0, 30], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeOutQuad,
  });

  // L03: Headline text opacity (12 -> 32) and translateY (12 -> 40)
  const headlineOpacity = interpolate(frame, [12, 32], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeOutQuad,
  });
  const headlineTranslateY = interpolate(frame, [12, 40], [30, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeOutCubic,
  });

  // L04: Accent line scaleX (35 -> 55) and opacity (35 -> 45)
  const accentScaleX = interpolate(frame, [35, 55], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeInOutCubic,
  });
  const accentOpacity = interpolate(frame, [35, 45], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeOutQuad,
  });

  // L05: Pictogram opacity (30 -> 52) and translateY (30 -> 58)
  const pictogramOpacity = interpolate(frame, [30, 52], [0, 0.95], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeOutQuad,
  });
  const pictogramTranslateY = interpolate(frame, [30, 58], [24, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeOutCubic,
  });

  // L06: Subtitle opacity (50 -> 68)
  const subtitleOpacity = interpolate(frame, [50, 68], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeOutQuad,
  });

  return (
    <AbsoluteFill style={{backgroundColor: '#0a0a0c', overflow: 'hidden'}}>
      {/* L02: Ambient Spotlight Glow */}
      <div
        style={{
          position: 'absolute',
          left: 960 - 550,
          top: 540 - 550,
          width: 1100,
          height: 1100,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255, 255, 255, 0.06) 0%, rgba(10, 10, 12, 0.0) 70%)',
          opacity: spotlightOpacity,
          pointerEvents: 'none',
        }}
      />

      {/* L03: Question Headline */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 440,
          width: 1920,
          textAlign: 'center',
          fontFamily: "'Noto Sans JP', 'Hiragino Kaku Gothic ProN', sans-serif",
          fontWeight: 800,
          fontSize: 54,
          color: '#ffffff',
          letterSpacing: '0.04em',
          lineHeight: 1.4,
          opacity: headlineOpacity,
          transform: `translateY(${headlineTranslateY}px)`,
        }}
      >
        「2位じゃダメなんでしょうか」
      </div>

      {/* L04: Blue Accent Underline */}
      <div
        style={{
          position: 'absolute',
          left: 960 - 320,
          top: 515,
          width: 640,
          height: 4,
          borderRadius: 2,
          backgroundColor: '#3b82f6',
          opacity: accentOpacity,
          transform: `scaleX(${accentScaleX})`,
          transformOrigin: 'center',
        }}
      />

      {/* L05: Central Human Pictogram */}
      <div
        style={{
          position: 'absolute',
          left: 960 - 42,
          top: 576,
          width: 84,
          height: 168,
          opacity: pictogramOpacity,
          transform: `translateY(${pictogramTranslateY}px)`,
        }}
      >
        <svg width="84" height="168" viewBox="0 0 84 168">
          <circle cx="42" cy="22" r="18" fill="#cbd5e1" />
          <path
            d="M 22 52 C 22 45, 27 40, 34 40 L 50 40 C 57 40, 62 45, 62 52 L 62 96 C 62 100, 58 104, 54 104 L 50 104 L 50 158 C 50 163, 46 168, 42 168 C 38 168, 34 163, 34 158 L 34 104 L 30 104 C 26 104, 22 100, 22 96 Z"
            fill="#cbd5e1"
          />
        </svg>
      </div>

      {/* L06: Narrative Subtitle */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 960,
          width: 1920,
          textAlign: 'center',
          fontFamily: "'Noto Sans JP', sans-serif",
          fontWeight: 500,
          fontSize: 24,
          color: '#f1f5f9',
          letterSpacing: '0.02em',
          opacity: subtitleOpacity,
        }}
      >
        かつて日本中を揺るがした、あの言葉。
      </div>
    </AbsoluteFill>
  );
};

export const PrologueQuestionComposition: React.FC = () => {
  return (
    <Composition
      id="PrologueQuestion"
      component={PrologueQuestion}
      durationInFrames={120}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
