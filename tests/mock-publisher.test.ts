import {reviewWithCheckedFactsForTest} from './helpers/checked-facts.ts';
// All approvals and media here are synthetic fixtures in temporary directories.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {FileMockPublisher, MockPublishFailure, simulatePublish, readMockLedger, mockPublishKey} from '../src/mock-publisher.ts';
import type {MockPublisherContract, MockOutcome} from '../src/mock-publisher.ts';
import {approvalOf, recordReview} from '../src/review.ts';
import {DisabledPublisher} from '../src/providers.ts';
import {createProject, selectTopic, addReflection, attachScript, linkRender} from '../src/production.ts';

function fixture(fn: (c: ReturnType<typeof setup>) => Promise<void>) {
  return async () => { const c = setup(); try { await fn(c); } finally { rmSync(c.root, {recursive: true, force: true}); } };
}
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'T140-'));
  const dir = join(root, 'demo-aaaaaaaa'); mkdirSync(dir);
  writeFileSync(join(dir, 'sample.mp4'), 'synthetic mock bytes, not video');
  const outputHash = createHash('sha256').update(readFileSync(join(dir, 'sample.mp4'))).digest('hex');
  writeFileSync(join(dir, 'job.json'), JSON.stringify({id: 'demo-aaaaaaaa', status: 'completed', outputHash, mode: 'demo'}));
  const hash = approvalOf(dir).currentHash!;
  const ledger = join(root, 'ledger.json'), remote = join(root, 'remote.json');
  const approve = () => recordReview(dir, 'approve', 'synthetic mock approval', approvalOf(dir).currentHash!, 'test-agent');
  const adapter = (outcomes: MockOutcome[] = [], unknown = 0) => new FileMockPublisher(remote, outcomes, unknown);
  return {root, dir, hash, ledger, remote, approve, adapter};
}
test('mock: pending, rejected, expired and stale displayed hashes never send', fixture(async c => {
  const a = c.adapter();
  assert.equal((await simulatePublish(c.dir, c.hash, c.ledger, a)).state, 'blocked');
  recordReview(c.dir, 'reject', 'mock rejection', c.hash, 'test-agent');
  assert.equal((await simulatePublish(c.dir, c.hash, c.ledger, a)).state, 'blocked');
  c.approve();
  assert.equal((await simulatePublish(c.dir, 'old', c.ledger, a)).state, 'blocked');
  writeFileSync(join(c.dir, 'subtitles.vtt'), 'changed');
  assert.equal((await simulatePublish(c.dir, c.hash, c.ledger, a)).state, 'blocked');
  assert.deepEqual(a.calls, []); assert.equal(existsSync(c.ledger), false);
}));
test('mock: durable job/hash idempotency survives coordinator and adapter restart', fixture(async c => {
  c.approve(); const a = c.adapter();
  const first = await simulatePublish(c.dir, c.hash, c.ledger, a);
  assert.equal(first.state, 'published'); assert.equal(first.kind, 'mock');
  const b = c.adapter(); assert.deepEqual(await simulatePublish(c.dir, c.hash, c.ledger, b), first);
  assert.deepEqual(b.calls, []);
  const l = readMockLedger(c.ledger); assert.equal(l.entries[0].key, mockPublishKey('demo-aaaaaaaa', c.hash));
  assert.equal(l.entries[0].attempts, 1); assert.equal(Object.keys(JSON.parse(readFileSync(c.remote, 'utf8'))).length, 1);
}));
test('mock: response loss reconciles created video without second create', fixture(async c => {
  c.approve(); const a = c.adapter(['response-lost']);
  assert.equal((await simulatePublish(c.dir, c.hash, c.ledger, a)).state, 'published');
  assert.deepEqual(a.calls, ['create', 'reconcile']); assert.equal(readMockLedger(c.ledger).entries[0].attempts, 1);
}));
test('mock: unknown reconciliation blocks sends; restart resolves original receipt', fixture(async c => {
  c.approve(); const a = c.adapter(['response-lost'], 1);
  assert.equal((await simulatePublish(c.dir, c.hash, c.ledger, a)).state, 'uncertain');
  assert.equal(readMockLedger(c.ledger).entries[0].state, 'uncertain');
  const b = c.adapter(); assert.equal((await simulatePublish(c.dir, c.hash, c.ledger, b)).state, 'published');
  assert.deepEqual(b.calls, ['reconcile']); assert.equal(Object.keys(JSON.parse(readFileSync(c.remote, 'utf8'))).length, 1);
}));
test('mock: authoritative absence permits bounded retry; limit survives restart', fixture(async c => {
  c.approve(); const a = c.adapter(['transient', 'ok']);
  assert.equal((await simulatePublish(c.dir, c.hash, c.ledger, a)).state, 'published');
  assert.deepEqual(a.calls, ['create', 'reconcile', 'create']);
  rmSync(c.ledger); rmSync(c.remote);
  const b = c.adapter(['transient', 'transient']);
  assert.equal((await simulatePublish(c.dir, c.hash, c.ledger, b)).reason, 'attempt-limit');
  const d = c.adapter(); assert.equal((await simulatePublish(c.dir, c.hash, c.ledger, d)).reason, 'attempt-limit');
  assert.deepEqual(d.calls, ['reconcile']); assert.equal(readMockLedger(c.ledger).entries[0].attempts, 2);
}));
for (const code of ['quota', 'auth'] as const) test(`mock: ${code} persists service stop across jobs and restarts`, fixture(async c => {
  c.approve(); const a = c.adapter([code]);
  assert.equal((await simulatePublish(c.dir, c.hash, c.ledger, a)).reason, code);
  const job = JSON.parse(readFileSync(join(c.dir, 'job.json'), 'utf8')); job.id = 'demo-bbbbbbbb';
  writeFileSync(join(c.dir, 'job.json'), JSON.stringify(job));
  const b = c.adapter(); assert.equal((await simulatePublish(c.dir, c.hash, c.ledger, b)).reason, code);
  assert.deepEqual(b.calls, []); assert.equal(readMockLedger(c.ledger).stopped, code);
}));
test('mock: concurrent coordinators cannot double-send and pending intent is durable', fixture(async c => {
  c.approve(); const a = c.adapter(); let release!: () => void;
  const wait = new Promise<void>(r => {release = r;});
  const slow: MockPublisherContract = {kind: 'mock.publisher', reconcile: r => a.reconcile(r), create: async r => {
    assert.equal(readMockLedger(c.ledger).entries[0].state, 'uncertain');
    await wait; return a.create(r);
  }};
  const first = simulatePublish(c.dir, c.hash, c.ledger, slow);
  assert.equal((await simulatePublish(c.dir, c.hash, c.ledger, c.adapter())).reason, 'ledger-locked');
  release(); assert.equal((await first).state, 'published'); assert.deepEqual(a.calls, ['create']);
}));
test('mock: reapproval of changed bundle cannot create a second video for job', fixture(async c => {
  c.approve(); await simulatePublish(c.dir, c.hash, c.ledger, c.adapter());
  writeFileSync(join(c.dir, 'subtitles.vtt'), 'new version'); c.approve(); const a = c.adapter();
  assert.equal((await simulatePublish(c.dir, approvalOf(c.dir).currentHash!, c.ledger, a)).reason, 'job-already-recorded');
  assert.deepEqual(a.calls, []);
}));
test('mock: approval revoked during reconcile blocks retry', fixture(async c => {
  c.approve(); const a = c.adapter(['transient']);
  const changing: MockPublisherContract = {kind: 'mock.publisher', create: r => a.create(r), reconcile: async r => {
    const found = await a.reconcile(r); writeFileSync(join(c.dir, 'sample.mp4'), 'changed'); return found;
  }};
  assert.equal((await simulatePublish(c.dir, c.hash, c.ledger, changing)).reason, 'approval-mismatch');
  assert.deepEqual(a.calls, ['create', 'reconcile']);
}));
test('mock: untrusted error text is discarded and corrupt ledger fails closed', fixture(async c => {
  c.approve();
  const secret = 'synthetic-secret-marker';
  const a: MockPublisherContract = {kind: 'mock.publisher', create: async () => {throw Error(secret);}, reconcile: async () => {throw Error(secret);}};
  const r = await simulatePublish(c.dir, c.hash, c.ledger, a);
  assert.equal(r.state, 'uncertain'); assert.ok(!JSON.stringify(r).includes(secret));
  assert.ok(!readFileSync(c.ledger, 'utf8').includes(secret));
  assert.equal((await simulatePublish(c.dir, c.hash, c.ledger, a)).reason, 'reconciliation-error');
  writeFileSync(c.ledger, '{broken'); const b = c.adapter();
  assert.equal((await simulatePublish(c.dir, c.hash, c.ledger, b)).state, 'uncertain'); assert.deepEqual(b.calls, []);
}));
test('mock: real adapter denied, DisabledPublisher unchanged, no network transport', fixture(async c => {
  c.approve(); const a = c.adapter();
  assert.equal((await simulatePublish(c.dir, c.hash, c.ledger, {...a, kind: 'real'} as unknown as MockPublisherContract)).reason, 'mock-only');
  assert.equal(new DisabledPublisher().kind, 'disabled'); await assert.rejects(() => new DisabledPublisher().publish(), /未実装・未承認/);
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => {throw Error('network forbidden');};
  try { assert.equal((await simulatePublish(c.dir, c.hash, c.ledger, a)).state, 'published'); }
  finally { globalThis.fetch = oldFetch; }
  const source = readFileSync('src/mock-publisher.ts', 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(|node:(?:https?|net|tls)|child_process|https?:\/\//);
  assert.equal(new MockPublishFailure('auth').message, 'auth');
}));
test('mock: production prerequisite enforcement and script expiry use existing review gate', fixture(async c => {
  const H = '架空テスト利用者';
  const id = createProject(c.root, JSON.parse(readFileSync('fixtures/topic-candidates-demo.json', 'utf8')), {by: 'test-agent'});
  selectTopic(c.root, id, 'price-index', H); addReflection(c.root, id, '試験用の本人考察です。実在の本人の承認ではありません。', H);
  const s = attachScript(c.root, id, JSON.parse(readFileSync('fixtures/draft-general-demo.json', 'utf8')), 'test-agent');
  reviewWithCheckedFactsForTest(c.root, id, 'approve', s.hash, '', H);
  const job = JSON.parse(readFileSync(join(c.dir, 'job.json'), 'utf8'));
  writeFileSync(join(c.dir, 'thumbnail-a.png'), Buffer.from('mock-thumb'));
  Object.assign(job, {
    mode: 'production',
    project: id,
    scriptHash: s.hash,
    scriptVersion: s.version,
    thumbnails: [{file: 'thumbnail-a.png', ok: true, issues: [], sha256: createHash('sha256').update(Buffer.from('mock-thumb')).digest('hex')}],
    thumbnailQuality: {ok: true, canProceed: true, allPassed: true, selectedVariant: 'a', reasons: []},
  });
  writeFileSync(join(c.dir, 'job.json'), JSON.stringify(job));
  recordReview(c.dir, 'approve', 'synthetic', approvalOf(c.dir).currentHash!, H);
  const a = c.adapter(); let hash = approvalOf(c.dir).currentHash!;
  assert.equal((await simulatePublish(c.dir, hash, c.ledger, a)).state, 'blocked'); // missing render link
  linkRender(c.root, id, job.id, s.hash, s.version);
  assert.equal((await simulatePublish(c.dir, hash, c.ledger, a)).state, 'published');
  addReflection(c.root, id, '変更した架空の考察です。', H);
  assert.equal((await simulatePublish(c.dir, hash, c.ledger, a)).state, 'blocked');
  assert.deepEqual(a.calls, ['create']);
}));
test('mock: intent-only crash reconciles absence; remote deduplicates direct retry', fixture(async c => {
  c.approve(); const request = {jobId: 'demo-aaaaaaaa', bundleHash: c.hash, key: mockPublishKey('demo-aaaaaaaa', c.hash)};
  writeFileSync(c.ledger, JSON.stringify({schema: 1, kind: 'mock', entries: [{...request, state: 'uncertain', attempts: 1}]}));
  const a = c.adapter(); assert.equal((await simulatePublish(c.dir, c.hash, c.ledger, a)).state, 'published');
  assert.deepEqual(a.calls, ['reconcile', 'create']);
  assert.deepEqual(await a.create(request), readMockLedger(c.ledger).entries[0].receipt);
  assert.equal(Object.keys(JSON.parse(readFileSync(c.remote, 'utf8'))).length, 1);
}));
for (const code of ['quota', 'auth'] as const) test(`mock: ${code} during reconciliation persists stop`, fixture(async c => {
  c.approve(); await simulatePublish(c.dir, c.hash, c.ledger, c.adapter(['response-lost'], 1));
  const a: MockPublisherContract = {kind: 'mock.publisher', create: async () => {throw Error('must not send');},
    reconcile: async () => {throw new MockPublishFailure(code);}};
  assert.equal((await simulatePublish(c.dir, c.hash, c.ledger, a)).reason, code);
  assert.equal(readMockLedger(c.ledger).stopped, code);
}));
test('mock: invalid response and remote lock remain uncertain without retry', fixture(async c => {
  c.approve(); let creates = 0;
  const a: MockPublisherContract = {kind: 'mock.publisher', create: async () => {creates++; return {kind: 'mock', videoId: 'mock-' + '0'.repeat(64)};},
    reconcile: async () => ({state: 'unknown'})};
  assert.equal((await simulatePublish(c.dir, c.hash, c.ledger, a)).reason, 'invalid-receipt');
  assert.equal((await simulatePublish(c.dir, c.hash, c.ledger, a)).reason, 'reconciliation-unknown'); assert.equal(creates, 1);
  writeFileSync(c.remote + '.lock', 'synthetic stale lock'); const b = c.adapter();
  assert.equal((await simulatePublish(c.dir, c.hash, c.ledger, b)).reason, 'reconciliation-unknown'); assert.deepEqual(b.calls, ['reconcile']);
}));
