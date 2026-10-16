// T140: local simulation only. No CLI registration, credentials, URL or transport.
// This contract deliberately does not replace providers.ts's disabled Publisher.
import {existsSync, readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {approvalOf, publishReadiness, readJob} from './review.ts';

export type PublishRequest = {jobId: string; bundleHash: string; key: string};
export type MockReceipt = {kind: 'mock'; videoId: string};
export type Lookup = {state: 'found'; receipt: MockReceipt} | {state: 'absent' | 'unknown'};
export interface MockPublisherContract {
  readonly kind: 'mock.publisher';
  create(request: PublishRequest): Promise<MockReceipt>;
  // absent must mean authoritative non-creation; unknown must never permit resend.
  reconcile(request: PublishRequest): Promise<Lookup>;
}
export type FailureCode = 'quota' | 'auth' | 'response-lost' | 'transient';
export class MockPublishFailure extends Error {
  readonly code: FailureCode;
  constructor(code: FailureCode) { super(code); this.code = code; }
}
type Entry = PublishRequest & {state: 'uncertain' | 'published'; attempts: number; receipt?: MockReceipt};
export type MockLedger = {schema: 1; kind: 'mock'; stopped?: 'quota' | 'auth'; entries: Entry[]};
export type MockPublishResult = {kind: 'mock'; state: 'published' | 'blocked' | 'uncertain' | 'stopped'; reason?: string; receipt?: MockReceipt};
export const mockPublishKey = (jobId: string, bundleHash: string) => createHash('sha256').update(JSON.stringify([jobId, bundleHash])).digest('hex');
function save(path: string, value: unknown) {
  writeFileSync(path + '.tmp', JSON.stringify(value, null, 2), {mode: 0o600});
  renameSync(path + '.tmp', path);
}
export function readMockLedger(path: string): MockLedger {
  if (!existsSync(path)) return {schema: 1, kind: 'mock', entries: []};
  const l = JSON.parse(readFileSync(path, 'utf8')) as MockLedger;
  if (l.schema !== 1 || l.kind !== 'mock' || !Array.isArray(l.entries) ||
      (l.stopped !== undefined && !['quota', 'auth'].includes(l.stopped)) ||
      l.entries.some(e => !e.jobId || !/^[a-f0-9]{64}$/.test(e.bundleHash) || e.key !== mockPublishKey(e.jobId, e.bundleHash) ||
        !['uncertain', 'published'].includes(e.state) || !Number.isSafeInteger(e.attempts) || e.attempts < 1 ||
        (e.state === 'published' && !validReceipt(e.receipt, e.key))) ||
      new Set(l.entries.map(e => e.jobId)).size !== l.entries.length) throw Error('Invalid mock ledger');
  return l;
}
function validReceipt(r: MockReceipt | undefined, key: string): r is MockReceipt {
  return r?.kind === 'mock' && r.videoId === 'mock-' + key;
}

/** Explicit adapter injection, durable intent before create, exclusive ledger lock.
 * Reopening an uncertain entry always reconciles first, including after a crash.
 * A stale lock is fail-closed: inspect ledger and mock remote before manual removal.
 * maxAttempts bounds total sends per key across restarts; no automatic stop reset.
 */
export async function simulatePublish(dir: string, expectedHash: string, ledgerPath: string,
  adapter: MockPublisherContract, maxAttempts = 2): Promise<MockPublishResult> {
  const result = (state: MockPublishResult['state'], reason: string): MockPublishResult => ({kind: 'mock', state, reason});
  if (adapter.kind !== 'mock.publisher') return result('blocked', 'mock-only');
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) return result('blocked', 'attempt-limit');
  let lock: number;
  try { lock = openSync(ledgerPath + '.lock', 'wx', 0o600); }
  catch { return result('blocked', 'ledger-locked'); }
  try {
    const ledger = readMockLedger(ledgerPath);
    const gate = () => {
      const a = approvalOf(dir);
      return a.state === 'approved' && a.currentHash === expectedHash &&
        (a.mode !== 'production' || publishReadiness(dir).ok);
    };
    if (!gate()) return result('blocked', 'approval-mismatch');
    if (ledger.stopped) return result('stopped', ledger.stopped);
    const jobId: unknown = readJob(dir).id;
    if (typeof jobId !== 'string' || !jobId) return result('blocked', 'invalid-job');
    const key = mockPublishKey(jobId, expectedHash);
    let entry = ledger.entries.find(e => e.jobId === jobId);
    if (entry && entry.key !== key) return result('blocked', 'job-already-recorded');
    if (entry?.state === 'published') return {kind: 'mock', state: 'published', receipt: entry.receipt};
    const request: PublishRequest = {jobId, bundleHash: expectedHash, key};
    while (true) {
      if (entry) {
        let found: Lookup;
        try { found = await adapter.reconcile(request); }
        catch (e) {
          if (e instanceof MockPublishFailure && (e.code === 'quota' || e.code === 'auth')) {
            ledger.stopped = e.code; save(ledgerPath, ledger); return result('stopped', e.code);
          }
          return result('uncertain', 'reconciliation-error');
        }
        if (found.state === 'found') {
          if (!validReceipt(found.receipt, key)) return result('uncertain', 'invalid-receipt');
          entry.state = 'published'; entry.receipt = found.receipt; save(ledgerPath, ledger);
          return {kind: 'mock', state: 'published', receipt: entry.receipt};
        }
        if (found.state !== 'absent') return result('uncertain', 'reconciliation-unknown');
        if (entry.attempts >= maxAttempts) return result('stopped', 'attempt-limit');
      }
      // Recheck after every await, before recording another send intent.
      if (!gate()) return result('blocked', 'approval-mismatch');
      if (!entry) { entry = {...request, state: 'uncertain', attempts: 0}; ledger.entries.push(entry); }
      entry.attempts++;
      save(ledgerPath, ledger);
      try {
        const receipt = await adapter.create(request);
        if (!validReceipt(receipt, key)) return result('uncertain', 'invalid-receipt');
        entry.state = 'published'; entry.receipt = receipt; save(ledgerPath, ledger);
        return {kind: 'mock', state: 'published', receipt};
      } catch (e) {
        if (e instanceof MockPublishFailure && (e.code === 'quota' || e.code === 'auth')) {
          ledger.stopped = e.code; save(ledgerPath, ledger); return result('stopped', e.code);
        }
        // Never copy an adapter error message (which could contain secrets).
        if (!(e instanceof MockPublishFailure)) return result('uncertain', 'adapter-error');
      }
    }
  } catch { return result('uncertain', 'local-or-reconciliation-error'); }
  finally { closeSync(lock); unlinkSync(ledgerPath + '.lock'); }
}

