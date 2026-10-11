// 時系列（観測フレームと値）から動いている区間を見つけ、イージング候補を当てはめる。
import type {EasingName, EasingResult} from '../../shared/analysis.ts';
import {EASINGS, EASING_NAMES} from '../../shared/easing.ts';

export type Series = {frames: number[]; values: number[]};
/** 標本番号（Series内の添字）での区間。ia: 前の標本から有意に動いた最初の標本、ib: 最後の標本。 */
export type Run = {ia: number; ib: number};

export type Candidate = {name: EasingName; t0: number; t1: number; v0: number; v1: number; rmse: number; nrmse: number};
export type SegmentFit = {
  run: Run;
  /** 前後の静止区間で値が確認できたか（確認できない側の値は当てはめの未知数）。 */
  v0Observed: boolean;
  v1Observed: boolean;
  candidates: Candidate[];
  t0Range: [number, number];
  t1Range: [number, number];
  samples: number;
};

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/**
 * 連続フレーム間の差から雑音（1フレーム差の標準偏差相当）を推定する。
 * 中央値だと半分以上のフレームで動く要素では動き自体を雑音とみなすため、下側20%点（半正規分布で0.253σ）を使い、capで頭打ちにする。
 */
export function deltaNoise(s: Series, cap = Infinity): number {
  const ds: number[] = [];
  for (let i = 1; i < s.values.length; i++) if (s.frames[i] - s.frames[i - 1] === 1) ds.push(Math.abs(s.values[i] - s.values[i - 1]));
  if (!ds.length) return 0;
  ds.sort((a, b) => a - b);
  return Math.min(cap, ds[Math.floor(ds.length * 0.2)] / 0.253);
}

/** しきい値thrを超えて動いた標本の連なりを区間にする。gap以下の切れ目は結合し、総変化がminTotal未満の区間は捨てる。 */
export function detectRuns(s: Series, thr: number, minTotal: number, gap = 2): Run[] {
  const runs: Run[] = [];
  for (let i = 1; i < s.values.length; i++) {
    if (Math.abs(s.values[i] - s.values[i - 1]) <= thr) continue;
    const last = runs.at(-1);
    if (last && i - last.ib <= gap + 1) last.ib = i;
    else runs.push({ia: i, ib: i});
  }
  return runs.filter(r => {
    let lo = Infinity, hi = -Infinity;
    for (let i = r.ia - 1; i <= r.ib; i++) { lo = Math.min(lo, s.values[i]); hi = Math.max(hi, s.values[i]); }
    return hi - lo >= minTotal;
  });
}

/** 物理的にとりうる値の範囲（大きさは0以上、不透明度は0〜1）。観測できない端点を解くときだけ使う。 */
export type Bounds = {lo?: number; hi?: number};
/** あるフレームでのモデル値の上限・下限（図形が見えていなかったフレームの条件）。 */
export type Constraint = {frame: number; max?: number; min?: number};

