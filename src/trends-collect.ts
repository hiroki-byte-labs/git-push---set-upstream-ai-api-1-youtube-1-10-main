// YouTube Data API v3の公開データ収集（T134）。使うのは videoCategories.list・videos.list・channels.list の読み取りだけ（T131）。
// 送信前にクォータを見積り、上限を越える計画は送らない。APIキーは環境変数から注入し、出力に出さない。
import {readFileSync} from 'node:fs';
import {
  BATCH_SCHEMA, type CategoryRecord, type ChannelSnapshot, type CollectionBatch, type Source, type VideoSnapshot, validateBatch,
} from './trends-schema.ts';

export const API_BASE = 'https://www.googleapis.com/youtube/v3';
export const API_KEY_ENV = 'YOUTUBE_API_KEY';
export const DEFAULT_DAILY_LIMIT = 10_000;
export const DEFAULT_RUN_LIMIT = 200;
const IDS_PER_REQUEST = 50; // 公式に上限の記載なし（T131）。従来の慣行に合わせる。
const MOST_POPULAR_PAGES = 4; // 50件×4ページ

export type Endpoint = 'videoCategories' | 'videos' | 'channels';
export type HttpResponse = {status: number; body: any};
export type Transport = (endpoint: Endpoint, params: Record<string, string>) => Promise<HttpResponse>;

export type ErrorKind = 'quota' | 'auth' | 'transient' | 'invalid' | 'budget';
export class CollectError extends Error {
  kind: ErrorKind;
  unitsUsed: number;
  constructor(kind: ErrorKind, message: string, unitsUsed: number) {
    super(message);
    this.kind = kind;
    this.unitsUsed = unitsUsed;
  }
}

export type CollectPlan = {
  regionCode: string;
  chartCategoryIds: string[];
  maxPages: number;
  trackVideoIds: string[];
  trackChannelIds: string[];
  includeChannels: boolean;
  includeCategories: boolean;
};

export type Budget = {dailyLimit: number; runLimit: number; usedToday: number};

// 送信前の最大見積り（再試行は含まない。再試行の分は実行中に runLimit で止める）。
export function estimateUnits(plan: CollectPlan): number {
  const charts = plan.chartCategoryIds.length * plan.maxPages;
  const videoIds = new Set(plan.trackVideoIds).size;
  const maxVideos = plan.chartCategoryIds.length * plan.maxPages * IDS_PER_REQUEST + videoIds;
  const channels = plan.includeChannels ? Math.ceil((maxVideos + new Set(plan.trackChannelIds).size) / IDS_PER_REQUEST) : 0;
  return (plan.includeCategories ? 1 : 0) + charts + Math.ceil(videoIds / IDS_PER_REQUEST) + channels;
}

export function checkBudget(plan: CollectPlan, budget: Budget): {ok: true; estimate: number} | {ok: false; estimate: number; reason: string} {
  const estimate = estimateUnits(plan);
  if (estimate > budget.runLimit) return {ok: false, estimate, reason: `見積り${estimate} unitが1回の上限${budget.runLimit}を超えます`};
  if (budget.usedToday + estimate > budget.dailyLimit) {
    return {ok: false, estimate, reason: `本日の使用${budget.usedToday} + 見積り${estimate} unitが日次上限${budget.dailyLimit}を超えます（太平洋時間0時にリセット）`};
  }
  return {ok: true, estimate};
}

export function validatePlan(p: CollectPlan): CollectPlan {
  if (!/^[A-Z]{2}$/.test(p.regionCode)) throw Error('regionCodeは2文字の大文字');
  if (!Number.isSafeInteger(p.maxPages) || p.maxPages < 1 || p.maxPages > MOST_POPULAR_PAGES) throw Error(`maxPagesは1〜${MOST_POPULAR_PAGES}`);
  for (const id of [...p.chartCategoryIds, ...p.trackVideoIds, ...p.trackChannelIds]) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw Error(`IDが不正: ${id.slice(0, 80)}`);
  }
  if (!p.chartCategoryIds.length && !p.trackVideoIds.length && !p.trackChannelIds.length) throw Error('取得対象がありません');
  return p;
}

const redactor = (secret: string | undefined) => (s: string) => secret ? s.split(secret).join('[REDACTED]') : s;

