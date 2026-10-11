// フレーム間の対応付け（追跡）と、図形ごとの解析（形・色・配置・動き・再現用データ）。
import type {Animation, Channel, ChannelName, ChannelSegment, EasingName, EasingResult, ElementAnalysis, RenderShape, Status, TimePoint} from '../../shared/analysis.ts';
import {channelValue} from '../../shared/channels.ts';
import {classifyEasing, deltaNoise, detectRuns, fitSegment, round, type Candidate, type Constraint, type Series, type SegmentFit} from './fit.ts';
import {hex, principal, type Background, type Observation} from './vision.ts';

export type Track = {id: number; obs: Observation[]};
const CHANNELS: ChannelName[] = ['cx', 'cy', 'w', 'h', 'angle', 'opacity'];

/** 色の方向（背景→図形色）と予測位置の近さで、前フレームの成分と貪欲に対応付ける。 */
export function trackScene(byFrame: Map<number, Observation[]>, start: number, end: number, bg: Background, w: number, h: number) {
  const diag = Math.hypot(w, h), tracks: Track[] = [];
  const dir = (o: Observation) => { const v = o.color.map((c, i) => c - bg.color[i]); const n = Math.hypot(...v) || 1; return v.map(x => x / n); };
  for (let f = start; f <= end; f++) {
    const cur = byFrame.get(f) ?? [], active = tracks.filter(t => f - t.obs.at(-1)!.frame <= 3);
    const pairs: {t: Track; o: Observation; cost: number}[] = [];
    for (const t of active) {
      const last = t.obs.at(-1)!, prev = t.obs.at(-2), gap = f - last.frame;
      const px = last.cx + (prev ? ((last.cx - prev.cx) / (last.frame - prev.frame)) * gap : 0), py = last.cy + (prev ? ((last.cy - prev.cy) / (last.frame - prev.frame)) * gap : 0);
      const dl = dir(last);
      for (const o of cur) {
        const cos = dir(o).reduce((s, v, i) => s + v * dl[i], 0), dd = Math.hypot(o.cx - px, o.cy - py);
        if (cos < 0.95 || dd > 0.35 * diag) continue;
        pairs.push({t, o, cost: dd / diag + (1 - cos) * 20});
      }
    }
    pairs.sort((a, b) => a.cost - b.cost);
    const usedT = new Set<Track>(), usedO = new Set<Observation>();
    for (const p of pairs) if (!usedT.has(p.t) && !usedO.has(p.o)) { p.t.obs.push(p.o); usedT.add(p.t); usedO.add(p.o); }
    for (const o of cur) if (!usedO.has(o)) tracks.push({id: tracks.length, obs: [o]});
  }
  const kept = tracks.filter(t => t.obs.length >= 3);
  return {tracks: kept, dropped: tracks.length - kept.length};
}

type Ctx = {scene: number; startFrame: number; endFrame: number; bg: Background; width: number; height: number; fps: number; maskThreshold: number; minArea: number};
type ChannelFit = {channel: ChannelName; fit: SegmentFit; easing: EasingResult; sigma: number; series: Series};

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const BASE: Record<ChannelName, {thr: number; total: number; sigma: number; cap: number}> = {
  cx: {thr: 0.05, total: 0.75, sigma: 0.02, cap: 0.3}, cy: {thr: 0.05, total: 0.75, sigma: 0.02, cap: 0.3}, w: {thr: 0.05, total: 0.75, sigma: 0.02, cap: 0.3}, h: {thr: 0.05, total: 0.75, sigma: 0.02, cap: 0.3},
  angle: {thr: 0.1, total: 1, sigma: 0.05, cap: 0.5}, opacity: {thr: 0.003, total: 0.04, sigma: 0.002, cap: 0.01},
};
const BOUNDS: Record<ChannelName, {lo?: number; hi?: number}> = {cx: {}, cy: {}, w: {lo: 0}, h: {lo: 0}, angle: {}, opacity: {lo: 0, hi: 1}};
/** 鋭い角でも被覆率0.5に達するまでの対角線上の距離（アンチエイリアスによる）。合成動画の鋭い角での実測（約0.3〜0.4px）に基づく。 */
const CORNER_BASELINE = 0.35;
const DIRS = ['右', '右下', '下', '左下', '左', '左上', '上', '右上'];

