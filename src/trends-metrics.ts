// カテゴリ別トレンドと動画・チャンネルの成長指標（T136）。定義は docs/TRENDS-METRICS.md（T132）。
// 派生値は保存せず、ここで都度計算する。APIデータへの算出は derivedAllowed の許可が必要（T131）。
import {
  type CollectionBatch, type Source, type TrendsPolicy, DAY_MS, VIEW_COUNT_REDEFINED_AT, derivedAllowed,
} from './trends-schema.ts';

export type Reason = 'insufficient-snapshots' | 'missing-latest' | 'value-unavailable' | 'interval-mismatch'
  | 'view-count-redefined' | 'count-decreased' | 'source-mixed' | 'stale' | 'low-sample';

export const REASON_LABEL: Record<Reason, string> = {
  'insufficient-snapshots': '観測が1回以下',
  'missing-latest': '最新の観測で取得できない（削除・非公開化の可能性）',
  'value-unavailable': '値が非公開・取得不可',
  'interval-mismatch': '観測間隔が観測窓と25%超ずれる',
  'view-count-redefined': '再生数の定義変更（2026-08-24）をまたぐ',
  'count-decreased': '値が減少（集計訂正の可能性）',
  'source-mixed': '出所の異なる観測',
  'stale': 'データが古い',
  'low-sample': '標本が少ない',
};

export type AnalysisOptions = {
  source: Source;
  regionCode: string;
  asOf: string;
  windowDays: number;
  staleDays?: number;
  tolerance?: number;
};

export class PolicyDenied extends Error {}

export type Observation = {at: string; source: Source; status: 'ok' | 'missing'; value: number | null};

export type Growth = {
  start: {at: string; value: number} | null;
  end: {at: string; value: number} | null;
  elapsedDays: number | null;
  delta: number | null;
  perDay: number | null;
  relative: number | null;
  comparable: boolean;
  reasons: Reason[];
  dataAgeDays: number | null;
};

// 時刻は表記（小数秒の有無）が混ざりうるため、文字列ではなく数値で比べる。
const ms = (t: string) => Date.parse(t);
const byTime = (a: {at: string}, b: {at: string}) => ms(a.at) - ms(b.at);

const BLOCKING = (r: Reason) => r !== 'stale' && r !== 'low-sample';

// 1系列の観測から、観測窓に対する増加を求める。比較不能なら値はnullで理由を付ける。
export function growthOf(observations: Observation[], opt: AnalysisOptions, viewCount: boolean): Growth {
  const asOf = Date.parse(opt.asOf);
  const staleDays = opt.staleDays ?? 2;
  const tolerance = opt.tolerance ?? 0.25;
  const obs = observations.filter(o => ms(o.at) <= asOf).sort(byTime);
  const empty = (reasons: Reason[], dataAgeDays: number | null = null): Growth =>
    ({start: null, end: null, elapsedDays: null, delta: null, perDay: null, relative: null, comparable: false, reasons, dataAgeDays});
  const latest = obs.at(-1);
  if (!latest) return empty(['insufficient-snapshots']);
  if (latest.status === 'missing') return empty(['missing-latest'], (asOf - Date.parse(latest.at)) / DAY_MS);
  const ok = obs.filter(o => o.status === 'ok');
  const t1 = ok.at(-1)!;
  const dataAgeDays = (asOf - Date.parse(t1.at)) / DAY_MS;
  const before = ok.slice(0, -1);
  if (!before.length) return empty(dataAgeDays > staleDays ? ['insufficient-snapshots', 'stale'] : ['insufficient-snapshots'], dataAgeDays);
  const target = Date.parse(t1.at) - opt.windowDays * DAY_MS;
  const t0 = before.reduce((best, o) => Math.abs(Date.parse(o.at) - target) < Math.abs(Date.parse(best.at) - target) ? o : best);
  const elapsedDays = (Date.parse(t1.at) - Date.parse(t0.at)) / DAY_MS;
  const reasons: Reason[] = [];
  if (t0.value === null || t1.value === null) reasons.push('value-unavailable');
  if (t0.source !== t1.source) reasons.push('source-mixed');
  if (Math.abs(elapsedDays - opt.windowDays) / opt.windowDays > tolerance) reasons.push('interval-mismatch');
  if (viewCount && ms(t0.at) < ms(VIEW_COUNT_REDEFINED_AT) && ms(t1.at) >= ms(VIEW_COUNT_REDEFINED_AT)) reasons.push('view-count-redefined');
  if (t0.value !== null && t1.value !== null && t1.value < t0.value) reasons.push('count-decreased');
  if (dataAgeDays > staleDays) reasons.push('stale');
  const start = t0.value === null ? null : {at: t0.at, value: t0.value};
  const end = t1.value === null ? null : {at: t1.at, value: t1.value};
  if (reasons.some(BLOCKING)) return {...empty(reasons, dataAgeDays), start, end, elapsedDays};
  const delta = t1.value! - t0.value!;
  return {start, end, elapsedDays, delta, perDay: delta / elapsedDays, relative: t0.value! === 0 ? null : delta / t0.value!,
    comparable: true, reasons, dataAgeDays};
}

