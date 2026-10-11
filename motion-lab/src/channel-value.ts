// 解析JSONの再現用チャンネルを、Remotionのinterpolate()とEasingでフレームごとに評価する。
// 解析器側の同じ計算（shared/channels.ts）との一致はtests/channel-value.test.tsで確認する。
import {Easing, interpolate} from 'remotion';
import type {Channel, ChannelSegment, EasingName} from '../shared/analysis.ts';

export const REMOTION_EASING: Record<EasingName, (t: number) => number> = {
  linear: Easing.linear,
  easeInQuad: Easing.in(Easing.quad),
  easeOutQuad: Easing.out(Easing.quad),
  easeInOutQuad: Easing.inOut(Easing.quad),
  easeInCubic: Easing.in(Easing.cubic),
  easeOutCubic: Easing.out(Easing.cubic),
  easeInOutCubic: Easing.inOut(Easing.cubic),
  easeInSine: Easing.in(Easing.sin),
  easeOutSine: Easing.out(Easing.sin),
  easeInOutSine: Easing.inOut(Easing.sin),
  easeInExpo: Easing.in(Easing.exp),
  easeOutExpo: Easing.out(Easing.exp),
  easeInBack: Easing.in(Easing.back(1.70158)),
  easeOutBack: Easing.out(Easing.back(1.70158)),
};

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

export function segmentValue(s: ChannelSegment, frame: number): number {
  if (s.easing.kind === 'samples') return interpolate(frame, s.easing.frames, s.easing.values, clamp);
  return interpolate(frame, [s.f0, s.f1], [s.v0, s.v1], {...clamp, easing: REMOTION_EASING[s.easing.name]});
}

export function channelValue(c: Channel, frame: number): number {
  let v = c.initial;
  for (const s of c.segments) {
    if (frame < s.f0) return v;
    if (frame <= s.f1) return segmentValue(s, frame);
    v = s.easing.kind === 'samples' ? s.easing.values[s.easing.values.length - 1] : s.v1;
  }
  return v;
}