export function analyzeElement(track: Track, id: string, ctx: Ctx): ElementAnalysis | null {
  const obs = track.obs, notes: string[] = [];
  const fullW = (o: Observation) => !o.clip.left && !o.clip.right, fullH = (o: Observation) => !o.clip.top && !o.clip.bottom;
  const unclipped = obs.filter(o => fullW(o) && fullH(o));
  const maxPixels = Math.max(...obs.map(o => o.pixels));

  // 色と不透明度: 十分大きい観測のうち背景から最も遠い色を不透明度1とみなす（前提として記録）。
  const big = obs.filter(o => o.pixels >= Math.max(150, 0.3 * maxPixels));
  const ref = (big.length ? big : obs).reduce((a, o) => (o.strength > a.strength ? o : a));
  const colorStatus: Status = ref.colorSpread > 12 ? 'estimated' : 'measured';
  if (ref.colorSpread > 12) notes.push(`図形内の色のばらつきが大きい（RMS ${ref.colorSpread.toFixed(1)}）。単色ではない可能性があり、色は平均値`);

  // 向きと回転: 細長い図形だけ2次モーメントで主軸角を測る。等方的な図形（正方形・円）の回転は測れない。
  const oriented = obs.filter(o => o.pixels >= 200 && fullW(o) && fullH(o)).map(o => ({o, p: principal(o)})).filter(x => Math.sqrt(x.p.l1 / Math.max(1e-9, x.p.l2)) > 1.4);
  let offset = 0, rotating = false;
  const angleOf = new Map<Observation, number>();
  if (oriented.length >= obs.length * 0.5) {
    let prev = oriented[0].p.angleDeg;
    offset = Math.abs(prev) > 45 ? Math.sign(prev) * 90 : 0;
    for (const {o, p} of oriented) {
      let a = p.angleDeg;
      while (a - prev > 90) a -= 180;
      while (a - prev < -90) a += 180;
      angleOf.set(o, a - offset);
      prev = a;
    }
    const as = [...angleOf.values()];
    // 回転なら主軸の長さ（固有値）は変わらない。大きさの変化で縦横が入れ替わった場合を回転と誤認しないよう確認する（T110の比較で発見）。
    const ratio = (xs: number[]) => Math.max(...xs) / Math.max(1e-9, Math.min(...xs));
    const stable = ratio(oriented.map(x => x.p.l1)) < 1.15 && ratio(oriented.map(x => x.p.l2)) < 1.15;
    rotating = Math.max(...as) - Math.min(...as) > 3 && stable;
    if (Math.max(...as) - Math.min(...as) > 3 && !stable) { notes.push('主軸の向きが変わったが主軸の長さも変化しているため、回転ではなく大きさの変化として扱った（回転と拡大縮小の同時発生は解析できない）'); angleOf.clear(); offset = 0; }
  }

  // 形: 回転していない・見切れていない最大の観測で、外接矩形に対する面積の比を見る。
  // 回転中の要素は角度が最も0に近い観測を選ぶ（わずかな傾きでも外接矩形が広がり、角丸と誤判定するため）。
  const tilt = (o: Observation) => (rotating ? Math.abs(angleOf.get(o) ?? 99) : 0);
  const shapeCands = unclipped.filter(o => o.area >= 0.5 * Math.max(...unclipped.map(u => u.area)) && tilt(o) < 1);
  let shape: ElementAnalysis['shape'] = {value: null, status: 'unknown', fillRatio: null, cornerRadius: null, reason: '見切れや回転のない観測がない'};
  let renderShape: RenderShape = 'rect', corner = 0;
  if (shapeCands.length) {
    const minTilt = Math.min(...shapeCands.map(tilt)), flat = shapeCands.filter(o => tilt(o) <= minTilt + 0.05);
    const s = flat.reduce((a, o) => (o.area > a.area ? o : a)), bw = s.right - s.left, bh = s.bottom - s.top, fill = s.area / (bw * bh);
    // 角丸半径は角の深さから直接推定する（面積比だけでは半径の小さい角丸を矩形と判定してしまう。T110の比較で発見）。
    const depths = flat.map(o => o.cornerDepth).sort((p, q) => p - q), rCorner = (Math.SQRT2 + 1) * Math.max(0, depths[Math.floor(depths.length / 2)] - CORNER_BASELINE);
    if (fill > 0.83 && fill < 0.995 && rCorner >= 3 && rCorner < 0.45 * Math.min(bw, bh)) { corner = rCorner; shape = {value: 'rounded-rectangle', status: 'estimated', fillRatio: round(fill, 4), cornerRadius: round(corner, 1)}; renderShape = 'roundrect'; }
    else if (fill >= 0.965) shape = {value: 'rectangle', status: 'estimated', fillRatio: round(fill, 4), cornerRadius: 0};
    else if (fill >= 0.74 && fill <= 0.83) { shape = {value: Math.abs(bw - bh) < 0.02 * Math.max(bw, bh) ? 'circle' : 'ellipse', status: 'estimated', fillRatio: round(fill, 4), cornerRadius: null}; renderShape = 'ellipse'; }
    else if (fill > 0.83) { corner = Math.sqrt((bw * bh - s.area) / (4 - Math.PI)); shape = {value: 'rounded-rectangle', status: 'estimated', fillRatio: round(fill, 4), cornerRadius: round(corner, 1)}; renderShape = 'roundrect'; }
    else shape = {value: null, status: 'unknown', fillRatio: round(fill, 4), cornerRadius: null, reason: `外接矩形に対する面積比${fill.toFixed(3)}が既知の形（矩形・角丸・円）に当てはまらない`};
  }
  if (!shape.value) notes.push('形が不明のため再現では矩形として描く（仮）');

  // 幾何の時系列。見切れは反対側の縁と、近い時刻の見切れていない観測の大きさから復元する（大きさ一定の前提）。
  const nearestSize = (o: Observation, axis: 'w' | 'h') => {
    const pool = obs.filter(u => (axis === 'w' ? fullW(u) : fullH(u)));
    if (!pool.length) return NaN;
    const u = pool.reduce((a, b) => (Math.abs(b.frame - o.frame) < Math.abs(a.frame - o.frame) ? b : a));
    return axis === 'w' ? u.right - u.left : u.bottom - u.top;
  };
  const series = Object.fromEntries(CHANNELS.map(c => [c, {frames: [], values: []}])) as unknown as Record<ChannelName, Series>;
  const push = (c: ChannelName, f: number, v: number) => { if (Number.isFinite(v)) { series[c].frames.push(f); series[c].values.push(v); } };
  let clipped = 0, reconstructed = 0;
  let faint = 0;
  for (const o of obs) {
    if (!fullW(o) || !fullH(o)) clipped++;
    // 背景との差がしきい値の3倍未満の観測は、縁が雑音で欠けやすいため位置・大きさに使わない（不透明度だけ使う。T110の比較で発見）。
    const geometryOk = o.strength >= 3 * ctx.maskThreshold;
    if (!geometryOk) faint++;
    else if (rotating) {
      if (!angleOf.has(o)) continue;
      const p = principal(o), k = renderShape === 'ellipse' ? (l: number) => 4 * Math.sqrt(l) : (l: number) => Math.sqrt(12 * l);
      const [long, short] = [k(p.l1), k(p.l2)];
      push('cx', o.frame, o.cx); push('cy', o.frame, o.cy);
      push('w', o.frame, offset ? short : long); push('h', o.frame, offset ? long : short);
      push('angle', o.frame, angleOf.get(o)!);
    } else {
      let cx = renderShape === 'ellipse' ? o.cx : (o.left + o.right) / 2, w = renderShape === 'ellipse' ? 4 * Math.sqrt(o.mxx) : o.right - o.left;
      let cy = renderShape === 'ellipse' ? o.cy : (o.top + o.bottom) / 2, h = renderShape === 'ellipse' ? 4 * Math.sqrt(o.myy) : o.bottom - o.top;
      if (!fullW(o)) { const W = nearestSize(o, 'w'); w = W; cx = o.clip.left && o.clip.right ? NaN : o.clip.left ? o.right - W / 2 : o.left + W / 2; reconstructed++; }
      if (!fullH(o)) { const H = nearestSize(o, 'h'); h = H; cy = o.clip.top && o.clip.bottom ? NaN : o.clip.top ? o.bottom - H / 2 : o.top + H / 2; reconstructed++; }
      push('cx', o.frame, cx); push('cy', o.frame, cy); push('w', o.frame, w); push('h', o.frame, h); push('angle', o.frame, 0);
    }
    if (o.pixels >= Math.max(150, 0.3 * maxPixels)) push('opacity', o.frame, Math.min(1, o.strength / ref.strength));
  }
  if (faint) notes.push(`背景との差が小さい観測${faint}件（フェードの始まり等）は、位置・大きさの計測に使わず不透明度だけに使った`);
  if (reconstructed) notes.push(`画面端で見切れた観測${clipped}件は、反対側の縁と見切れていない時点の大きさから位置を復元した（見切れ中は大きさ一定と仮定）`);
  if (!series.cx.values.length || !series.w.values.length) return null;

  // 最初の観測の直前（最後の観測の直後）のフレームでは図形が検出されなかった。シーンの途中で現れた（消えた）場合だけ、
  // その時点のモデル値が「見えない値」になるよう制約する: 見切れて入ってきたなら画面外、小さければ最小面積未満、薄ければしきい値未満。
  const first = obs[0], last = obs.at(-1)!;
  const unseen = (c: ChannelName, side: 'before' | 'after'): Constraint[] => {
    const o = side === 'before' ? first : last, frame = side === 'before' ? o.frame - 1 : o.frame + 1;
    if (side === 'before' ? o.frame <= ctx.startFrame : o.frame >= ctx.endFrame) return [];
    const W = nearestSize(o, 'w'), H = nearestSize(o, 'h');
    if (c === 'cx' && o.clip.left && !o.clip.right) return [{frame, max: -W / 2 + 1}];
    if (c === 'cx' && o.clip.right && !o.clip.left) return [{frame, min: ctx.width + W / 2 - 1}];
    if (c === 'cy' && o.clip.top && !o.clip.bottom) return [{frame, max: -H / 2 + 1}];
    if (c === 'cy' && o.clip.bottom && !o.clip.top) return [{frame, min: ctx.height + H / 2 - 1}];
    const unclippedNow = fullW(o) && fullH(o);
    if (unclippedNow && (c === 'w' || c === 'h') && o.strength >= 3 * ctx.maskThreshold) {
      const other = c === 'w' ? o.bottom - o.top : o.right - o.left;
      return [{frame, max: Math.max(1, (ctx.minArea * (renderShape === 'ellipse' ? 4 / Math.PI : 1)) / Math.max(1, other))}];
    }
    if (c === 'opacity') return [{frame, max: (1.5 * ctx.maskThreshold) / ref.strength}];
    return [];
  };

  // チャンネルごとの区間検出と当てはめ。
  const fits: ChannelFit[] = [];
  for (const c of CHANNELS) {
    const s = series[c];
    if (s.values.length < 3) continue;
    const dn = deltaNoise(s, BASE[c].cap), thr = Math.max(BASE[c].thr, 5 * dn), total = Math.max(BASE[c].total, 10 * dn), sigma = Math.max(BASE[c].sigma, dn / Math.SQRT2);
    const runs = detectRuns(s, thr, total);
    runs.forEach((r, k) => {
      const cons = [...(k === 0 && r.ia === 1 ? unseen(c, 'before') : []), ...(k === runs.length - 1 && r.ib === s.values.length - 1 ? unseen(c, 'after') : [])];
      const fit = fitSegment(s, r, k ? runs[k - 1].ib : -1, k + 1 < runs.length ? runs[k + 1].ia : s.values.length, 8, BOUNDS[c], cons);
      fits.push({channel: c, fit, easing: classifyEasing(fit.candidates, sigma, fit.samples), sigma, series: s});
    });
  }

  // 時間が重なる区間を1つのアニメーションにまとめ、チャンネルをまたいでイージングを判定する。
  const t0 = (f: ChannelFit) => f.fit.candidates[0].t0, t1 = (f: ChannelFit) => f.fit.candidates[0].t1;
  const groups: ChannelFit[][] = [];
  for (const f of [...fits].sort((a, b) => t0(a) - t0(b))) {
    const g = groups.find(g => g.some(x => Math.min(t1(x), t1(f)) - Math.max(t0(x), t0(f)) >= 0.5 * Math.min(t1(x) - t0(x), t1(f) - t0(f))));
    if (g) g.push(f); else groups.push([f]);
  }
  const animations: Animation[] = [];
  const chosen = new Map<ChannelFit, {cand: Candidate; easing: EasingResult}>();
  groups.forEach((g, gi) => {
    const joint = jointEasing(g);
    const per = g.map(f => ({f, cand: joint.best ? f.fit.candidates.find(c => c.name === joint.best)! : f.fit.candidates[0]}));
    per.forEach(p => chosen.set(p.f, {cand: p.cand, easing: joint}));
    const startFrame = mean(per.map(p => p.cand.t0)), endFrame = mean(per.map(p => p.cand.t1));
    const startUnobs = g.some(f => !f.fit.v0Observed), endUnobs = g.some(f => !f.fit.v1Observed);
    const firstSeen = Math.min(...g.map(f => f.series.frames[Math.max(0, f.fit.run.ia - 1)])), lastSeen = Math.max(...g.map(f => f.series.frames[f.fit.run.ib]));
    const unc = (r: [number, number]) => Math.max(0.05, (r[1] - r[0]) / 2);
    // 観測できない端のモデル時刻は、誤差がほぼ同じになる時刻の幅が最も狭い（最も識別できる）チャンネルの値を使い、その幅を不確かさとして付ける。
    const ident = (key: 't0Range' | 't1Range', pick: (c: Candidate) => number) => {
      const best = per.map(p => ({v: pick(p.cand), u: unc(p.f.fit[key])})).sort((x, y) => x.u - y.u)[0];
      return {modelFrame: round(best.v, 2), uncertaintyFrames: round(best.u, 2)};
    };
    const ms = ident('t0Range', c => c.t0), me = ident('t1Range', c => c.t1);
    const start: TimePoint = startUnobs
      ? {frame: firstSeen, time: round(firstSeen / ctx.fps, 4), status: 'upper_bound', ...ms, reason: `開始時点が観測できない（最初に見えたフレーム${firstSeen}で既に動いている）。開始は${firstSeen}以前。modelFrameは当てはめ上の値（直前のフレームで見えなかったこと、大きさ・不透明度は0以上を制約に使用）で、不確かさ±${ms.uncertaintyFrames}フレーム${ms.uncertaintyFrames > 1 ? '（1フレームを超えるため識別できない。参考値）' : ''}`}
      : {frame: round(startFrame, 2), time: round(startFrame / ctx.fps, 4), status: 'estimated', uncertaintyFrames: round(Math.max(...g.map(f => unc(f.fit.t0Range))), 2)};
    const end: TimePoint = endUnobs
      ? {frame: lastSeen, time: round(lastSeen / ctx.fps, 4), status: 'lower_bound', ...me, reason: `終了後の静止が観測できない。終了は${lastSeen}以後。modelFrameは当てはめ上の値で、不確かさ±${me.uncertaintyFrames}フレーム${me.uncertaintyFrames > 1 ? '（1フレームを超えるため識別できない。参考値）' : ''}`}
      : {frame: round(endFrame, 2), time: round(endFrame / ctx.fps, 4), status: 'estimated', uncertaintyFrames: round(Math.max(...g.map(f => unc(f.fit.t1Range))), 2)};
    const v0 = Object.fromEntries(per.map(p => [p.f.channel, p.f.fit.v0Observed ? round(p.cand.v0, 2) : null]));
    const v1 = Object.fromEntries(per.map(p => [p.f.channel, p.f.fit.v1Observed ? round(p.cand.v1, 2) : null]));
    // 区間の前後の値。区間に含まれないチャンネルは近い時刻の測定値。
    const at = (c: ChannelName, f: number) => {
      const p = per.find(x => x.f.channel === c);
      if (p) return f <= startFrame ? p.cand.v0 : p.cand.v1;
      return series[c].values.length ? valueNear(series[c], f) : 0;
    };
    const chans = new Set(g.map(f => f.channel));
    const a: Animation = {
      id: `${id}-a${gi}`, type: 'translate', channels: [...chans], start, end,
      from: startUnobs ? {values: v0, status: 'unknown', reason: '動き始めの値は画面外・未表示などで観測できない（nullの項目）'} : {values: v0, status: 'measured'},
      to: endUnobs ? {values: v1, status: 'unknown', reason: '動き終わりの値が観測できない（nullの項目）'} : {values: v1, status: 'measured'},
      easing: joint,
      perChannel: per.map(p => ({channel: p.f.channel, f0: round(p.cand.t0, 2), f1: round(p.cand.t1, 2), v0: p.f.fit.v0Observed ? round(p.cand.v0, 2) : null, v1: p.f.fit.v1Observed ? round(p.cand.v1, 2) : null, easing: p.f.easing})),
    };
    const dur = Math.max(1e-6, (endFrame - startFrame) / ctx.fps);
    if (chans.has('opacity') && chans.size === 1) a.type = at('opacity', endFrame + 1) > at('opacity', startFrame - 1) ? 'fade-in' : 'fade-out';
    else if (chans.has('angle')) {
      a.type = 'rotate';
      const da = at('angle', endFrame + 1) - at('angle', startFrame - 1);
      a.direction = {angleDeg: round(da, 2), label: da > 0 ? '時計回り' : '反時計回り', status: startUnobs ? 'estimated' : 'measured'};
      a.speed = {averagePxPerSec: round(Math.abs(da) / dur, 2), peakPxPerSec: round(peak(series.angle, startFrame, endFrame, ctx.fps), 2), status: 'estimated', basis: '角速度（度/秒）。averageは開始〜終了の平均'};
    } else if (!chans.has('w') && !chans.has('h')) {
      a.type = 'translate';
      translateInfo(a, series, per.map(p => p.f), at, startFrame, endFrame, startUnobs, ctx);
    } else {
      // 縁の固定・移動は、当てはめの外挿値ではなく区間内で実際に観測したフレームの縁で判定する。
      const obsEdges = measuredEdges(series, startFrame - 1, endFrame + 1);
      const size = Math.max(...obsEdges.map(e => Math.max(e.right - e.left, e.bottom - e.top)), 1);
      const range = (k: 'left' | 'right' | 'top' | 'bottom' | 'cx' | 'cy') => obsEdges.length ? Math.max(...obsEdges.map(e => e[k])) - Math.min(...obsEdges.map(e => e[k])) : 0;
      const moved = (k: 'left' | 'right' | 'top' | 'bottom') => range(k) > Math.max(1, 0.02 * size);
      const ratios = obsEdges.filter(e => e.right - e.left > 8 && e.bottom - e.top > 8).map(e => (e.right - e.left) / (e.bottom - e.top));
      const uniform = ratios.length >= 3 && (Math.max(...ratios) - Math.min(...ratios)) / median(ratios) < 0.05;
      const m = {left: moved('left'), right: moved('right'), top: moved('top'), bottom: moved('bottom')};
      if (m.left && m.right && m.top && m.bottom && uniform && range('cx') < 1 && range('cy') < 1) {
        a.type = 'scale'; a.anchor = '中心';
        const sv = series.w, wEnd = at('w', endFrame + 1);
        const mx = Math.max(...sv.values.filter((_, i) => sv.frames[i] >= startFrame && sv.frames[i] <= endFrame + 2));
        if (mx / wEnd - 1 > 0.01) a.overshoot = round(mx / wEnd - 1, 4);
        a.speed = {averagePxPerSec: null, peakPxPerSec: round(peak(series.w, startFrame, endFrame, ctx.fps), 2), status: 'measured', basis: '幅の変化速度（px/秒）の最大'};
      } else {
        const anchor = [m.left ? '' : '左', m.right ? '' : '右', m.top ? '' : '上', m.bottom ? '' : '下'].filter(Boolean);
        a.type = (m.left !== m.right || m.top !== m.bottom) && anchor.length >= 3 ? 'grow' : 'resize';
        a.anchor = anchor.length ? anchor.join('・') + 'の縁が固定' : 'なし';
        const growing = (['left', 'right', 'top', 'bottom'] as const).filter(k => m[k]);
        a.direction = {angleDeg: 0, label: growing.map(k => ({left: '左', right: '右', top: '上', bottom: '下'})[k] + 'へ').join('・') || 'なし', status: 'measured'};
        const e0 = edges(c => at(c, startFrame - 1)), e1 = edges(c => at(c, endFrame + 1));
        a.speed = {averagePxPerSec: startUnobs ? null : round(Math.max(...growing.map(k => Math.abs(e1[k] - e0[k]))) / dur, 2), peakPxPerSec: round(Math.max(peak(series.w, startFrame, endFrame, ctx.fps), peak(series.h, startFrame, endFrame, ctx.fps)), 2), status: 'measured', basis: startUnobs ? '開始時点が観測できないため平均は不明。peakは幅・高さの変化速度（px/秒）の最大' : '動いた縁の平均速度と、幅・高さの変化速度の最大（px/秒）'};
      }
    }
    animations.push(a);
  });

  // 再現用チャンネル。イージングが不明な区間は測定値の折れ線にする。
  const channels = {} as Record<ChannelName, Channel>;
  for (const c of CHANNELS) {
    const s = series[c], mine = fits.filter(f => f.channel === c).sort((a, b) => a.fit.run.ia - b.fit.run.ia);
    const segments: ChannelSegment[] = mine.map(f => {
      const {cand, easing} = chosen.get(f)!;
      if (easing.status === 'unknown' || !easing.best) {
        const lo = Math.max(0, f.fit.run.ia - 1), hi = f.fit.run.ib;
        return {f0: s.frames[lo], f1: s.frames[hi], v0: s.values[lo], v1: s.values[hi], easing: {kind: 'samples', frames: s.frames.slice(lo, hi + 1), values: s.values.slice(lo, hi + 1).map(v => round(v, 3))}, model: false};
      }
      return {f0: round(cand.t0, 3), f1: round(cand.t1, 3), v0: round(cand.v0, 3), v1: round(cand.v1, 3), easing: {kind: 'named', name: cand.name as EasingName}, model: !f.fit.v0Observed || !f.fit.v1Observed};
    });
    const before = mine.length ? s.values.slice(0, Math.max(0, mine[0].fit.run.ia - 1)) : s.values;
    const initial = before.length ? median(before) : segments.length ? segments[0].v0 : c === 'opacity' ? 1 : 0;
    channels[c] = {initial: round(initial, 3), segments};
  }
  const firstObs = obs[0].frame, lastObs = obs.at(-1)!.frame;
  // 描くのは参考動画で図形が観測されたフレームだけ。観測できない区間をモデルの外挿で描くと、参考動画にない像が出る（T110の比較で発見）。
  const from = firstObs, to = lastObs;

  // 最終配置（要素が最後に見えるフレームの値）。
  const fv = (c: ChannelName) => channelValue(channels[c], to);
  const fin = {cx: fv('cx'), cy: fv('cy'), w: fv('w'), h: fv('h'), a: fv('angle')};
  const align: string[] = [];
  if (Math.abs(fin.cx - ctx.width / 2) < 3) align.push('水平中央');
  if (Math.abs(fin.cy - ctx.height / 2) < 3) align.push('垂直中央');
  align.push(`余白 左${round(fin.cx - fin.w / 2, 1)} 右${round(ctx.width - fin.cx - fin.w / 2, 1)} 上${round(fin.cy - fin.h / 2, 1)} 下${round(ctx.height - fin.cy - fin.h / 2, 1)}px`);
  if (!rotating && obs.length > 5 && fits.every(f => f.channel !== 'w' && f.channel !== 'h')) {
    const bbArea = obs.filter(o => fullW(o) && fullH(o)).map(o => (o.right - o.left) * (o.bottom - o.top));
    if (bbArea.length > 5 && Math.max(...bbArea) / Math.min(...bbArea) > 1.05) notes.push('外接矩形の面積が変化しているが大きさの区間として検出されていない。等方的な図形の回転などは解析できていない可能性がある');
  }

  return {
    id, scene: ctx.scene,
    observed: {firstFrame: firstObs, lastFrame: lastObs, frames: obs.length, clippedFrames: clipped},
    shape,
    color: {value: hex(ref.color), rgb: ref.color.map(v => round(v, 1)) as [number, number, number], status: colorStatus, spread: round(ref.colorSpread, 2), ...(colorStatus === 'measured' ? {} : {reason: '単色でない可能性'})},
    layout: {
      final: {left: round(fin.cx - fin.w / 2, 2), top: round(fin.cy - fin.h / 2, 2), width: round(fin.w, 2), height: round(fin.h, 2), cx: round(fin.cx, 2), cy: round(fin.cy, 2), angleDeg: round(fin.a, 2)},
      normalized: {cx: round(fin.cx / ctx.width, 4), cy: round(fin.cy / ctx.height, 4), width: round(fin.w / ctx.width, 4), height: round(fin.h / ctx.height, 4)},
      alignment: align,
      status: lastObs === to ? 'measured' : 'estimated',
    },
    animations,
    render: {from, to, shape: renderShape, cornerRadius: round(corner, 2), color: hex(ref.color), channels},
    series: Object.fromEntries(CHANNELS.map(c => [c, {frames: series[c].frames, values: series[c].values.map(v => round(v, 3))}])) as ElementAnalysis['series'],
    notes,
  };

  function edges(get: (c: ChannelName) => number) {
    const cx = get('cx'), cy = get('cy'), w = get('w'), h = get('h');
    return {left: cx - w / 2, right: cx + w / 2, top: cy - h / 2, bottom: cy + h / 2};
  }
}

