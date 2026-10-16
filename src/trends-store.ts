// トレンド分析のローカル履歴（T135）。1つのJSONファイルに収集batchを追記し、過去の観測は上書きしない。
// 保持期限はT131（docs/RESEARCH-TRENDS-API.md）の条件を retentionDeadlines で適用する。運用は docs/TRENDS-OPERATIONS.md。
import {closeSync, copyFileSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {
  type CollectionBatch, type TrendsPolicy, type VideoSnapshot, type ChannelSnapshot,
  DEFAULT_POLICY, retentionDeadlines, validateBatch, validatePolicy,
} from './trends-schema.ts';

export const STORE_SCHEMA = 'yt-trends-store/v1';
export const DEFAULT_STORE_DIR = 'work/trends';

export type DeletionRecord = {
  at: string;
  reason: 'retention' | 'user-request';
  removedVideos: number;
  removedChannels: number;
  strippedMetadata: number;
  removedBatches: number;
};

export type TrendsStore = {
  schema: typeof STORE_SCHEMA;
  createdAt: string;
  policy: TrendsPolicy;
  batches: CollectionBatch[];
  deletions: DeletionRecord[];
  // 太平洋時間の日付ごとの使用unit（クォータのリセットは太平洋時間0時）。
  quotaLedger: Record<string, number>;
};

export class StoreError extends Error {}

const FILE = 'store.json';
const BACKUP = 'store.json.bak';
const LOCK = 'store.lock';

export function emptyStore(now: Date): TrendsStore {
  return {schema: STORE_SCHEMA, createdAt: now.toISOString(), policy: DEFAULT_POLICY, batches: [], deletions: [], quotaLedger: {}};
}

export function parseStore(text: string): TrendsStore {
  let raw: any;
  try { raw = JSON.parse(text); } catch (e) { throw new StoreError(`履歴ファイルがJSONとして読めません: ${(e as Error).message}`); }
  if (raw?.schema !== STORE_SCHEMA) {
    throw new StoreError(`履歴のスキーマ ${String(raw?.schema)} は未対応です（${STORE_SCHEMA}のみ）。移行手順なしに読み書きしません`);
  }
  if (!Array.isArray(raw.batches) || !Array.isArray(raw.deletions) || typeof raw.quotaLedger !== 'object') throw new StoreError('履歴の構造が不正です');
  return {
    schema: STORE_SCHEMA, createdAt: String(raw.createdAt), policy: validatePolicy(raw.policy),
    batches: raw.batches.map((b: unknown) => validateBatch(b)), deletions: raw.deletions, quotaLedger: raw.quotaLedger,
  };
}

// 読み込み。本体が壊れていればバックアップを試し、どちらも読めなければ書き込まずに停止する。
export function loadStore(dir: string, now = new Date()): {store: TrendsStore; recoveredFromBackup: boolean} {
  const file = join(dir, FILE);
  if (!existsSync(file)) {
    if (existsSync(join(dir, BACKUP))) throw new StoreError(`${file} がなくバックアップだけがあります。復旧手順（docs/TRENDS-OPERATIONS.md）を確認してください`);
    return {store: emptyStore(now), recoveredFromBackup: false};
  }
  try {
    return {store: parseStore(readFileSync(file, 'utf8')), recoveredFromBackup: false};
  } catch (e) {
    if (e instanceof StoreError && /スキーマ/.test(e.message)) throw e;
    const backup = join(dir, BACKUP);
    if (!existsSync(backup)) throw new StoreError(`履歴が壊れていてバックアップもありません: ${(e as Error).message}`);
    try {
      return {store: parseStore(readFileSync(backup, 'utf8')), recoveredFromBackup: true};
    } catch (e2) {
      throw new StoreError(`履歴とバックアップの両方が読めません: ${(e2 as Error).message}`);
    }
  }
}

const writeDurable = (path: string, text: string) => {
  const fd = openSync(path, 'w');
  try { writeSync(fd, text); fsyncSync(fd); } finally { closeSync(fd); }
};

// 原子的な保存。一時ファイルに書いてfsyncし、現在の本体をバックアップへ写してから置き換える。
export function saveStore(dir: string, store: TrendsStore) {
  mkdirSync(dir, {recursive: true});
  const file = join(dir, FILE);
  const tmp = join(dir, `${FILE}.tmp-${process.pid}`);
  writeDurable(tmp, JSON.stringify(store, null, 1) + '\n');
  // 書いたものが読めることを確かめてから置き換える。
  parseStore(readFileSync(tmp, 'utf8'));
  if (existsSync(file)) {
    try { parseStore(readFileSync(file, 'utf8')); copyFileSync(file, join(dir, BACKUP)); } catch { /* 壊れた本体はバックアップにしない */ }
  }
  renameSync(tmp, file);
}

// 同時に2つの収集・更新が走らないようにする排他。
function acquireLock(dir: string): () => void {
  mkdirSync(dir, {recursive: true});
  const lock = join(dir, LOCK);
  let fd: number;
  try { fd = openSync(lock, 'wx'); } catch {
    throw new StoreError(`${lock} があります。別の処理が実行中か、異常終了の残りです（確認して手で削除）`);
  }
  writeSync(fd, `${process.pid}\n`);
  closeSync(fd);
  return () => rmSync(lock, {force: true});
}

export function withLock<T>(dir: string, fn: () => T): T {
  const release = acquireLock(dir);
  try { return fn(); } finally { release(); }
}

export async function withLockAsync<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const release = acquireLock(dir);
  try { return await fn(); } finally { release(); }
}