/** 値 v(f) = v0 + (v1 - v0)·E((f - t0)/(t1 - t0))（0〜1でクランプ）を候補ごとに当てはめる。 */
export function fitSegment(s: Series, run: Run, prevEnd: number, nextStart: number, pad = 8, bounds: Bounds = {}, constraints: Constraint[] = []): SegmentFit {
  const iw0 = Math.max(prevEnd + 1, run.ia - 1 - pad), iw1 = Math.min(nextStart - 1, run.ib + pad);
  const fr = s.frames.slice(iw0, iw1 + 1), vs = s.values.slice(iw0, iw1 + 1);
  const ia = run.ia - iw0, ib = run.ib - iw0;
  // 静止区間は2標本以上で確認できた場合だけ既知とする（最初の観測が動作中なら開始値は観測できない）。
  const v0Observed = ia - 1 >= 1, v1Observed = fr.length - 1 - ib >= 2;
  const v0Known = v0Observed ? median(vs.slice(0, ia)) : NaN;
  const v1Known = v1Observed ? median(vs.slice(ib + 1)) : NaN;
  const t0Lo = v0Observed ? fr[0] - 0.999 : fr[ia - 1] - 20, t0Hi = v0Observed ? fr[ia] : fr[ia - 1];
  const t1Lo = v1Observed ? fr[ib] - 1 : fr[ib], t1Hi = v1Observed ? fr[fr.length - 1] + 0.999 : fr[ib] + 20;

  const evalFit = (E: (t: number) => number, t0: number, t1: number) => {
    const e = fr.map(f => E(Math.min(1, Math.max(0, (f - t0) / (t1 - t0)))));
    let v0 = v0Known, v1 = v1Known;
    if (!v0Observed || !v1Observed) {
      // 未知の端点を最小二乗で解く（v = v0(1-e) + v1·e）。
      let a = 0, b = 0, c = 0, p = 0, q = 0;
      for (let i = 0; i < e.length; i++) { const u = 1 - e[i]; a += u * u; b += u * e[i]; c += e[i] * e[i]; p += u * vs[i]; q += e[i] * vs[i]; }
      const clamp = (v: number) => Math.min(bounds.hi ?? Infinity, Math.max(bounds.lo ?? -Infinity, v));
      if (!v0Observed && !v1Observed) {
        const det = a * c - b * b;
        if (Math.abs(det) < 1e-9) return null;
        v0 = (p * c - q * b) / det; v1 = (a * q - b * p) / det;
        // 範囲外なら端点を境界に固定し、もう一方を解き直す（凸な二次形式で制約が1つ効く場合の解）。
        if (clamp(v0) !== v0 && c > 1e-9) { v0 = clamp(v0); v1 = clamp((q - b * v0) / c); }
        else if (clamp(v1) !== v1 && a > 1e-9) { v1 = clamp(v1); v0 = clamp((p - b * v1) / a); }
      }
      else if (!v0Observed) { if (a < 1e-9) return null; v0 = clamp((p - b * v1) / a); }
      else { if (c < 1e-9) return null; v1 = clamp((q - b * v0) / c); }
    }
    for (const k of constraints) {
      const m = v0 + (v1 - v0) * E(Math.min(1, Math.max(0, (k.frame - t0) / (t1 - t0))));
      if ((k.max !== undefined && m > k.max) || (k.min !== undefined && m < k.min)) return null;
    }
    let sq = 0;
    for (let i = 0; i < e.length; i++) sq += (v0 + (v1 - v0) * e[i] - vs[i]) ** 2;
    const rmse = Math.sqrt(sq / e.length);
    return {v0, v1, rmse, nrmse: rmse / Math.max(1e-9, Math.abs(v1 - v0))};
  };

  const candidates: Candidate[] = [];
  let t0Range: [number, number] = [t0Lo, t0Hi], t1Range: [number, number] = [t1Lo, t1Hi];
  for (const name of EASING_NAMES) {
    const E = EASINGS[name];
    const state: {best: Candidate | null} = {best: null};
    const grid: {t0: number; t1: number; rmse: number}[] = [];
    const search = (a0: number, a1: number, b0: number, b1: number, step: number, keep: boolean) => {
      for (let t0 = a0; t0 <= a1 + 1e-9; t0 += step) for (let t1 = b0; t1 <= b1 + 1e-9; t1 += step) {
        if (t1 - t0 < 0.5) continue;
        const r = evalFit(E, t0, t1);
        if (!r) continue;
        if (keep) grid.push({t0, t1, rmse: r.rmse});
        if (!state.best || r.rmse < state.best.rmse) state.best = {name, t0, t1, ...r};
      }
    };
    search(t0Lo, t0Hi, t1Lo, t1Hi, 0.1, true);
    if (!state.best) continue;
    const b0: Candidate = state.best;
    search(b0.t0 - 0.1, b0.t0 + 0.1, b0.t1 - 0.1, b0.t1 + 0.1, 0.01, false);
    const bb: Candidate = state.best;
    candidates.push(bb);
    if (bb.rmse <= Math.min(...candidates.map(c => c.rmse))) {
      // 最良候補の誤差の1.15倍以内に入る開始・終了時刻の幅を不確かさとする。
      const lim = bb.rmse * 1.15 + 1e-6, ok = grid.filter(g => g.rmse <= lim);
      if (!ok.length) ok.push({t0: bb.t0, t1: bb.t1, rmse: bb.rmse});
      t0Range = [Math.min(...ok.map(g => g.t0)), Math.max(...ok.map(g => g.t0))];
      t1Range = [Math.min(...ok.map(g => g.t1)), Math.max(...ok.map(g => g.t1))];
    }
  }
  candidates.sort((a, b) => a.rmse - b.rmse);
  return {run, v0Observed, v1Observed, candidates, t0Range, t1Range, samples: fr.length};
}

/**
 * 候補の誤差からイージングを判定する。sigmaは観測雑音（値の標準偏差）。
 * - 最良でも雑音より明らかに大きく外れる → unknown（断定しない。再現は測定値の折れ線にする）
 * - 2位との差が雑音に対して有意でない → ambiguous（最良と並ぶ候補を併記）
 */
export function classifyEasing(candidates: {name: EasingName; rmse: number; nrmse: number}[], sigma: number, samples: number, minSamples = 5): EasingResult {
  const list = candidates.map(c => ({name: c.name, nrmse: round(c.nrmse, 5)}));
  if (!candidates.length) return {status: 'unknown', best: null, nrmse: null, candidates: list, reason: '当てはめできる候補がない'};
  const [b, second] = candidates;
  const noise = Math.max(sigma, 1e-6);
  if (samples < minSamples) return {status: 'unknown', best: null, nrmse: round(b.nrmse, 5), candidates: list.slice(0, 5), reason: `標本が${samples}個で少なく、形を区別できない`};
  if (b.rmse > 4 * noise && b.nrmse > 0.015) return {status: 'unknown', best: null, nrmse: round(b.nrmse, 5), candidates: list.slice(0, 5), reason: `最良候補（${b.name}）でも誤差が雑音の${(b.rmse / noise).toFixed(1)}倍で、候補の関数に当てはまらない`};
  // 2位との差の有意性: Δχ² = N·(rmse2² − rmse1²)/σ²。9（3σ相当）未満は区別できないとみなす。
  const tied = candidates.filter(c => (samples * (c.rmse ** 2 - b.rmse ** 2)) / noise ** 2 < 9);
  if (second && tied.length > 1) return {status: 'ambiguous', best: b.name, nrmse: round(b.nrmse, 5), candidates: list.slice(0, Math.max(3, tied.length)), reason: `${tied.map(c => c.name).join('、')} の差が雑音に対して有意でない`};
  return {status: 'estimated', best: b.name, nrmse: round(b.nrmse, 5), candidates: list.slice(0, 3)};
}

export const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