const scoped = (batches: CollectionBatch[], opt: AnalysisOptions) => batches.filter(b => b.source === opt.source && b.regionCode === opt.regionCode);

function requireAllowed(opt: AnalysisOptions, policy: TrendsPolicy, kind: 'growth' | 'category') {
  const r = derivedAllowed(opt.source, policy, kind);
  if (!r.ok) throw new PolicyDenied(r.reason);
}

export type VideoGrowth = {videoId: string; channelId: string | null; categoryId: string | null; title: string | null; views: Growth};

export function videoGrowth(batches: CollectionBatch[], policy: TrendsPolicy, opt: AnalysisOptions): VideoGrowth[] {
  requireAllowed(opt, policy, 'growth');
  const series = new Map<string, {obs: Observation[]; meta: {at: string; channelId: string | null; categoryId: string | null; title: string | null}}>();
  for (const b of scoped(batches, opt)) for (const v of b.videos) {
    const s = series.get(v.videoId) ?? {obs: [], meta: {at: '', channelId: null, categoryId: null, title: null}};
    // 同じ時刻に複数のチャートへ出た場合も、値は同じ取得の値なので1つにまとめる。
    if (!s.obs.some(o => ms(o.at) === ms(v.fetchedAt))) s.obs.push({at: v.fetchedAt, source: b.source, status: v.status, value: v.viewCount});
    if (v.status === 'ok' && ms(v.fetchedAt) <= ms(opt.asOf) && (!s.meta.at || ms(v.fetchedAt) >= ms(s.meta.at))) s.meta = {at: v.fetchedAt, channelId: v.channelId, categoryId: v.categoryId, title: v.title};
    series.set(v.videoId, s);
  }
  return [...series].map(([videoId, s]) => ({videoId, channelId: s.meta.channelId, categoryId: s.meta.categoryId, title: s.meta.title, views: growthOf(s.obs, opt, true)}))
    .sort((a, b) => (b.views.perDay ?? -Infinity) - (a.views.perDay ?? -Infinity) || a.videoId.localeCompare(b.videoId));
}

// 有効数字3桁に切り捨てた値の最小単位。
export const truncationUnit = (x: number) => x < 1000 ? 1 : 10 ** (String(Math.trunc(x)).length - 3);

export type ChannelGrowth = {
  channelId: string; title: string | null;
  views: Growth; subscribers: Growth & {uncertainty: number | null}; videos: Growth;
};

export function channelGrowth(batches: CollectionBatch[], policy: TrendsPolicy, opt: AnalysisOptions): ChannelGrowth[] {
  requireAllowed(opt, policy, 'growth');
  const series = new Map<string, {views: Observation[]; subs: Observation[]; videos: Observation[]; title: string | null; at: string}>();
  for (const b of scoped(batches, opt)) for (const c of b.channels) {
    const s = series.get(c.channelId) ?? {views: [], subs: [], videos: [], title: null, at: ''};
    const base = {at: c.fetchedAt, source: b.source, status: c.status};
    s.views.push({...base, value: c.viewCount});
    s.subs.push({...base, value: c.subscriberCountHidden ? null : c.subscriberCount});
    s.videos.push({...base, value: c.videoCount});
    if (c.status === 'ok' && ms(c.fetchedAt) <= ms(opt.asOf) && (!s.at || ms(c.fetchedAt) >= ms(s.at))) { s.title = c.title; s.at = c.fetchedAt; }
    series.set(c.channelId, s);
  }
  return [...series].map(([channelId, s]) => {
    const subscribers = growthOf(s.subs, opt, false);
    const uncertainty = subscribers.comparable ? Math.max(truncationUnit(subscribers.start!.value), truncationUnit(subscribers.end!.value)) : null;
    return {channelId, title: s.title, views: growthOf(s.views, opt, true), subscribers: {...subscribers, uncertainty}, videos: growthOf(s.videos, opt, false)};
  }).sort((a, b) => (b.views.perDay ?? -Infinity) - (a.views.perDay ?? -Infinity) || a.channelId.localeCompare(b.channelId));
}

export const UNKNOWN_CATEGORY = 'unknown';
export const LOW_SAMPLE_CHART = 20;
export const LOW_SAMPLE_MOMENTUM = 5;

type ChartSnapshot = {at: string; counts: Map<string, number>; total: number};

function overallCharts(batches: CollectionBatch[], opt: AnalysisOptions): ChartSnapshot[] {
  const out: ChartSnapshot[] = [];
  for (const b of scoped(batches, opt)) {
    const known = new Set(b.categories.map(c => c.categoryId));
    for (const ch of b.charts) {
      if (ch.chartCategoryId !== '0' || !ch.complete || ms(ch.fetchedAt) > ms(opt.asOf)) continue;
      const counts = new Map<string, number>();
      let total = 0;
      for (const v of b.videos) {
        if (v.chart?.chartCategoryId !== '0' || ms(v.fetchedAt) !== ms(ch.fetchedAt)) continue;
        // カテゴリ名の対応表がない（期限で消した等）場合はIDをそのまま使い、IDがなければunknown。
        const c = v.categoryId && (known.size === 0 || known.has(v.categoryId)) ? v.categoryId : UNKNOWN_CATEGORY;
        counts.set(c, (counts.get(c) ?? 0) + 1);
        total++;
      }
      if (total > 0) out.push({at: ch.fetchedAt, counts, total});
    }
  }
  return out.sort(byTime);
}