// 実接続。キーはURLにだけ入れ、例外やログに出す前に伏せる。
export function liveTransport(apiKey: string, timeoutMs = 15_000, fetchImpl: typeof fetch = fetch): Transport {
  if (!apiKey) throw Error(`${API_KEY_ENV}が未設定です`);
  const redact = redactor(apiKey);
  return async (endpoint, params) => {
    const url = new URL(`${API_BASE}/${endpoint}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set('key', apiKey);
    try {
      const res = await fetchImpl(url, {signal: AbortSignal.timeout(timeoutMs), headers: {accept: 'application/json'}});
      const text = await res.text();
      let body: any = null;
      try { body = JSON.parse(text); } catch { body = {error: {message: redact(text.slice(0, 200))}}; }
      return {status: res.status, body};
    } catch (e) {
      // ネットワーク障害・タイムアウトは一時障害として扱う。
      return {status: 0, body: {error: {message: redact(String((e as Error).message ?? e))}}};
    }
  };
}

// 模擬接続。要求をキーにして固定レスポンスを返す（fixtures/trends/mock-api.json）。
export function requestKey(endpoint: Endpoint, params: Record<string, string>): string {
  const q = Object.entries(params).filter(([k]) => k !== 'key' && k !== 'part').sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('&');
  return `${endpoint}?${q}`;
}

export function fixtureTransport(responses: Record<string, HttpResponse | HttpResponse[]>): Transport & {calls: string[]} {
  const calls: string[] = [];
  const counters = new Map<string, number>();
  const t = (async (endpoint: Endpoint, params: Record<string, string>) => {
    const key = requestKey(endpoint, params);
    calls.push(key);
    const r = responses[key];
    if (!r) return {status: 404, body: {error: {errors: [{reason: 'fixtureNotFound'}], message: `模擬レスポンスなし: ${key}`}}};
    if (!Array.isArray(r)) return r;
    const i = counters.get(key) ?? 0;
    counters.set(key, i + 1);
    return r[Math.min(i, r.length - 1)];
  }) as Transport & {calls: string[]};
  t.calls = calls;
  return t;
}

export function loadFixtureTransport(path: string) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  if (!raw?.responses || typeof raw.responses !== 'object') throw Error(`${path}: responsesがありません`);
  return fixtureTransport(raw.responses);
}

const reasonOf = (body: any): string => body?.error?.errors?.[0]?.reason ?? body?.error?.status ?? '';

// HTTP応答の分類（T131 2章）。quotaExceeded等は上限、認証・設定の誤りは停止、429/5xx/通信障害は再試行可能。
export function classify(res: HttpResponse): ErrorKind | null {
  if (res.status >= 200 && res.status < 300) return null;
  const reason = reasonOf(res.body);
  if (['quotaExceeded', 'dailyLimitExceeded', 'dailyLimitExceededUnreg'].includes(reason)) return 'quota';
  if (res.status === 0 || res.status === 429 || res.status >= 500 || ['rateLimitExceeded', 'userRateLimitExceeded', 'backendError'].includes(reason)) return 'transient';
  if (res.status === 401 || res.status === 403 || ['keyInvalid', 'keyExpired', 'accessNotConfigured', 'ipRefererBlocked', 'forbidden'].includes(reason)) return 'auth';
  return 'invalid';
}

export type CollectOptions = {
  transport: Transport;
  source: Source;
  budget: Budget;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
  secret?: string;
  log?: (line: string) => void;
};

const int = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
};
const str = (v: unknown) => typeof v === 'string' ? v : null;
const iso = (v: unknown) => typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString().replace('.000Z', 'Z') : null;

function toVideo(item: any, fetchedAt: string, chart: VideoSnapshot['chart']): VideoSnapshot {
  return {
    videoId: String(item.id), fetchedAt, status: 'ok', chart,
    channelId: str(item.snippet?.channelId), categoryId: str(item.snippet?.categoryId), publishedAt: iso(item.snippet?.publishedAt),
    title: str(item.snippet?.title),
    viewCount: int(item.statistics?.viewCount), likeCount: int(item.statistics?.likeCount), commentCount: int(item.statistics?.commentCount),
  };
}

function toChannel(item: any, fetchedAt: string): ChannelSnapshot {
  const hidden = item.statistics?.hiddenSubscriberCount === true;
  return {
    channelId: String(item.id), fetchedAt, status: 'ok', title: str(item.snippet?.title),
    viewCount: int(item.statistics?.viewCount), subscriberCount: hidden ? null : int(item.statistics?.subscriberCount),
    subscriberCountHidden: hidden, videoCount: int(item.statistics?.videoCount),
  };
}

const missingVideo = (videoId: string, fetchedAt: string): VideoSnapshot => ({
  videoId, fetchedAt, status: 'missing', chart: null, channelId: null, categoryId: null, publishedAt: null, title: null, viewCount: null, likeCount: null, commentCount: null,
});
const missingChannel = (channelId: string, fetchedAt: string): ChannelSnapshot => ({
  channelId, fetchedAt, status: 'missing', title: null, viewCount: null, subscriberCount: null, subscriberCountHidden: false, videoCount: null,
});

const chunks = <T>(xs: T[], n: number) => Array.from({length: Math.ceil(xs.length / n)}, (_, i) => xs.slice(i * n, i * n + n));
const stamp = (d: Date) => d.toISOString().replace(/\.\d+Z$/, 'Z');

// 計画に従って収集し、1つのbatchを返す。途中で失敗したらbatchを返さず、使ったunit数を付けて例外にする（既存の履歴は変更しない）。
export async function collect(planInput: CollectPlan, opt: CollectOptions): Promise<{batch: CollectionBatch; unitsUsed: number; estimate: number}> {
  const plan = validatePlan(planInput);
  const budget = checkBudget(plan, opt.budget);
  if (!budget.ok) throw new CollectError('budget', budget.reason, 0);
  const now = opt.now ?? (() => new Date());
  const sleep = opt.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
  const maxRetries = opt.maxRetries ?? 2;
  const redact = redactor(opt.secret);
  const log = opt.log ?? (() => {});
  let units = 0;

  const call = async (endpoint: Endpoint, params: Record<string, string>) => {
    for (let attempt = 0; ; attempt++) {
      // 無効なリクエストも最低1 unitを消費する（T131）。送る前に上限を確かめる。
      if (units + 1 > opt.budget.runLimit || opt.budget.usedToday + units + 1 > opt.budget.dailyLimit) {
        throw new CollectError('budget', `再試行を含めた使用量が上限に達したため停止しました（使用${units} unit）`, units);
      }
      units++;
      const res = await opt.transport(endpoint, params);
      const kind = classify(res);
      if (!kind) return res.body;
      const detail = redact(`${endpoint} HTTP ${res.status} ${reasonOf(res.body)} ${String(res.body?.error?.message ?? '').slice(0, 200)}`.trim());
      if (kind === 'transient' && attempt < maxRetries) {
        log(`一時障害、再試行 ${attempt + 1}/${maxRetries}: ${detail}`);
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      const label = {quota: 'クォータ上限', auth: '認証・設定の誤り', transient: '一時障害（再試行上限）', invalid: '不正な要求', budget: '予算'}[kind];
      throw new CollectError(kind, `${label}で停止しました: ${detail}`, units);
    }
  };

  const startedAt = stamp(now());
  const categories: CategoryRecord[] = [];
  const charts: CollectionBatch['charts'] = [];
  const videos: VideoSnapshot[] = [];
  const channels: ChannelSnapshot[] = [];
  const fetchedVideoIds = new Set<string>();

  if (plan.includeCategories) {
    const body = await call('videoCategories', {part: 'snippet', regionCode: plan.regionCode, hl: 'ja'});
    for (const c of body.items ?? []) categories.push({categoryId: String(c.id), title: String(c.snippet?.title ?? ''), assignable: c.snippet?.assignable === true});
  }

  for (const chartCategoryId of plan.chartCategoryIds) {
    // 同じチャートの全ページは最初のページの時刻で記録する（構成比を1時点として扱うため）。
    const fetchedAt = stamp(now());
    let pageToken = '';
    let rank = 0;
    let complete = false;
    for (let page = 0; page < plan.maxPages; page++) {
      const params: Record<string, string> = {part: 'snippet,statistics', chart: 'mostPopular', regionCode: plan.regionCode, videoCategoryId: chartCategoryId, maxResults: '50'};
      if (pageToken) params.pageToken = pageToken;
      const body = await call('videos', params);
      for (const item of body.items ?? []) {
        videos.push(toVideo(item, fetchedAt, {chartCategoryId, rank: ++rank}));
        fetchedVideoIds.add(String(item.id));
      }
      pageToken = typeof body.nextPageToken === 'string' ? body.nextPageToken : '';
      if (!pageToken) { complete = true; break; }
    }
    charts.push({chartCategoryId, fetchedAt, complete});
  }

  const track = [...new Set(plan.trackVideoIds)].filter(id => !fetchedVideoIds.has(id));
  for (const ids of chunks(track, IDS_PER_REQUEST)) {
    const fetchedAt = stamp(now());
    const body = await call('videos', {part: 'snippet,statistics', id: ids.join(',')});
    const got = new Map<string, any>((body.items ?? []).map((i: any) => [String(i.id), i]));
    for (const id of ids) videos.push(got.has(id) ? toVideo(got.get(id), fetchedAt, null) : missingVideo(id, fetchedAt));
  }

  if (plan.includeChannels || plan.trackChannelIds.length) {
    const ids = [...new Set([...(plan.includeChannels ? videos.map(v => v.channelId).filter((x): x is string => !!x) : []), ...plan.trackChannelIds])];
    for (const group of chunks(ids, IDS_PER_REQUEST)) {
      const fetchedAt = stamp(now());
      const body = await call('channels', {part: 'snippet,statistics', id: group.join(',')});
      const got = new Map<string, any>((body.items ?? []).map((i: any) => [String(i.id), i]));
      for (const id of group) channels.push(got.has(id) ? toChannel(got.get(id), fetchedAt) : missingChannel(id, fetchedAt));
    }
  }

  const completedAt = stamp(now());
  const batch = validateBatch({
    schema: BATCH_SCHEMA, batchId: `${opt.source === 'synthetic' ? 'syn' : 'api'}-${plan.regionCode}-${startedAt.replace(/[-:]/g, '')}`,
    source: opt.source, regionCode: plan.regionCode, startedAt, completedAt, quotaUnits: units, charts, categories, videos, channels,
  });
  return {batch, unitsUsed: units, estimate: budget.estimate};
}
