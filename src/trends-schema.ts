// YouTube公開データのトレンド・成長分析のデータ契約（T132）。
// 指標の定義と根拠は docs/TRENDS-METRICS.md、利用条件は docs/RESEARCH-TRENDS-API.md（T131）。
// 取得値はAPIの値をそのまま持ち、派生値はここに保存しない（III.E.4.h）。

export const BATCH_SCHEMA = 'yt-trends-batch/v1';
export const DAY_MS = 86_400_000;
// viewCountの計上方法が変わった日（Videos resource、2026-08-24）。時刻の記載がないためUTC 0時を境界とする。
export const VIEW_COUNT_REDEFINED_AT = '2026-08-24T00:00:00.000Z';

export type Source = 'synthetic' | 'youtube-data-api';
export type RecordStatus = 'ok' | 'missing';

// chart=mostPopular の1回の取得に含まれた位置。categoryId '0' は全カテゴリの人気チャート。
export type ChartPlacement = {chartCategoryId: string; rank: number};

export type VideoSnapshot = {
  videoId: string;
  fetchedAt: string;
  status: RecordStatus;
  chart: ChartPlacement | null;
  channelId: string | null;
  categoryId: string | null;
  publishedAt: string | null;
  title: string | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
};

export type ChannelSnapshot = {
  channelId: string;
  fetchedAt: string;
  status: RecordStatus;
  title: string | null;
  viewCount: number | null;
  // 有効数字3桁に切り捨てられた値。hiddenならnull。
  subscriberCount: number | null;
  subscriberCountHidden: boolean;
  videoCount: number | null;
};

export type CategoryRecord = {categoryId: string; title: string; assignable: boolean};

// 1回の収集の単位。同じbatchの記録は同じ出所・地域を持つ。
export type CollectionBatch = {
  schema: typeof BATCH_SCHEMA;
  batchId: string;
  source: Source;
  regionCode: string;
  startedAt: string;
  completedAt: string;
  quotaUnits: number;
  // chart=mostPopularを取得したカテゴリ。カテゴリ分布の母数を判断するのに使う。
  charts: {chartCategoryId: string; fetchedAt: string; complete: boolean}[];
  categories: CategoryRecord[];
  videos: VideoSnapshot[];
  channels: ChannelSnapshot[];
};

export type PolicyProfile = 'standard' | 'audited-derived-metrics';

// 実APIデータに派生指標・カテゴリ集計を許すかの設定。人が記録する（T133）。approvalRefは申請受付番号など非秘密の参照。
export type TrendsPolicy = {
  profile: PolicyProfile;
  approvalRef: string | null;
  categoryAggregationApproved: boolean;
  recordedBy: string | null;
  recordedAt: string | null;
};

export const DEFAULT_POLICY: TrendsPolicy = {
  profile: 'standard', approvalRef: null, categoryAggregationApproved: false, recordedBy: null, recordedAt: null,
};

// 保持期限（T131 3章）。standardは全APIデータ30日。承認後は統計36か月、タイトル等の統計以外30日。
export const RETENTION = {
  standardDays: 30,
  metadataDays: 30,
  auditedStatsMonths: 36,
};

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const REGION = /^[A-Z]{2}$/;

const isIso = (v: unknown): v is string => typeof v === 'string' && ISO.test(v) && !Number.isNaN(Date.parse(v));
const count = (v: unknown, at: string) => {
  if (v === null) return null;
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) throw Error(`${at}は0以上の整数またはnull`);
  return v;
};
const text = (v: unknown, at: string) => {
  if (v === null) return null;
  if (typeof v !== 'string') throw Error(`${at}は文字列またはnull`);
  return v;
};
const id = (v: unknown, at: string) => {
  if (typeof v !== 'string' || !ID.test(v)) throw Error(`${at}が不正: ${String(v).slice(0, 80)}`);
  return v;
};
const nullableId = (v: unknown, at: string) => v === null ? null : id(v, at);
const time = (v: unknown, at: string) => {
  if (!isIso(v)) throw Error(`${at}はUTCのISO 8601時刻が必要`);
  return v;
};