export type CategoryShare = {
  categoryId: string; title: string | null;
  start: {at: string; count: number; total: number; share: number} | null;
  end: {at: string; count: number; total: number; share: number};
  changePoints: number | null;
  medianPerDay: number | null; momentumSample: number;
  reasons: Reason[];
};

export type CategoryTrend = {at: string | null; startAt: string | null; reasons: Reason[]; categories: CategoryShare[]};

// 全体の人気チャート（categoryId '0'）の構成比と、その変化、カテゴリ内の動画の増加の中央値。
export function categoryTrend(batches: CollectionBatch[], policy: TrendsPolicy, opt: AnalysisOptions): CategoryTrend {
  requireAllowed(opt, policy, 'category');
  const charts = overallCharts(batches, opt);
  const t1 = charts.at(-1);
  if (!t1) return {at: null, startAt: null, reasons: ['insufficient-snapshots'], categories: []};
  const before = charts.slice(0, -1);
  const target = Date.parse(t1.at) - opt.windowDays * DAY_MS;
  const t0 = before.length ? before.reduce((best, c) => Math.abs(Date.parse(c.at) - target) < Math.abs(Date.parse(best.at) - target) ? c : best) : null;
  const reasons: Reason[] = [];
  if (!t0) reasons.push('insufficient-snapshots');
  else if (Math.abs((Date.parse(t1.at) - Date.parse(t0.at)) / DAY_MS - opt.windowDays) / opt.windowDays > (opt.tolerance ?? 0.25)) reasons.push('interval-mismatch');
  if ((Date.parse(opt.asOf) - Date.parse(t1.at)) / DAY_MS > (opt.staleDays ?? 2)) reasons.push('stale');
  if (t1.total < LOW_SAMPLE_CHART || (t0 && t0.total < LOW_SAMPLE_CHART)) reasons.push('low-sample');
  const comparable = !reasons.some(BLOCKING);
  const titles = new Map<string, string>();
  for (const b of scoped(batches, opt)) for (const c of b.categories) titles.set(c.categoryId, c.title);
  const growth = videoGrowth(batches, policy, opt).filter(v => v.views.comparable);
  const ids = new Set([...t1.counts.keys(), ...(t0 ? t0.counts.keys() : [])]);
  const categories = [...ids].map(categoryId => {
    const n1 = t1.counts.get(categoryId) ?? 0;
    const end = {at: t1.at, count: n1, total: t1.total, share: n1 / t1.total};
    const start = t0 ? {at: t0.at, count: t0.counts.get(categoryId) ?? 0, total: t0.total, share: (t0.counts.get(categoryId) ?? 0) / t0.total} : null;
    const rates = growth.filter(v => (v.categoryId ?? UNKNOWN_CATEGORY) === categoryId).map(v => v.views.perDay!);
    const own: Reason[] = rates.length < LOW_SAMPLE_MOMENTUM ? ['low-sample'] : [];
    return {categoryId, title: titles.get(categoryId) ?? null, start, end,
      changePoints: comparable && start ? (end.share - start.share) * 100 : null,
      medianPerDay: median(rates), momentumSample: rates.length, reasons: own};
  }).sort((a, b) => b.end.share - a.end.share || a.categoryId.localeCompare(b.categoryId));
  return {at: t1.at, startAt: t0?.at ?? null, reasons, categories};
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// 派生しない取得値の時系列（時点つき）。standardのAPIデータにも出せる（III.E.4.f）。
export type RawPoint = {at: string; status: 'ok' | 'missing'; viewCount: number | null; subscriberCount?: number | null; chartRank?: number | null};

export function rawSeries(batches: CollectionBatch[], opt: Pick<AnalysisOptions, 'source' | 'regionCode'>, target: {videoId?: string; channelId?: string}): RawPoint[] {
  const out: RawPoint[] = [];
  for (const b of batches.filter(x => x.source === opt.source && x.regionCode === opt.regionCode)) {
    if (target.videoId) for (const v of b.videos) if (v.videoId === target.videoId) {
      const prev = out.find(p => ms(p.at) === ms(v.fetchedAt));
      const rank = v.chart?.chartCategoryId === '0' ? v.chart.rank : null;
      if (prev) { if (rank !== null) prev.chartRank = rank; continue; }
      out.push({at: v.fetchedAt, status: v.status, viewCount: v.viewCount, chartRank: rank});
    }
    if (target.channelId) for (const c of b.channels) if (c.channelId === target.channelId) {
      out.push({at: c.fetchedAt, status: c.status, viewCount: c.viewCount, subscriberCount: c.subscriberCountHidden ? null : c.subscriberCount});
    }
  }
  return out.sort(byTime);
}
