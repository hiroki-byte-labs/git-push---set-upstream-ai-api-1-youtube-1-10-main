// 再現用チャンネルの値をフレームfで求める（解析器側の計算用）。Remotion側はsrc/channel-value.tsでinterpolate/Easingを使い同じ結果を出す。
import type {Channel, ChannelSegment} from './analysis.ts';
import {EASINGS} from './easing.ts';

export function segmentValue(s: ChannelSegment, f: number): number {
  if (s.easing.kind === 'samples') {
    const {frames, values} = s.easing;
    if (f <= frames[0]) return values[0];
    for (let i = 1; i < frames.length; i++) if (f <= frames[i]) return values[i - 1] + ((values[i] - values[i - 1]) * (f - frames[i - 1])) / (frames[i] - frames[i - 1]);
    return values[values.length - 1];
  }
  const p = Math.min(1, Math.max(0, (f - s.f0) / (s.f1 - s.f0)));
  return s.v0 + (s.v1 - s.v0) * EASINGS[s.easing.name](p);
}

export function channelValue(c: Channel, f: number): number {
  let v = c.initial;
  for (const s of c.segments) {
    if (f < s.f0) return v;
    if (f <= s.f1) return segmentValue(s, f);
    v = s.easing.kind === 'samples' ? s.easing.values[s.easing.values.length - 1] : s.v1;
  }
  return v;
}