export type MockOutcome = 'ok' | 'response-lost' | 'transient' | 'quota' | 'auth';
/** Deterministic local remote stand-in, persistent idempotent creations.
 * No network dependencies; the remote file is a separate mock service store.
 */
export class FileMockPublisher implements MockPublisherContract {
  readonly kind = 'mock.publisher' as const;
  readonly calls: string[] = [];
  private path: string;
  private outcomes: MockOutcome[];
  private unknownLookups: number;
  constructor(path: string, outcomes: MockOutcome[] = [], unknownLookups = 0) {
    this.path = path; this.outcomes = [...outcomes]; this.unknownLookups = unknownLookups;
  }
  async create(request: PublishRequest): Promise<MockReceipt> {
    this.calls.push('create');
    if (request.key !== mockPublishKey(request.jobId, request.bundleHash)) throw Error('Invalid mock key');
    const lock = openSync(this.path + '.lock', 'wx', 0o600);
    try {
      const remote: Record<string, MockReceipt> = existsSync(this.path) ? JSON.parse(readFileSync(this.path, 'utf8')) : {};
      if (remote[request.key]) return remote[request.key];
      const outcome = this.outcomes.shift() ?? 'ok';
      if (outcome === 'quota' || outcome === 'auth' || outcome === 'transient') throw new MockPublishFailure(outcome);
      const receipt: MockReceipt = {kind: 'mock', videoId: 'mock-' + request.key};
      remote[request.key] = receipt; save(this.path, remote);
      if (outcome === 'response-lost') throw new MockPublishFailure(outcome);
      return receipt;
    } finally { closeSync(lock); unlinkSync(this.path + '.lock'); }
  }
  async reconcile(request: PublishRequest): Promise<Lookup> {
    this.calls.push('reconcile');
    if (existsSync(this.path + '.lock')) return {state: 'unknown'};
    if (this.unknownLookups-- > 0) return {state: 'unknown'};
    const remote: Record<string, MockReceipt> = existsSync(this.path) ? JSON.parse(readFileSync(this.path, 'utf8')) : {};
    return remote[request.key] ? {state: 'found', receipt: remote[request.key]} : {state: 'absent'};
  }
}
