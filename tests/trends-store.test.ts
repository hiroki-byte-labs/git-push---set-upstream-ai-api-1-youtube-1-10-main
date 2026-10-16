import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  emptyStore, importBatch, loadStore, saveStore, purgeExpired, deleteRecords, setPolicy, exportStore,
  withLock, recordQuota, quotaDay, StoreError, STORE_SCHEMA,
} from '../src/trends-store.ts';

const batches = () => JSON.parse(readFileSync('fixtures/trends/synthetic-history.json', 'utf8')).batches;
const tmp = () => mkdtempSync(join(tmpdir(), 'trends-store-'));
const now = new Date('2026-10-13T00:00:00Z');
// 合成データをAPIデータとして扱った複製（保持期限の試験用。実APIの値ではない）。
const asApi = (b: any, fetchedShiftDays = 0) => {
  const shift = (t: string) => new Date(Date.parse(t) + fetchedShiftDays * 86_400_000).toISOString();
  return {...structuredClone(b), batchId: `api-${b.batchId}`, source: 'youtube-data-api', startedAt: shift(b.startedAt), completedAt: shift(b.completedAt),
    charts: b.charts.map((c: any) => ({...c, fetchedAt: shift(c.fetchedAt)})),
    videos: b.videos.map((v: any) => ({...v, fetchedAt: shift(v.fetchedAt)})),
    channels: b.channels.map((c: any) => ({...c, fetchedAt: shift(c.fetchedAt)}))};
};

test('trends-store: 取込・再取込で重複せず、過去の観測を上書きしない', () => {
  let s = emptyStore(now);
  for (const b of batches()) s = importBatch(s, b).store;
  assert.equal(s.batches.length, 3);
  const again = importBatch(s, batches()[0]);
  assert.equal(again.skippedBatch, true);
  assert.equal(again.store.batches.length, 3);
  // 別batchIdで同じ観測を含む → 重複として除く
  const copy = {...batches()[0], batchId: 'syn-copy'};
  const r = importBatch(s, copy);
  assert.equal(r.addedVideos, 0);
  assert.equal(r.skippedBatch, true);
  // 同じ観測で値が違う → 停止
  const changed = structuredClone(copy);
  changed.batchId = 'syn-changed';
  changed.videos[0].viewCount = 999999;
  assert.throws(() => importBatch(s, changed), StoreError);
  // 同じbatchIdで内容が違う → 停止
  const sameId = structuredClone(batches()[0]);
  sameId.videos[0].viewCount = 1;
  assert.throws(() => importBatch(s, sameId), /上書きしません/);
  assert.equal(s.batches[0].videos[0].viewCount, 1000);
});

test('trends-store: 保存は原子的で、壊れた本体はバックアップから復旧する', () => {
  const dir = tmp();
  let s = emptyStore(now);
  s = importBatch(s, batches()[0]).store;
  saveStore(dir, s);
  s = importBatch(s, batches()[1]).store;
  saveStore(dir, s);
  assert.equal(loadStore(dir).store.batches.length, 2);
  assert.equal(existsSync(join(dir, 'store.json.bak')), true);
  // 書込中断（途中で切れた本体）
  const text = readFileSync(join(dir, 'store.json'), 'utf8');
  writeFileSync(join(dir, 'store.json'), text.slice(0, text.length / 2));
  const recovered = loadStore(dir);
  assert.equal(recovered.recoveredFromBackup, true);
  assert.equal(recovered.store.batches.length, 1);
  // 両方壊れている → 停止
  writeFileSync(join(dir, 'store.json.bak'), '{');
  assert.throws(() => loadStore(dir), /両方が読めません/);
  // 一時ファイルが残らない
  assert.deepEqual(readdirSync(dir).filter(n => n.includes('.tmp-')), []);
});

test('trends-store: スキーマ版の変更を検知して読み書きしない', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'store.json'), JSON.stringify({...emptyStore(now), schema: 'yt-trends-store/v2'}));
  writeFileSync(join(dir, 'store.json.bak'), JSON.stringify(emptyStore(now)));
  assert.throws(() => loadStore(dir), /スキーマ.*未対応/);
  assert.equal(STORE_SCHEMA, 'yt-trends-store/v1');
});

