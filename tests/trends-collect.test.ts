import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collect, estimateUnits, checkBudget, classify, fixtureTransport, loadFixtureTransport, liveTransport, requestKey,
  CollectError, type CollectPlan, type HttpResponse,
} from '../src/trends-collect.ts';

const plan = (o: Partial<CollectPlan> = {}): CollectPlan => ({
  regionCode: 'JP', chartCategoryIds: ['0'], maxPages: 2, trackVideoIds: ['mockVid0009', 'mockGone001'], trackChannelIds: [],
  includeChannels: true, includeCategories: true, ...o,
});
const budget = {dailyLimit: 10_000, runLimit: 200, usedToday: 0};
// 1回呼ぶごとに1秒進む時計
const clock = () => { let t = Date.parse('2026-10-13T00:00:00Z'); return () => new Date((t += 1000)); };
const noSleep = async () => {};
const err = (status: number, reason: string, message = ''): HttpResponse => ({status, body: {error: {errors: [{reason}], message}}});

test('trends-collect: 模擬レスポンスからページング・追跡・欠測・チャンネルを収集する', async () => {
  const transport = loadFixtureTransport('fixtures/trends/mock-api.json');
  const r = await collect(plan(), {transport, source: 'synthetic', budget, now: clock(), sleep: noSleep});
  assert.equal(r.unitsUsed, 5); // カテゴリ1 + チャート2ページ + id指定1 + チャンネル1
  assert.equal(r.batch.quotaUnits, 5);
  assert.equal(r.batch.source, 'synthetic');
  assert.match(r.batch.batchId, /^syn-JP-/);
  assert.deepEqual(r.batch.charts.map(c => [c.chartCategoryId, c.complete]), [['0', true]]);
  const chart = r.batch.videos.filter(v => v.chart);
  assert.deepEqual(chart.map(v => [v.videoId, v.chart!.rank]), [['mockVid0001', 1], ['mockVid0002', 2], ['mockVid0003', 3]]);
  assert.ok(chart.every(v => v.fetchedAt === r.batch.charts[0].fetchedAt));
  assert.equal(chart[0].viewCount, 120000);
  assert.equal(chart[1].likeCount, null); // 高評価数がない応答は欠測
  assert.equal(r.batch.videos.find(v => v.videoId === 'mockGone001')?.status, 'missing');
  assert.equal(r.batch.videos.find(v => v.videoId === 'mockVid0009')?.viewCount, 999);
  const ch2 = r.batch.channels.find(c => c.channelId === 'mockCh02')!;
  assert.deepEqual([ch2.subscriberCountHidden, ch2.subscriberCount], [true, null]);
  assert.deepEqual(r.batch.categories.map(c => c.title), ['音楽', 'ゲーム', '教育']);
  assert.deepEqual(transport.calls, [
    'videoCategories?hl=ja&regionCode=JP',
    'videos?chart=mostPopular&maxResults=50&regionCode=JP&videoCategoryId=0',
    'videos?chart=mostPopular&maxResults=50&pageToken=P2&regionCode=JP&videoCategoryId=0',
    'videos?id=mockVid0009,mockGone001',
    'channels?id=mockCh01,mockCh02',
  ]);
});

test('trends-collect: ページ上限で止めたチャートはcompleteにしない', async () => {
  const transport = loadFixtureTransport('fixtures/trends/mock-api.json');
  const r = await collect(plan({maxPages: 1, trackVideoIds: [], includeChannels: false, includeCategories: false}), {transport, source: 'synthetic', budget, now: clock()});
  assert.deepEqual(r.batch.charts.map(c => c.complete), [false]);
  assert.equal(r.unitsUsed, 1);
});

test('trends-collect: 見積りが上限を越える計画は送信前に拒否する', async () => {
  assert.equal(estimateUnits(plan()), 1 + 2 + 1 + Math.ceil((100 + 2) / 50));
  assert.equal(estimateUnits(plan({trackVideoIds: Array.from({length: 120}, (_, i) => `v${i}`), chartCategoryIds: [], includeChannels: false, includeCategories: false})), 3);
  const transport = fixtureTransport({});
  for (const b of [{...budget, runLimit: 3}, {...budget, usedToday: 9_998}]) {
    assert.equal(checkBudget(plan(), b).ok, false);
    await assert.rejects(collect(plan(), {transport, source: 'synthetic', budget: b}), (e: CollectError) => e.kind === 'budget' && e.unitsUsed === 0);
  }
  assert.deepEqual(transport.calls, []);
  await assert.rejects(collect(plan({regionCode: 'jp'}), {transport, source: 'synthetic', budget}), /regionCode/);
  await assert.rejects(collect(plan({chartCategoryIds: [], trackVideoIds: [], trackChannelIds: []}), {transport, source: 'synthetic', budget}), /取得対象/);
});