function translateInfo(a: Animation, series: Record<ChannelName, Series>, g: ChannelFit[], at: (c: ChannelName, f: number) => number, s: number, e: number, startUnobs: boolean, ctx: Ctx) {
  const x0 = at('cx', s - 1), y0 = at('cy', s - 1), x1 = at('cx', e + 1), y1 = at('cy', e + 1);
  let dx = x1 - x0, dy = y1 - y0, basis = '開始〜終了の距離 / 時間';
  if (startUnobs) {
    // 見えていた部分だけで方向と平均速度を測る。
    const f0 = Math.min(...g.map(f => f.series.frames[Math.max(0, f.fit.run.ia - 1)]));
    const vx = valueNear(series.cx, f0), vy = valueNear(series.cy, f0);
    dx = x1 - vx; dy = y1 - vy; basis = `見えていた区間（フレーム${f0}〜）の距離 / 時間。開始位置が観測できないため全体の距離は不明`;
    const dist = Math.hypot(dx, dy), dur = Math.max(1e-6, (e - f0) / ctx.fps);
    a.speed = {averagePxPerSec: round(dist / dur, 1), peakPxPerSec: round(peakXY(series, s, e, ctx.fps), 1), status: 'lower_bound', basis};
  } else {
    const dur = Math.max(1e-6, (e - s) / ctx.fps);
    a.speed = {averagePxPerSec: round(Math.hypot(dx, dy) / dur, 1), peakPxPerSec: round(peakXY(series, s, e, ctx.fps), 1), status: 'estimated', basis};
  }
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  a.direction = {angleDeg: round(ang, 2), label: DIRS[(Math.round(ang / 45) + 8) % 8], status: 'measured'};
}

