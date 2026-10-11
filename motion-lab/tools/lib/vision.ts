// 画素処理: 単色背景の推定、前景の連結成分、成分ごとのサブピクセル計測（面積・重心・2次モーメント・外接矩形）。
// 前提: 背景は単色、図形は単色で互いに重ならない。前提を満たさない入力は呼び出し側でunknownとして扱う。

export type RGB = [number, number, number];
export type Background = {color: RGB; coverage: number; noise: number};

export const hex = (c: RGB) => '#' + c.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
export const dist = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** 量子化ヒストグラムの最頻色を背景候補とし、近い画素の平均で精密化する。被覆率が最も高いフレームの結果を採用。 */
export function estimateBackground(frames: Uint8Array[], tol = 10): Background {
  let best: Background | null = null;
  for (const px of frames) {
    const n = px.length / 3, hist = new Uint32Array(4096);
    for (let i = 0; i < n; i++) hist[((px[i * 3] >> 4) << 8) | ((px[i * 3 + 1] >> 4) << 4) | (px[i * 3 + 2] >> 4)]++;
    let mode = 0;
    for (let b = 1; b < 4096; b++) if (hist[b] > hist[mode]) mode = b;
    let c: RGB = [((mode >> 8) << 4) + 8, (((mode >> 4) & 15) << 4) + 8, ((mode & 15) << 4) + 8];
    let count = 0, sq = 0;
    for (let pass = 0; pass < 3; pass++) {
      let r = 0, g = 0, bl = 0;
      count = 0; sq = 0;
      for (let i = 0; i < n; i++) {
        const dr = px[i * 3] - c[0], dg = px[i * 3 + 1] - c[1], db = px[i * 3 + 2] - c[2], d2 = dr * dr + dg * dg + db * db;
        if (d2 <= (pass === 0 ? 3 : 1) * tol * tol) { r += px[i * 3]; g += px[i * 3 + 1]; bl += px[i * 3 + 2]; count++; sq += d2; }
      }
      if (!count) break;
      c = [r / count, g / count, bl / count];
    }
    const cand = {color: c, coverage: count / n, noise: count ? Math.sqrt(sq / count) : Infinity};
    if (!best || cand.coverage > best.coverage) best = cand;
  }
  return best!;
}

export type Observation = {
  frame: number;
  /** 被覆率で重み付けした面積（px²）。 */
  area: number;
  cx: number;
  cy: number;
  /** 重心まわりの2次モーメント（分散）。 */
  mxx: number;
  myy: number;
  mxy: number;
  /** サブピクセルの外接矩形（画素の左上を0とする座標）。 */
  left: number;
  right: number;
  top: number;
  bottom: number;
  clip: {left: boolean; right: boolean; top: boolean; bottom: boolean};
  /** 内部画素の平均色と、そのばらつき（RGB距離のRMS）。 */
  color: RGB;
  colorSpread: number;
  /** 背景色からの距離（不透明度の推定に使う）。 */
  strength: number;
  pixels: number;
  /** 角の深さ（4隅の中央値、px）: 外接矩形の角から対角線に沿って内側へ進み、被覆率が0.5に達する距離。鋭い角は約0.35、半径rの角丸は約r(√2−1)+0.35。 */
  cornerDepth: number;
};