test('trends-collect: 応答の分類（上限・認証・一時障害・不正）', () => {
  assert.equal(classify({status: 200, body: {}}), null);
  assert.equal(classify(err(403, 'quotaExceeded')), 'quota');
  assert.equal(classify(err(403, 'forbidden')), 'auth');
  assert.equal(classify(err(400, 'keyInvalid')), 'auth');
  assert.equal(classify(err(401, 'unauthorized')), 'auth');
  assert.equal(classify(err(429, 'tooMany')), 'transient');
  assert.equal(classify(err(403, 'rateLimitExceeded')), 'transient');
  assert.equal(classify(err(503, 'backendError')), 'transient');
  assert.equal(classify({status: 0, body: {error: {message: 'timeout'}}}), 'transient');
  assert.equal(classify(err(400, 'videoChartNotFound')), 'invalid');
});

const onlyCharts = plan({trackVideoIds: [], includeChannels: false, includeCategories: false, maxPages: 1});
const chartKey = requestKey('videos', {chart: 'mostPopular', maxResults: '50', regionCode: 'JP', videoCategoryId: '0'});
const okChart: HttpResponse = {status: 200, body: {items: [{id: 'x1', snippet: {categoryId: '10'}, statistics: {viewCount: '1'}}]}};

test('trends-collect: 一時障害は制限付きで再試行し、上限を越えたら停止する', async () => {
  const sleeps: number[] = [];
  const sleep = async (ms: number) => { sleeps.push(ms); };
  const recovered = fixtureTransport({[chartKey]: [err(503, 'backendError'), err(429, 'x'), okChart]});
  const r = await collect(onlyCharts, {transport: recovered, source: 'synthetic', budget, now: clock(), sleep});
  assert.equal(r.unitsUsed, 3); // 失敗した要求もunitを数える
  assert.deepEqual(sleeps, [1000, 2000]);
  const failing = fixtureTransport({[chartKey]: [err(503, 'backendError')]});
  await assert.rejects(collect(onlyCharts, {transport: failing, source: 'synthetic', budget, now: clock(), sleep: noSleep}),
    (e: CollectError) => e.kind === 'transient' && e.unitsUsed === 3 && /再試行上限/.test(e.message));
  // 再試行の分で1回の上限に達したら停止
  await assert.rejects(collect(onlyCharts, {transport: fixtureTransport({[chartKey]: [err(503, 'backendError')]}), source: 'synthetic', budget: {...budget, runLimit: 2}, now: clock(), sleep: noSleep}),
    (e: CollectError) => e.kind === 'budget' && e.unitsUsed === 2);
});

test('trends-collect: 日次上限・認証エラーは再試行せず停止し、キーを出さない', async () => {
  const quota = fixtureTransport({[chartKey]: [err(403, 'quotaExceeded')]});
  await assert.rejects(collect(onlyCharts, {transport: quota, source: 'youtube-data-api', budget, now: clock(), sleep: noSleep}),
    (e: CollectError) => e.kind === 'quota' && e.unitsUsed === 1);
  assert.equal(quota.calls.length, 1);
  const secret = 'dummy-secret-for-test';
  const auth = fixtureTransport({[chartKey]: [err(400, 'keyInvalid', `API key not valid: ${secret}`)]});
  await assert.rejects(collect(onlyCharts, {transport: auth, source: 'youtube-data-api', budget, now: clock(), sleep: noSleep, secret}),
    (e: CollectError) => e.kind === 'auth' && !e.message.includes(secret) && e.message.includes('[REDACTED]'));
});

test('trends-collect: 実接続はキーをURLにだけ入れ、通信障害の文言からも伏せる', async () => {
  assert.throws(() => liveTransport(''), /YOUTUBE_API_KEY/);
  const secret = 'dummy-secret-live';
  const seen: string[] = [];
  const okFetch = (async (url: URL) => { seen.push(String(url)); return new Response(JSON.stringify({items: []}), {status: 200}); }) as unknown as typeof fetch;
  const t = liveTransport(secret, 1000, okFetch);
  const r = await t('videos', {part: 'snippet', chart: 'mostPopular'});
  assert.equal(r.status, 200);
  assert.match(seen[0], /^https:\/\/www\.googleapis\.com\/youtube\/v3\/videos\?/);
  assert.match(seen[0], /key=dummy-secret-live/);
  const badFetch = (async (url: URL) => { throw new Error(`connect failed ${url}`); }) as unknown as typeof fetch;
  const down = await liveTransport(secret, 1000, badFetch)('videos', {});
  assert.equal(down.status, 0);
  assert.equal(JSON.stringify(down).includes(secret), false);
  assert.equal(classify(down), 'transient');
});