const videoKey = (source: string, region: string, v: VideoSnapshot) => `${source}/${region}/v/${v.videoId}/${v.fetchedAt}/${v.chart ? `${v.chart.chartCategoryId}#${v.chart.rank}` : '-'}`;
const channelKey = (source: string, region: string, c: ChannelSnapshot) => `${source}/${region}/c/${c.channelId}/${c.fetchedAt}`;

export type ImportResult = {store: TrendsStore; addedVideos: number; addedChannels: number; duplicates: number; skippedBatch: boolean};

// 取り込み。同じbatchId・同じ観測（出所/地域/対象/取得時刻）は重複として除く。同じ観測で値が違えば上書きせず停止する。
export function importBatch(store: TrendsStore, input: unknown): ImportResult {
  const batch = validateBatch(input);
  const existing = store.batches.find(b => b.batchId === batch.batchId);
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(batch)) throw new StoreError(`batchId ${batch.batchId} は内容の異なる取込済みのbatchです。上書きしません`);
    return {store, addedVideos: 0, addedChannels: 0, duplicates: batch.videos.length + batch.channels.length, skippedBatch: true};
  }
  const known = new Map<string, string>();
  for (const b of store.batches) {
    for (const v of b.videos) known.set(videoKey(b.source, b.regionCode, v), JSON.stringify(v));
    for (const c of b.channels) known.set(channelKey(b.source, b.regionCode, c), JSON.stringify(c));
  }
  let duplicates = 0;
  const keep = <T>(items: T[], key: (x: T) => string) => items.filter(x => {
    const k = key(x);
    const prev = known.get(k);
    if (prev === undefined) { known.set(k, JSON.stringify(x)); return true; }
    if (prev !== JSON.stringify(x)) throw new StoreError(`同じ観測 ${k} に異なる値があります。過去の記録を上書きしません`);
    duplicates++;
    return false;
  });
  const videos = keep(batch.videos, v => videoKey(batch.source, batch.regionCode, v));
  const channels = keep(batch.channels, c => channelKey(batch.source, batch.regionCode, c));
  if (!videos.length && !channels.length && batch.videos.length + batch.channels.length > 0) {
    return {store, addedVideos: 0, addedChannels: 0, duplicates, skippedBatch: true};
  }
  const next = {...batch, videos, channels};
  const batches = [...store.batches, next].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt) || a.batchId.localeCompare(b.batchId));
  return {store: {...store, batches}, addedVideos: videos.length, addedChannels: channels.length, duplicates, skippedBatch: false};
}