/** 1フレームの前景成分を計測する。maskT: 背景との距離のしきい値、minArea: 雑音として捨てる最小画素数。 */
export function observe(px: Uint8Array, w: number, h: number, bg: Background, frame: number, maskT = 20, minArea = 12): Observation[] {
  const n = w * h, d = new Float32Array(n), labels = new Int32Array(n);
  const [br, bgc, bb] = bg.color;
  for (let i = 0; i < n; i++) d[i] = Math.hypot(px[i * 3] - br, px[i * 3 + 1] - bgc, px[i * 3 + 2] - bb);
  // 4近傍の2パス連結成分（union-find）。
  const parent: number[] = [0];
  const find = (x: number) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (d[i] <= maskT) continue;
    const l = x > 0 ? labels[i - 1] : 0, u = y > 0 ? labels[i - w] : 0;
    if (!l && !u) { parent.push(parent.length); labels[i] = parent.length - 1; }
    else if (l && u) { const a = find(l), b = find(u); labels[i] = Math.min(a, b); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); }
    else labels[i] = l || u;
  }
  type Box = {count: number; x0: number; x1: number; y0: number; y1: number};
  const boxes = new Map<number, Box>();
  for (let i = 0; i < n; i++) {
    if (!labels[i]) continue;
    const r = find(labels[i]);
    labels[i] = r;
    const x = i % w, y = (i - x) / w, b = boxes.get(r);
    if (!b) boxes.set(r, {count: 1, x0: x, x1: x, y0: y, y1: y});
    else { b.count++; if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; }
  }
  const out: Observation[] = [];
  for (const [id, b] of boxes) {
    if (b.count < minArea) continue;
    // 内部画素（4近傍がすべて同じ成分）の平均色。小さい成分は全画素。
    // 色のばらつきも内部画素だけで測る（縁のアンチエイリアスや色差の間引きの影響を除く）。
    let sr = 0, sg = 0, sb = 0, sq = 0, cnt = 0;
    const pass = (strict: boolean) => {
      for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) {
        const i = y * w + x;
        if (labels[i] !== id) continue;
        if (strict && (x < 2 || y < 2 || x >= w - 2 || y >= h - 2 || labels[i - 2] !== id || labels[i + 2] !== id || labels[i - 2 * w] !== id || labels[i + 2 * w] !== id)) continue;
        sr += px[i * 3]; sg += px[i * 3 + 1]; sb += px[i * 3 + 2]; sq += px[i * 3] ** 2 + px[i * 3 + 1] ** 2 + px[i * 3 + 2] ** 2; cnt++;
      }
    };
    pass(true);
    if (cnt < 4) { sr = sg = sb = sq = cnt = 0; pass(false); }
    const color: RGB = [sr / cnt, sg / cnt, sb / cnt];
    const v: RGB = [color[0] - br, color[1] - bgc, color[2] - bb], s2 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2], strength = Math.sqrt(s2);
    const spread = Math.max(0, sq / cnt - (color[0] ** 2 + color[1] ** 2 + color[2] ** 2));
    // 被覆率 = 背景→図形色の線分への射影（アンチエイリアスの縁も含めて面積・重心を測る）。
    const x0 = Math.max(0, b.x0 - 2), x1 = Math.min(w - 1, b.x1 + 2), y0 = Math.max(0, b.y0 - 2), y1 = Math.min(h - 1, b.y1 + 2);
    const colMax = new Float64Array(x1 - x0 + 1), rowMax = new Float64Array(y1 - y0 + 1);
    let A = 0, Sx = 0, Sy = 0, Sxx = 0, Syy = 0, Sxy = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      if (labels[i] && labels[i] !== id) continue;
      const pr = px[i * 3] - br, pg = px[i * 3 + 1] - bgc, pb = px[i * 3 + 2] - bb;
      const cov = Math.min(1, Math.max(0, (pr * v[0] + pg * v[1] + pb * v[2]) / s2));
      if (!cov) continue;
      const fx = x + 0.5, fy = y + 0.5;
      A += cov; Sx += cov * fx; Sy += cov * fy; Sxx += cov * fx * fx; Syy += cov * fy * fy; Sxy += cov * fx * fy;
      if (cov > colMax[x - x0]) colMax[x - x0] = cov;
      if (cov > rowMax[y - y0]) rowMax[y - y0] = cov;
    }
    const cx = Sx / A, cy = Sy / A;
    const [left, right] = softEdges(colMax, x0), [top, bottom] = softEdges(rowMax, y0);
    // 被覆率を画素中心の格子から双線形補間し、4隅の対角線上で0.5を横切る距離を測る。
    const covAt = (x: number, y: number) => {
      const fx = x - 0.5, fy = y - 0.5, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      let sum = 0;
      for (const [dx, dy, wt] of [[0, 0, (1 - tx) * (1 - ty)], [1, 0, tx * (1 - ty)], [0, 1, (1 - tx) * ty], [1, 1, tx * ty]]) {
        const xx = ix + dx, yy = iy + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const i = yy * w + xx;
        if (labels[i] && labels[i] !== id) continue;
        sum += wt * Math.min(1, Math.max(0, ((px[i * 3] - br) * v[0] + (px[i * 3 + 1] - bgc) * v[1] + (px[i * 3 + 2] - bb) * v[2]) / s2));
      }
      return sum;
    };
    const maxT = Math.min(right - left, bottom - top) / 2;
    const depth = (x: number, y: number, sx: number, sy: number) => {
      let prev = covAt(x, y);
      for (let t = 0.05; t <= maxT; t += 0.05) {
        const c = covAt(x + (sx * t) / Math.SQRT2, y + (sy * t) / Math.SQRT2);
        if (c >= 0.5) return t - 0.05 + (0.05 * (0.5 - prev)) / Math.max(1e-6, c - prev);
        prev = c;
      }
      return maxT;
    };
    const depths = [depth(left, top, 1, 1), depth(right, top, -1, 1), depth(left, bottom, 1, -1), depth(right, bottom, -1, -1)].sort((p, q) => p - q);
    const cornerDepth = (depths[1] + depths[2]) / 2;
    out.push({
      frame, area: A, cx, cy, mxx: Sxx / A - cx * cx, myy: Syy / A - cy * cy, mxy: Sxy / A - cx * cy,
      left, right, top, bottom,
      clip: {left: b.x0 === 0, right: b.x1 === w - 1, top: b.y0 === 0, bottom: b.y1 === h - 1},
      color, colorSpread: Math.sqrt(spread), strength, pixels: b.count, cornerDepth,
    });
  }
  return out;
}

/** 列（行）ごとの最大被覆率から、縁のサブピクセル位置を求める。内側の確実な列より外側の被覆率の合計だけ縁を外へ伸ばす。 */
export function softEdges(profile: Float64Array, offset: number): [number, number] {
  let peak = 0;
  for (const v of profile) if (v > peak) peak = v;
  const full = peak * 0.9;
  let i = 0, j = profile.length - 1;
  while (i < profile.length && profile[i] < full) i++;
  while (j > 0 && profile[j] < full) j--;
  let lo = 0, hi = 0;
  for (let k = 0; k < i; k++) lo += profile[k] / peak;
  for (let k = j + 1; k < profile.length; k++) hi += profile[k] / peak;
  return [offset + i - lo, offset + j + 1 + hi];
}

/** 2次モーメントの主軸角（度、画面座標で時計回りが正）と固有値。 */
export function principal(o: Pick<Observation, 'mxx' | 'myy' | 'mxy'>) {
  const t = (o.mxx + o.myy) / 2, dd = Math.sqrt(((o.mxx - o.myy) / 2) ** 2 + o.mxy ** 2);
  return {angleDeg: (0.5 * Math.atan2(2 * o.mxy, o.mxx - o.myy) * 180) / Math.PI, l1: t + dd, l2: Math.max(0, t - dd)};
}
