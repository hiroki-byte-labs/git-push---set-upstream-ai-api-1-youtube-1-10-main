import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {type CollectionBatch, DEFAULT_POLICY, validateBatch, validatePolicy} from '../src/trends-schema.ts';
import {videoGrowth, channelGrowth, categoryTrend, rawSeries, growthOf, truncationUnit, median, PolicyDenied, type AnalysisOptions} from '../src/trends-metrics.ts';

const load = (name: string): CollectionBatch[] => JSON.parse(readFileSync(`fixtures/trends/${name}`, 'utf8')).batches.map((b: unknown) => validateBatch(b));
const history = load('synthetic-history.json');
const boundary = load('boundary-cases.json');
const opt = (o: Partial<AnalysisOptions> = {}): AnalysisOptions => ({source: 'synthetic', regionCode: 'JP', asOf: '2026-10-08T00:00:00Z', windowDays: 7, ...o});
const byId = <T extends {videoId: string}>(xs: T[], id: string) => xs.find(x => x.videoId === id)!;

test('trends-metrics: 動画の増加はTRENDS-METRICS.mdの手計算例と一致する', () => {
  const g = videoGrowth(history, DEFAULT_POLICY, opt());
  const a = byId(g, 'vidA0000001').views;
  assert.deepEqual([a.delta, a.perDay, a.relative, a.elapsedDays, a.comparable], [7000, 1000, 7, 7, true]);
  assert.equal(a.start?.at, '2026-10-01T00:00:00Z');
  const b = byId(g, 'vidB0000001').views;
  assert.deepEqual([b.delta, b.perDay, b.relative], [1400, 200, 0.28]);
  const c = byId(g, 'vidC0000001').views;
  assert.deepEqual([c.delta, c.perDay, c.relative], [700, 100, null]);
  assert.deepEqual(byId(g, 'vidD0000001').views.reasons, ['missing-latest']);
  assert.equal(byId(g, 'vidD0000001').views.delta, null);
  assert.deepEqual(byId(g, 'vidE0000001').views.reasons, ['insufficient-snapshots']);
  assert.equal(byId(g, 'vidF0000001').categoryId, null);
  // 1日当たりの増加の降順
  assert.deepEqual(g.slice(0, 3).map(x => x.videoId), ['vidA0000001', 'vidB0000001', 'vidC0000001']);
  // 3日窓（10-04基準）は中間の観測を使う
  const w3 = byId(videoGrowth(history, DEFAULT_POLICY, opt({asOf: '2026-10-04T00:00:00Z', windowDays: 3})), 'vidA0000001').views;
  assert.deepEqual([w3.delta, w3.perDay], [3000, 1000]);
});

test('trends-metrics: チャンネルの増加と登録者数の切り捨て誤差', () => {
  const g = channelGrowth(history, DEFAULT_POLICY, opt());
  const x = g.find(c => c.channelId === 'chX')!;
  assert.deepEqual([x.subscribers.delta, x.subscribers.uncertainty], [200, 100]);
  assert.equal(x.views.delta, 8000);
  assert.ok(Math.abs(x.views.perDay! - 8000 / 7) < 1e-9);
  assert.equal(x.videos.delta, 1);
  const y = g.find(c => c.channelId === 'chY')!;
  assert.deepEqual([y.subscribers.delta, y.subscribers.reasons], [null, ['value-unavailable']]);
  assert.equal(y.views.delta, 3000);
  const z = g.find(c => c.channelId === 'chZ')!;
  assert.deepEqual([z.subscribers.delta, z.subscribers.uncertainty], [10, 10]);
  assert.deepEqual([truncationUnit(99), truncationUnit(990), truncationUnit(1000), truncationUnit(12345), truncationUnit(1_234_567)], [1, 1, 10, 100, 10000]);
});

test('trends-metrics: カテゴリ構成比の変化と増加の中央値', () => {
  const t = categoryTrend(history, DEFAULT_POLICY, opt());
  assert.equal(t.at, '2026-10-08T00:00:00Z');
  assert.equal(t.startAt, '2026-10-01T00:00:00Z');
  assert.deepEqual(t.reasons, ['low-sample']);
  const c = Object.fromEntries(t.categories.map(x => [x.categoryId, x]));
  const pts = (id: string) => Math.round(c[id].changePoints! * 1e9) / 1e9;
  assert.deepEqual([c['10'].start?.share, c['10'].end.share, pts('10')], [0.5, 0.4, -10]);
  assert.deepEqual([c['20'].start?.share, c['20'].end.share, pts('20')], [0.25, 0.4, 15]);
  assert.deepEqual([c['27'].end.share, pts('27')], [0, -25]);
  assert.deepEqual([c.unknown.start?.share, c.unknown.end.share, pts('unknown')], [0, 0.2, 20]);
  assert.equal(c['10'].title, 'Music');
  assert.deepEqual([c['10'].medianPerDay, c['10'].momentumSample, c['10'].reasons], [550, 2, ['low-sample']]);
  assert.deepEqual([c['20'].medianPerDay, c['20'].momentumSample], [200, 1]);
  assert.equal(c['27'].medianPerDay, null);
  // チャートが1回しかない時点では変化を出さない
  const one = categoryTrend(history, DEFAULT_POLICY, opt({asOf: '2026-10-05T00:00:00Z'}));
  assert.ok(one.reasons.includes('insufficient-snapshots'));
  assert.ok(one.categories.every(x => x.changePoints === null));
});

