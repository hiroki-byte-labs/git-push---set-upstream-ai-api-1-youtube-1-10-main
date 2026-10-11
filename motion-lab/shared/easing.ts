// イージング候補の数式。RemotionのEasing（in/out/inOut、quad、cubic、sin、exp、back）と同じ定義にする。
// 一致はtests/easing.test.tsでRemotion本体と照合する。
import type {EasingName} from './analysis.ts';

type Fn = (t: number) => number;
const quad: Fn = t => t * t;
const cubic: Fn = t => t * t * t;
const sin: Fn = t => 1 - Math.cos((t * Math.PI) / 2);
const exp: Fn = t => Math.pow(2, 10 * (t - 1));
const back = (s = 1.70158): Fn => t => t * t * ((s + 1) * t - s);
const out = (f: Fn): Fn => t => 1 - f(1 - t);
const inOut = (f: Fn): Fn => t => (t < 0.5 ? f(t * 2) / 2 : 1 - f((1 - t) * 2) / 2);

export const EASINGS: Record<EasingName, Fn> = {
  linear: t => t,
  easeInQuad: quad,
  easeOutQuad: out(quad),
  easeInOutQuad: inOut(quad),
  easeInCubic: cubic,
  easeOutCubic: out(cubic),
  easeInOutCubic: inOut(cubic),
  easeInSine: sin,
  easeOutSine: out(sin),
  easeInOutSine: inOut(sin),
  easeInExpo: exp,
  easeOutExpo: out(exp),
  easeInBack: back(),
  easeOutBack: out(back()),
};

export const EASING_NAMES = Object.keys(EASINGS) as EasingName[];