/** a〜bフレームで、中心と大きさがすべて観測されたフレームの縁。 */
function measuredEdges(sr: Record<ChannelName, Series>, a: number, b: number) {
  const m = (c: ChannelName) => new Map(sr[c].frames.map((f, i) => [f, sr[c].values[i]]));
  const cx = m('cx'), cy = m('cy'), w = m('w'), h = m('h'), out: {left: number; right: number; top: number; bottom: number; cx: number; cy: number}[] = [];
  for (const [f, x] of cx) {
    if (f < a || f > b || !cy.has(f) || !w.has(f) || !h.has(f)) continue;
    const y = cy.get(f)!, ww = w.get(f)!, hh = h.get(f)!;
    out.push({left: x - ww / 2, right: x + ww / 2, top: y - hh / 2, bottom: y + hh / 2, cx: x, cy: y});
  }
  return out;
}

function valueNear(s: Series, f: number) { let best = 0; for (let i = 0; i < s.frames.length; i++) if (Math.abs(s.frames[i] - f) < Math.abs(s.frames[best] - f)) best = i; return s.values[best]; }
function peak(s: Series, a: number, b: number, fps: number) { let m = 0; for (let i = 1; i < s.frames.length; i++) if (s.frames[i] >= a && s.frames[i - 1] <= b + 1 && s.frames[i] - s.frames[i - 1] === 1) m = Math.max(m, Math.abs(s.values[i] - s.values[i - 1]) * fps); return m; }
function peakXY(sr: Record<ChannelName, Series>, a: number, b: number, fps: number) {
  const x = sr.cx, y = sr.cy, yi = new Map(y.frames.map((f, i) => [f, y.values[i]]));
  let m = 0;
  for (let i = 1; i < x.frames.length; i++) {
    const f = x.frames[i], p = x.frames[i - 1];
    if (f < a || p > b + 1 || f - p !== 1 || !yi.has(f) || !yi.has(p)) continue;
    m = Math.max(m, Math.hypot(x.values[i] - x.values[i - 1], yi.get(f)! - yi.get(p)!) * fps);
  }
  return m;
}
const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;