export function validateVideo(v: any, at = 'video'): VideoSnapshot {
  if (!v || typeof v !== 'object') throw Error(`${at}が必要`);
  const status = v.status;
  if (status !== 'ok' && status !== 'missing') throw Error(`${at}.statusはok/missing`);
  let chart: ChartPlacement | null = null;
  if (v.chart != null) {
    if (!Number.isSafeInteger(v.chart.rank) || v.chart.rank < 1) throw Error(`${at}.chart.rankは1以上の整数`);
    chart = {chartCategoryId: id(v.chart.chartCategoryId, `${at}.chart.chartCategoryId`), rank: v.chart.rank};
  }
  const r: VideoSnapshot = {
    videoId: id(v.videoId, `${at}.videoId`),
    fetchedAt: time(v.fetchedAt, `${at}.fetchedAt`),
    status, chart,
    channelId: nullableId(v.channelId ?? null, `${at}.channelId`),
    categoryId: nullableId(v.categoryId ?? null, `${at}.categoryId`),
    publishedAt: v.publishedAt == null ? null : time(v.publishedAt, `${at}.publishedAt`),
    title: text(v.title ?? null, `${at}.title`),
    viewCount: count(v.viewCount ?? null, `${at}.viewCount`),
    likeCount: count(v.likeCount ?? null, `${at}.likeCount`),
    commentCount: count(v.commentCount ?? null, `${at}.commentCount`),
  };
  if (status === 'missing' && (r.viewCount !== null || r.chart)) throw Error(`${at}: missingの記録は統計・チャート位置を持たない`);
  return r;
}

export function validateChannel(c: any, at = 'channel'): ChannelSnapshot {
  if (!c || typeof c !== 'object') throw Error(`${at}が必要`);
  if (c.status !== 'ok' && c.status !== 'missing') throw Error(`${at}.statusはok/missing`);
  const hidden = c.subscriberCountHidden === true;
  const r: ChannelSnapshot = {
    channelId: id(c.channelId, `${at}.channelId`),
    fetchedAt: time(c.fetchedAt, `${at}.fetchedAt`),
    status: c.status,
    title: text(c.title ?? null, `${at}.title`),
    viewCount: count(c.viewCount ?? null, `${at}.viewCount`),
    subscriberCount: count(c.subscriberCount ?? null, `${at}.subscriberCount`),
    subscriberCountHidden: hidden,
    videoCount: count(c.videoCount ?? null, `${at}.videoCount`),
  };
  if (hidden && r.subscriberCount !== null) throw Error(`${at}: 非公開の登録者数は値を持たない`);
  return r;
}

export function validateBatch(b: any): CollectionBatch {
  if (!b || typeof b !== 'object') throw Error('batchオブジェクトが必要');
  if (b.schema !== BATCH_SCHEMA) throw Error(`未対応のスキーマ: ${String(b.schema)}（${BATCH_SCHEMA}のみ）`);
  if (b.source !== 'synthetic' && b.source !== 'youtube-data-api') throw Error('sourceはsynthetic/youtube-data-api');
  if (typeof b.regionCode !== 'string' || !REGION.test(b.regionCode)) throw Error('regionCodeは2文字の大文字');
  if (!Number.isSafeInteger(b.quotaUnits) || b.quotaUnits < 0) throw Error('quotaUnitsは0以上の整数');
  for (const k of ['charts', 'categories', 'videos', 'channels']) if (!Array.isArray(b[k])) throw Error(`${k}は配列`);
  const startedAt = time(b.startedAt, 'startedAt');
  const completedAt = time(b.completedAt, 'completedAt');
  if (Date.parse(completedAt) < Date.parse(startedAt)) throw Error('completedAtがstartedAtより前');
  const within = (t: string, at: string) => {
    if (Date.parse(t) < Date.parse(startedAt) || Date.parse(t) > Date.parse(completedAt)) throw Error(`${at}が収集期間の外`);
  };
  const videos = b.videos.map((v: any, i: number) => validateVideo(v, `videos[${i}]`));
  const channels = b.channels.map((c: any, i: number) => validateChannel(c, `channels[${i}]`));
  videos.forEach((v: VideoSnapshot, i: number) => within(v.fetchedAt, `videos[${i}].fetchedAt`));
  channels.forEach((c: ChannelSnapshot, i: number) => within(c.fetchedAt, `channels[${i}].fetchedAt`));
  const charts = b.charts.map((c: any, i: number) => {
    const fetchedAt = time(c?.fetchedAt, `charts[${i}].fetchedAt`);
    within(fetchedAt, `charts[${i}].fetchedAt`);
    if (typeof c.complete !== 'boolean') throw Error(`charts[${i}].completeはboolean`);
    return {chartCategoryId: id(c.chartCategoryId, `charts[${i}].chartCategoryId`), fetchedAt, complete: c.complete};
  });
  const categories = b.categories.map((c: any, i: number) => {
    if (typeof c?.title !== 'string' || typeof c.assignable !== 'boolean') throw Error(`categories[${i}]はtitle/assignableが必要`);
    return {categoryId: id(c.categoryId, `categories[${i}].categoryId`), title: c.title, assignable: c.assignable};
  });
  // 同じチャートの順位は重複しない。
  const seen = new Set<string>();
  for (const v of videos) if (v.chart) {
    const k = `${v.chart.chartCategoryId}/${v.fetchedAt}/${v.chart.rank}`;
    if (seen.has(k)) throw Error(`チャート順位が重複: ${k}`);
    seen.add(k);
  }
  return {schema: BATCH_SCHEMA, batchId: id(b.batchId, 'batchId'), source: b.source, regionCode: b.regionCode,
    startedAt, completedAt, quotaUnits: b.quotaUnits, charts, categories, videos, channels};
}