// 保持期限を過ぎたデータを削除する。統計の期限切れは記録ごと削除、統計以外（タイトル等）の期限切れは値を消す。
export function purgeExpired(store: TrendsStore, now: Date): {store: TrendsStore; record: DeletionRecord} {
  const t = now.getTime();
  let removedVideos = 0, removedChannels = 0, strippedMetadata = 0, removedBatches = 0;
  const batches: CollectionBatch[] = [];
  for (const b of store.batches) {
    const videos: VideoSnapshot[] = [];
    for (const v of b.videos) {
      const d = retentionDeadlines(b.source, v.fetchedAt, store.policy);
      if (t >= d.stats) { removedVideos++; continue; }
      if (t >= d.metadata && (v.title !== null || v.publishedAt !== null || v.categoryId !== null)) {
        strippedMetadata++;
        videos.push({...v, title: null, publishedAt: null, categoryId: null});
      } else videos.push(v);
    }
    const channels: ChannelSnapshot[] = [];
    for (const c of b.channels) {
      const d = retentionDeadlines(b.source, c.fetchedAt, store.policy);
      if (t >= d.stats) { removedChannels++; continue; }
      if (t >= d.metadata && c.title !== null) { strippedMetadata++; channels.push({...c, title: null}); } else channels.push(c);
    }
    const metaExpired = t >= retentionDeadlines(b.source, b.completedAt, store.policy).metadata;
    const categories = metaExpired ? [] : b.categories;
    if (metaExpired && b.categories.length) strippedMetadata++;
    if (!videos.length && !channels.length && (b.videos.length || b.channels.length)) { removedBatches++; continue; }
    batches.push({...b, videos, channels, categories});
  }
  const record: DeletionRecord = {at: now.toISOString(), reason: 'retention', removedVideos, removedChannels, strippedMetadata, removedBatches};
  const changed = removedVideos + removedChannels + strippedMetadata + removedBatches > 0;
  return {store: {...store, batches, deletions: changed ? [...store.deletions, record] : store.deletions}, record};
}

// 利用者の指示による削除（出所・対象を指定）。III.E.4.gの削除要求にも使う。
export function deleteRecords(store: TrendsStore, now: Date, filter: {source?: string; videoId?: string; channelId?: string}): {store: TrendsStore; record: DeletionRecord} {
  let removedVideos = 0, removedChannels = 0, removedBatches = 0;
  const batches: CollectionBatch[] = [];
  for (const b of store.batches) {
    const all = !filter.videoId && !filter.channelId;
    const sourceMatch = !filter.source || b.source === filter.source;
    const videos = b.videos.filter(v => {
      const hit = sourceMatch && (all || v.videoId === filter.videoId || (filter.channelId !== undefined && v.channelId === filter.channelId));
      if (hit) removedVideos++;
      return !hit;
    });
    const channels = b.channels.filter(c => {
      const hit = sourceMatch && (all || c.channelId === filter.channelId);
      if (hit) removedChannels++;
      return !hit;
    });
    if (!videos.length && !channels.length && (b.videos.length || b.channels.length)) { removedBatches++; continue; }
    batches.push({...b, videos, channels});
  }
  const record: DeletionRecord = {at: now.toISOString(), reason: 'user-request', removedVideos, removedChannels, strippedMetadata: 0, removedBatches};
  return {store: {...store, batches, deletions: [...store.deletions, record]}, record};
}

// ポリシーの変更。期限が短くなる変更は呼び出し側で直後にpurgeExpiredする。
export function setPolicy(store: TrendsStore, policy: unknown): TrendsStore {
  return {...store, policy: validatePolicy(policy)};
}

// 書き出し（バックアップ・移行用）。出所の区別を保ったまま、指定先へ原子的に書く。
export function exportStore(store: TrendsStore, path: string) {
  mkdirSync(dirname(path), {recursive: true});
  const tmp = `${path}.tmp-${process.pid}`;
  writeDurable(tmp, JSON.stringify(store, null, 1) + '\n');
  renameSync(tmp, path);
}

// 太平洋時間の日付（クォータの日の区切り）。
export function quotaDay(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'}).format(now);
}

export function recordQuota(store: TrendsStore, now: Date, units: number): TrendsStore {
  const day = quotaDay(now);
  // 当日と前日だけ残す（古い日の使用量は不要）。
  const ledger: Record<string, number> = {};
  for (const [d, u] of Object.entries(store.quotaLedger)) if (d >= quotaDay(new Date(now.getTime() - 86_400_000))) ledger[d] = u;
  ledger[day] = (ledger[day] ?? 0) + units;
  return {...store, quotaLedger: ledger};
}
