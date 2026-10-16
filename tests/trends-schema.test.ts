import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {type CollectionBatch, validateBatch, validatePolicy, derivedAllowed, retentionDeadlines, DEFAULT_POLICY, DAY_MS} from '../src/trends-schema.ts';

const load = (name: string) => JSON.parse(readFileSync(`fixtures/trends/${name}`, 'utf8'));

test('trends-schema: 合成の履歴と境界例がスキーマに適合する', () => {
  for (const name of ['synthetic-history.json', 'boundary-cases.json']) {
    for (const b of load(name).batches) {
      const v = validateBatch(b);
      assert.equal(v.source, 'synthetic');
      assert.equal(v.regionCode, 'JP');
    }
  }
  const [first, , last]: CollectionBatch[] = load('synthetic-history.json').batches.map((b: unknown) => validateBatch(b));
  assert.equal(first.videos.filter(v => v.chart?.chartCategoryId === '0').length, 4);
  assert.equal(last.videos.find(v => v.videoId === 'vidD0000001')?.status, 'missing');
  assert.equal(first.channels.find(c => c.channelId === 'chY')?.subscriberCount, null);
});

test('trends-schema: 不正なbatchを拒否する', () => {
  const base = load('synthetic-history.json').batches[0];
  const bad = (patch: (b: any) => void, msg: RegExp) => {
    const b = structuredClone(base);
    patch(b);
    assert.throws(() => validateBatch(b), msg);
  };
  bad(b => { b.schema = 'yt-trends-batch/v2'; }, /未対応のスキーマ/);
  bad(b => { b.source = 'scraped'; }, /source/);
  bad(b => { b.regionCode = 'jp'; }, /regionCode/);
  bad(b => { b.videos[0].viewCount = -1; }, /viewCount/);
  bad(b => { b.videos[0].viewCount = 1.5; }, /viewCount/);
  bad(b => { b.videos[0].fetchedAt = '2026-10-01 00:00'; }, /fetchedAt/);
  bad(b => { b.videos[0].fetchedAt = '2026-10-02T00:00:00Z'; }, /収集期間の外/);
  bad(b => { b.videos[1].chart.rank = 1; }, /順位が重複/);
  bad(b => { b.videos[0].status = 'missing'; }, /missing/);
  bad(b => { b.channels[1].subscriberCount = 5; }, /非公開/);
  bad(b => { b.videos[0].videoId = '../etc'; }, /videoId/);
});

test('trends-schema: ポリシーは承認の参照なしに派生指標を許さない', () => {
  assert.throws(() => validatePolicy({profile: 'audited-derived-metrics'}), /approvalRef/);
  assert.throws(() => validatePolicy({profile: 'standard', categoryAggregationApproved: true}), /audited/);
  const audited = validatePolicy({profile: 'audited-derived-metrics', approvalRef: 'case-123'});
  assert.equal(derivedAllowed('synthetic', DEFAULT_POLICY, 'growth').ok, true);
  assert.equal(derivedAllowed('synthetic', DEFAULT_POLICY, 'category').ok, true);
  const denied = derivedAllowed('youtube-data-api', DEFAULT_POLICY, 'growth');
  assert.equal(denied.ok, false);
  assert.match(!denied.ok ? denied.reason : '', /III\.E\.4\.h/);
  assert.equal(derivedAllowed('youtube-data-api', audited, 'growth').ok, true);
  assert.equal(derivedAllowed('youtube-data-api', audited, 'category').ok, false);
  const both = validatePolicy({profile: 'audited-derived-metrics', approvalRef: 'case-123', categoryAggregationApproved: true});
  assert.equal(derivedAllowed('youtube-data-api', both, 'category').ok, true);
});

test('trends-schema: 保持期限はT131の条件どおり', () => {
  const t = '2026-01-31T00:00:00Z';
  const std = retentionDeadlines('youtube-data-api', t, DEFAULT_POLICY);
  assert.equal(std.stats, Date.parse(t) + 30 * DAY_MS);
  assert.equal(std.metadata, std.stats);
  const audited = retentionDeadlines('youtube-data-api', t, validatePolicy({profile: 'audited-derived-metrics', approvalRef: 'r'}));
  assert.equal(new Date(audited.stats).toISOString(), '2029-01-31T00:00:00.000Z');
  assert.equal(audited.metadata, Date.parse(t) + 30 * DAY_MS);
  assert.equal(retentionDeadlines('synthetic', t, DEFAULT_POLICY).stats, Infinity);
});