test('trends-store: standardではAPIデータを取得から30日で削除し、合成データは残す', () => {
  let s = emptyStore(now);
  for (const b of batches()) s = importBatch(s, b).store;
  // 2026-10-01/04/08取得のAPIデータ
  for (const b of batches()) s = importBatch(s, asApi(b)).store;
  const at30 = purgeExpired(s, new Date('2026-10-31T00:00:00Z'));
  assert.equal(at30.record.removedBatches, 1); // 10-01のAPI batchだけ
  assert.equal(at30.store.batches.filter(b => b.source === 'youtube-data-api').length, 2);
  assert.equal(at30.store.batches.filter(b => b.source === 'synthetic').length, 3);
  const later = purgeExpired(at30.store, new Date('2026-12-01T00:00:00Z'));
  assert.equal(later.store.batches.filter(b => b.source === 'youtube-data-api').length, 0);
  assert.equal(later.store.deletions.length, 2);
  // 削除済みに対する再実行は記録を増やさない
  assert.equal(purgeExpired(later.store, new Date('2026-12-02T00:00:00Z')).store.deletions.length, 2);
});

test('trends-store: 承認後は統計を残し、タイトル等だけ30日で消す', () => {
  let s = setPolicy(emptyStore(now), {profile: 'audited-derived-metrics', approvalRef: 'case-1'});
  s = importBatch(s, asApi(batches()[0])).store;
  const r = purgeExpired(s, new Date('2026-11-15T00:00:00Z'));
  const v = r.store.batches[0].videos[0];
  assert.equal(v.viewCount, 1000);
  assert.equal(v.title, null);
  assert.equal(v.categoryId, null);
  assert.equal(r.store.batches[0].channels[0].title, null);
  assert.deepEqual(r.store.batches[0].categories, []);
  // 36か月で統計も削除
  assert.equal(purgeExpired(r.store, new Date('2029-10-01T00:00:00Z')).store.batches.length, 0);
  // standardへ戻すと30日の条件に戻る
  const back = setPolicy(s, {profile: 'standard'});
  assert.equal(purgeExpired(back, new Date('2026-11-15T00:00:00Z')).store.batches.length, 0);
});

test('trends-store: 指定した動画・チャンネル・出所を削除できる', () => {
  let s = emptyStore(now);
  for (const b of batches()) s = importBatch(s, b).store;
  const v = deleteRecords(s, now, {videoId: 'vidA0000001'});
  assert.equal(v.record.removedVideos, 3);
  assert.equal(v.store.batches.flatMap(b => b.videos).some(x => x.videoId === 'vidA0000001'), false);
  const c = deleteRecords(s, now, {channelId: 'chX'});
  assert.equal(c.record.removedChannels, 3);
  assert.equal(c.store.batches.flatMap(b => b.videos).some(x => x.channelId === 'chX'), false);
  const all = deleteRecords(s, now, {source: 'synthetic'});
  assert.equal(all.store.batches.length, 0);
  assert.equal(all.store.deletions.at(-1)?.reason, 'user-request');
});

test('trends-store: 排他・書き出し・クォータ台帳', () => {
  const dir = tmp();
  assert.throws(() => withLock(dir, () => withLock(dir, () => 0)), /store\.lock/);
  assert.equal(withLock(dir, () => 42), 42);
  const s = importBatch(emptyStore(now), batches()[0]).store;
  const out = join(dir, 'export', 'trends.json');
  exportStore(s, out);
  assert.equal(JSON.parse(readFileSync(out, 'utf8')).batches[0].source, 'synthetic');
  // 2026-10-13T06:00Zは太平洋時間で10-12
  const t = new Date('2026-10-13T06:00:00Z');
  assert.equal(quotaDay(t), '2026-10-12');
  let q = recordQuota(s, t, 5);
  q = recordQuota(q, t, 3);
  assert.equal(q.quotaLedger['2026-10-12'], 8);
  q = recordQuota(q, new Date('2026-10-15T08:00:00Z'), 1);
  assert.deepEqual(Object.keys(q.quotaLedger), ['2026-10-15']);
});