export function validatePolicy(p: any): TrendsPolicy {
  if (!p || typeof p !== 'object') throw Error('policyオブジェクトが必要');
  if (p.profile !== 'standard' && p.profile !== 'audited-derived-metrics') throw Error('profileはstandard/audited-derived-metrics');
  const approvalRef = p.approvalRef ?? null;
  if (approvalRef !== null && (typeof approvalRef !== 'string' || !approvalRef.trim())) throw Error('approvalRefは空でない文字列またはnull');
  if (p.profile === 'audited-derived-metrics' && !approvalRef) throw Error('audited-derived-metricsには承認の参照（approvalRef）が必要');
  if (p.categoryAggregationApproved && p.profile !== 'audited-derived-metrics') throw Error('カテゴリ集計の承認はaudited-derived-metricsでのみ有効');
  return {
    profile: p.profile, approvalRef, categoryAggregationApproved: p.categoryAggregationApproved === true,
    recordedBy: p.recordedBy ?? null, recordedAt: p.recordedAt == null ? null : time(p.recordedAt, 'recordedAt'),
  };
}

// APIデータに派生指標・カテゴリ集計を出してよいか（T131 4章の2）。合成データは常に可。
export function derivedAllowed(source: Source, policy: TrendsPolicy, kind: 'growth' | 'category'): {ok: true} | {ok: false; reason: string} {
  if (source === 'synthetic') return {ok: true};
  if (policy.profile !== 'audited-derived-metrics') {
    return {ok: false, reason: 'YouTube API Services Developer Policies III.E.4.h により、承認（III.L）の記録がないAPIデータから派生指標を作れません'};
  }
  if (kind === 'category' && !policy.categoryAggregationApproved) {
    return {ok: false, reason: 'カテゴリ集計はIII.E.2（事業動向把握目的の集約の禁止）への該当性を人が判断し、categoryAggregationApprovedを記録するまで停止します'};
  }
  return {ok: true};
}

const addMonths = (t: number, months: number) => {
  const d = new Date(t);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.getTime();
};

// 取得時刻から、その記録の統計と統計以外（タイトル等）を保持してよい期限。
export function retentionDeadlines(source: Source, fetchedAt: string, policy: TrendsPolicy): {stats: number; metadata: number} {
  const t = Date.parse(fetchedAt);
  if (source === 'synthetic') return {stats: Infinity, metadata: Infinity};
  if (policy.profile === 'audited-derived-metrics') return {stats: addMonths(t, RETENTION.auditedStatsMonths), metadata: t + RETENTION.metadataDays * DAY_MS};
  const d = t + RETENTION.standardDays * DAY_MS;
  return {stats: d, metadata: d};
}