/** 複数チャンネルのχ²を合計して共通のイージングを選ぶ。 */
function jointEasing(g: ChannelFit[]): EasingResult {
  if (g.length === 1) return g[0].easing;
  const names = g[0].fit.candidates.map(c => c.name).filter(n => g.every(f => f.fit.candidates.some(c => c.name === n)));
  const score = names.map(name => {
    const parts = g.map(f => ({f, c: f.fit.candidates.find(c => c.name === name)!}));
    return {name, chi: parts.reduce((s, p) => s + (p.f.fit.samples * p.c.rmse ** 2) / p.f.sigma ** 2, 0), parts};
  }).sort((a, b) => a.chi - b.chi);
  if (!score.length) return {status: 'unknown', best: null, nrmse: null, candidates: [], reason: '共通の候補がない'};
  const b = score[0], list = score.slice(0, 5).map(s => ({name: s.name, nrmse: round(mean(s.parts.map(p => p.c.nrmse)), 5)}));
  const bad = b.parts.find(p => p.c.rmse > 4 * p.f.sigma && p.c.nrmse > 0.015);
  if (bad) return {status: 'unknown', best: null, nrmse: list[0].nrmse, candidates: list, reason: `共通の最良候補（${b.name}）でも${bad.f.channel}の誤差が雑音の${(bad.c.rmse / bad.f.sigma).toFixed(1)}倍で当てはまらない`};
  if (g.some(f => f.fit.samples < 5)) return {status: 'unknown', best: null, nrmse: list[0].nrmse, candidates: list, reason: '標本が少なく形を区別できない'};
  const tied = score.filter(s => s.chi - b.chi < 9);
  if (tied.length > 1) return {status: 'ambiguous', best: b.name, nrmse: list[0].nrmse, candidates: list.slice(0, Math.max(3, tied.length)), reason: `${tied.map(t => t.name).join('、')} の差が雑音に対して有意でない（チャンネル${g.map(f => f.channel).join('・')}の合計）`};
  return {status: 'estimated', best: b.name, nrmse: list[0].nrmse, candidates: list.slice(0, 3)};
}