test('trends-metrics: 境界例で誤った伸びを出さない', () => {
  const redefined = byId(videoGrowth(boundary, DEFAULT_POLICY, opt({asOf: '2026-08-27T00:00:00Z'})), 'vidR0000001').views;
  assert.deepEqual([redefined.delta, redefined.reasons], [null, ['view-count-redefined']]);
  assert.equal(redefined.start?.value, 100);
  const decreased = byId(videoGrowth(boundary, DEFAULT_POLICY, opt()), 'vidG0000001').views;
  assert.deepEqual([decreased.delta, decreased.reasons], [null, ['count-decreased']]);
  const mismatch = byId(videoGrowth(boundary, DEFAULT_POLICY, opt({asOf: '2026-10-02T00:00:00Z'})), 'vidM0000001').views;
  assert.deepEqual([mismatch.delta, mismatch.reasons], [null, ['interval-mismatch']]);
  const stale = byId(videoGrowth(boundary, DEFAULT_POLICY, opt()), 'vidM0000001').views;
  assert.deepEqual(stale.reasons, ['interval-mismatch', 'stale']);
  assert.equal(stale.dataAgeDays, 6);
  // 基準時刻より後の観測は使わない
  assert.deepEqual(byId(videoGrowth(boundary, DEFAULT_POLICY, opt({asOf: '2026-08-21T00:00:00Z'})), 'vidR0000001').views.reasons, ['insufficient-snapshots']);
  // ゼロ除算・出所の混在
  const zero = growthOf([{at: '2026-10-01T00:00:00Z', source: 'synthetic', status: 'ok', value: 0}, {at: '2026-10-08T00:00:00Z', source: 'synthetic', status: 'ok', value: 0}], opt(), true);
  assert.deepEqual([zero.delta, zero.perDay, zero.relative], [0, 0, null]);
  const mixed = growthOf([{at: '2026-10-01T00:00:00Z', source: 'youtube-data-api', status: 'ok', value: 1}, {at: '2026-10-08T00:00:00Z', source: 'synthetic', status: 'ok', value: 5}], opt(), true);
  assert.deepEqual([mixed.delta, mixed.reasons], [null, ['source-mixed']]);
  // 観測なし・無データ
  assert.deepEqual(videoGrowth([], DEFAULT_POLICY, opt()), []);
  assert.deepEqual(categoryTrend([], DEFAULT_POLICY, opt()).reasons, ['insufficient-snapshots']);
  assert.equal(median([]), null);
  assert.equal(median([3, 1, 2, 10]), 2.5);
});

test('trends-metrics: APIデータの派生指標は承認の記録がなければ停止する', () => {
  const api = history.map(b => ({...b, source: 'youtube-data-api' as const}));
  const o = opt({source: 'youtube-data-api'});
  assert.throws(() => videoGrowth(api, DEFAULT_POLICY, o), PolicyDenied);
  assert.throws(() => channelGrowth(api, DEFAULT_POLICY, o), /III\.E\.4\.h/);
  const audited = validatePolicy({profile: 'audited-derived-metrics', approvalRef: 'case-1'});
  assert.equal(byId(videoGrowth(api, audited, o), 'vidA0000001').views.delta, 7000);
  assert.throws(() => categoryTrend(api, audited, o), /III\.E\.2/);
  const withCategory = validatePolicy({profile: 'audited-derived-metrics', approvalRef: 'case-1', categoryAggregationApproved: true});
  assert.equal(categoryTrend(api, withCategory, o).categories.length, 4);
  // 派生しない取得値の時系列はstandardでも出せる。出所を混ぜない
  const raw = rawSeries(api, o, {videoId: 'vidA0000001'});
  assert.deepEqual(raw.map(p => [p.viewCount, p.chartRank]), [[1000, 1], [4000, null], [8000, 1]]);
  assert.deepEqual(rawSeries(api, opt(), {videoId: 'vidA0000001'}), []);
  assert.deepEqual(rawSeries(history, opt(), {channelId: 'chY'}).map(p => p.subscriberCount), [null, null, null]);
});

test('trends-metrics: 基準時刻の表記（小数秒の有無）で結果が変わらない（T137で見つけた不具合の回帰試験）', () => {
  for (const asOf of ['2026-10-08T00:00:00Z', '2026-10-08T00:00:00.000Z']) {
    const t = categoryTrend(history, DEFAULT_POLICY, opt({asOf}));
    assert.equal(t.at, '2026-10-08T00:00:00Z');
    assert.deepEqual(t.reasons, ['low-sample']);
    const e = byId(videoGrowth(history, DEFAULT_POLICY, opt({asOf})), 'vidE0000001');
    assert.equal(e.categoryId, '20');
  }
});
