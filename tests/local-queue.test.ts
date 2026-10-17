import {reviewWithCheckedFactsForTest} from './helpers/checked-facts.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {LocalQueue} from '../src/local-queue.ts';
import {ConnError} from '../src/connections.ts';
import {createProject, selectTopic, addReflection, attachScript} from '../src/production.ts';
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
function setup(t: {after(fn: () => void): void}, concurrency = 1) {
  const root = mkdtempSync(join(tmpdir(), 'T141-')); t.after(() => rmSync(root, {recursive: true, force: true}));
  const input = join(root, 'input'); writeFileSync(input, 'input-v1'); const directory = join(root, 'queue');
  const q = LocalQueue.open(directory, {concurrency}); t.after(() => q.close());
  const add = (id: string, stages = ['audio', 'video'], maxAttempts = 3) => q.enqueue({id, stages, inputs: [input], mode: 'mock', maxAttempts});
  return {root, input, directory, q, add};
}
const emit = async (ctx: Parameters<Parameters<LocalQueue['drain']>[0]>[0]) => {ctx.writeArtifact('output', `${ctx.job.id}-${ctx.stage}-${ctx.attempt}`);};
function rewriteSnapshot(directory: string, edit: (state: any) => void) {
  const path = join(directory, 'queue.json'); const env = JSON.parse(readFileSync(path, 'utf8')); edit(env.value);
  env.sha256 = hash(JSON.stringify(env.value)); writeFileSync(path, JSON.stringify(env));
}

test('mock multiple jobs: FIFO starts, concurrency bound, states persist, completions are reused', async t => {
  const {q, add, directory} = setup(t, 2); ['one', 'two', 'three', 'four'].forEach(id => add(id));
  let active = 0, peak = 0; const starts: string[] = [];
  await q.drain(async ctx => {active++; peak = Math.max(active, peak); if (ctx.stage === 'audio') starts.push(ctx.job.id); await new Promise(r => setTimeout(r, 5)); await emit(ctx); active--;});
  assert.equal(peak, 2); assert.deepEqual(starts, ['one', 'two', 'three', 'four']);
  const snapshot = q.snapshot(); assert.ok(snapshot.jobs.every(j => j.status === 'completed' && j.mode === 'mock'));
  assert.deepEqual(snapshot.events.map(e => e.sequence), snapshot.events.map((_, i) => i + 1)); q.close();
  const reopened = LocalQueue.open(directory, {concurrency: 2}); t.after(() => reopened.close());
  assert.deepEqual(reopened.snapshot(), snapshot); reopened.recover(); await reopened.drain(async () => assert.fail('completed task rerun'));
});

test('duplicate ids, invalid configuration and real connections are rejected before writes', t => {
  const {q, add, input, directory} = setup(t); add('one'); const before = readFileSync(join(directory, 'queue.json'));
  assert.throws(() => add('one'), /duplicate/);
  assert.throws(() => q.enqueue({id: 'real', mode: 'real' as any, inputs: [input], stages: ['x']}), /local\/mock/);
  assert.throws(() => add('bad', ['x', 'x']), /invalid/); assert.throws(() => add('limit', ['x'], 11), /invalid/);
  assert.deepEqual(readFileSync(join(directory, 'queue.json')), before);
  assert.throws(() => LocalQueue.open(directory), /EEXIST/); assert.throws(() => LocalQueue.open(directory, {recoverDeadOwner: true}), /alive/);
  assert.throws(() => LocalQueue.open(join(directory, 'invalid'), {concurrency: 0}), /concurrency/);
});

test('failure isolation, retryable none errors bounded across reopen, fatal never retried', async t => {
  const {q, add, directory} = setup(t, 2); add('retry', ['x'], 2); add('fatal', ['x']); add('good', ['x']);
  await q.drain(async ctx => {
    if (ctx.job.id === 'retry') throw new ConnError('SERVER', 'injected', {charge: 'none'});
    if (ctx.job.id === 'fatal') throw new ConnError('FATAL', 'fatal', {charge: 'none'});
    await emit(ctx);
  });
  assert.deepEqual(q.snapshot().jobs.map(j => [j.status, j.stages[0].attempts.length]), [['failed', 2], ['failed', 1], ['completed', 1]]);
  q.close(); const reopened = LocalQueue.open(directory, {concurrency: 2}); t.after(() => reopened.close()); reopened.recover();
  await reopened.drain(async () => assert.fail('terminal failures rerun'));
});

test('transient failures succeed within limit and retain isolated attempt outputs', async t => {
  const {q, add, directory} = setup(t); add('one', ['x']);
  await q.drain(async ctx => {await emit(ctx); if (ctx.attempt === 1) throw new ConnError('RATE_LIMIT', 'not processed', {charge: 'none'});});
  const st = q.snapshot().jobs[0].stages[0]; assert.equal(st.attempts.length, 2); assert.equal(st.status, 'completed');
  assert.equal(readFileSync(join(directory, st.attempts[0].directory, 'output'), 'utf8'), 'one-x-1');
  assert.equal(readFileSync(join(directory, st.outputs[0].file), 'utf8'), 'one-x-2');
});

test('unknown cost at zero dollars blocks all resends but other jobs continue', async t => {
  const {q, add, directory} = setup(t); add('unknown', ['x']); add('good', ['x']);
  await q.drain(async ctx => {if (ctx.job.id === 'unknown') throw new ConnError('SERVER', 'response lost'); await emit(ctx);});
  const j = q.snapshot().jobs[0]; assert.equal(j.status, 'blocked'); assert.equal(j.stages[0].attempts[0].charge, 'unknown');
  assert.equal(q.snapshot().jobs[1].status, 'completed'); q.close();
  const reopened = LocalQueue.open(directory); t.after(() => reopened.close()); reopened.recover(); await reopened.drain(async () => assert.fail('unknown resent'));
});

test('changed input and completed artifacts block reuse, never overwrite files', async t => {
  const {q, add, input, directory} = setup(t); add('one', ['x']); await q.drain(emit);
  const out = join(directory, q.snapshot().jobs[0].stages[0].outputs[0].file); writeFileSync(out, 'tampered');
  q.recover(); assert.equal(q.snapshot().jobs[0].status, 'blocked'); assert.equal(readFileSync(out, 'utf8'), 'tampered');
  add('two', ['x']); writeFileSync(input, 'input-v2'); await q.drain(async () => assert.fail('changed input ran'));
  assert.equal(q.snapshot().jobs[1].status, 'blocked');
});

test('malformed JSON, checksum, and semantically invalid state stop before mutation', t => {
  const {q, directory, add} = setup(t); add('one'); q.close(); const path = join(directory, 'queue.json'); const original = readFileSync(path, 'utf8');
  for (const broken of ['{', original.replace('"schema":1', '"schema":2')]) {
    writeFileSync(path, broken); assert.throws(() => LocalQueue.open(directory)); assert.equal(readFileSync(path, 'utf8'), broken); assert.equal(existsSync(join(directory, 'owner.json')), false);
  }
  writeFileSync(path, original); rewriteSnapshot(directory, s => s.jobs[0].maxAttempts = 0); assert.throws(() => LocalQueue.open(directory), /corrupt/);
});

function crash(directory: string, input: string, maxAttempts = 3) {
  const childCode = `import {LocalQueue} from ${JSON.stringify(resolve('src/local-queue.ts'))};
    import {readFileSync, writeFileSync, existsSync} from 'node:fs';
    import {join} from 'node:path';
    const q=LocalQueue.open(${JSON.stringify(directory)});
    if(!q.snapshot().jobs.length) q.enqueue({id:'crash',mode:'mock',inputs:[${JSON.stringify(input)}],stages:['audio','video'],maxAttempts:${maxAttempts}});
    await q.drain(async ctx => {
      ctx.writeArtifact('output', ctx.stage+'-'+ctx.attempt);
      if(ctx.stage==='video') process.kill(process.pid,'SIGKILL');
    });`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', childCode], {encoding: 'utf8'});
  assert.equal(result.signal, 'SIGKILL', result.stderr);
}

test('actual process kill: exclusive dead-owner recovery and completed-stage reuse', async t => {
  const {q, directory, input} = setup(t); q.close(); crash(directory, input);
  assert.throws(() => LocalQueue.open(directory), /EEXIST/);
  const resumed = LocalQueue.open(directory, {recoverDeadOwner: true}); t.after(() => resumed.close());
  await assert.rejects(resumed.drain(emit), /recover first/);
});

test('actual process kill: preserve completed output, isolate interrupted output, resume next attempt', async t => {
  const {q, directory, input} = setup(t); q.close(); crash(directory, input);
  const resumed = LocalQueue.open(directory, {recoverDeadOwner: true}); t.after(() => resumed.close());
  await assert.rejects(resumed.drain(emit), /recover first/);
  const restored = resumed.recover(); assert.equal(restored.jobs[0].stages[0].status, 'completed');
  assert.equal(restored.jobs[0].stages[1].attempts[0].status, 'interrupted');
  const before = readFileSync(join(directory, restored.jobs[0].stages[0].outputs[0].file));
  const seen: string[] = []; await resumed.drain(async ctx => {seen.push(ctx.stage); await emit(ctx);});
  assert.deepEqual(seen, ['video']); assert.equal(resumed.snapshot().jobs[0].status, 'completed');
  assert.deepEqual(readFileSync(join(directory, restored.jobs[0].stages[0].outputs[0].file)), before);
  assert.equal(readFileSync(join(directory, 'artifacts/crash/video/1/output'), 'utf8'), 'video-1');
});

test('interrupted attempt uses cumulative cap, no reset on recovery', async t => {
  const {q, directory, input} = setup(t); q.close(); crash(directory, input, 1);
  const resumed = LocalQueue.open(directory, {recoverDeadOwner: true}); t.after(() => resumed.close());
  assert.equal(resumed.recover().jobs[0].status, 'failed'); await resumed.drain(async () => assert.fail('exhausted retry'));
});

test('restore receipt after snapshot loss; corrupt receipt blocks without overwriting', async t => {
  const {q, directory, add} = setup(t); add('one', ['x']); let running = '';
  await q.drain(async ctx => {running = readFileSync(join(directory, 'queue.json'), 'utf8'); await emit(ctx);}); q.close();
  writeFileSync(join(directory, 'queue.json'), running);
  let resumed = LocalQueue.open(directory); assert.equal(resumed.recover().jobs[0].status, 'completed'); await resumed.drain(async () => assert.fail('receipt rerun')); resumed.close();
  writeFileSync(join(directory, 'queue.json'), running); writeFileSync(join(directory, 'artifacts/one/x/1/receipt.json'), '{}');
  resumed = LocalQueue.open(directory); t.after(() => resumed.close()); assert.equal(resumed.recover().jobs[0].status, 'blocked');
  assert.equal(readFileSync(join(directory, 'artifacts/one/x/1/output'), 'utf8'), 'one-x-1');
});

test('artifact writes refuse collisions, traversal, late writes; failed output preserved', async t => {
  const {q, add, directory} = setup(t); add('one', ['x']); let late: (() => void) | undefined;
  await q.drain(async ctx => {
    ctx.writeArtifact('output', 'original'); assert.throws(() => ctx.writeArtifact('output', 'new'), /EEXIST/);
    assert.throws(() => ctx.writeArtifact('../escape', ''), /invalid/); assert.throws(() => ctx.writeArtifact('receipt.json', ''), /invalid/); late = () => ctx.writeArtifact('late', '');
  }); assert.throws(() => late!(), /invalid/); assert.equal(readFileSync(join(directory, 'artifacts/one/x/1/output'), 'utf8'), 'original');
});

test('production bridge requires human approval, rechecks version before running, preserves project', async t => {
  const {q, root} = setup(t); const production = join(root, 'projects');
  const id = createProject(production, {schema: 1, candidates: [{id: 'price-index', title: '物価', hook: '価格とは', concept: '指数'}]}, {demo: true, by: 'test-agent'});
  assert.throws(() => q.enqueueProduction(production, id, ['audio']), /制作を開始できない/);
  selectTopic(production, id, 'price-index', 'test-agent'); addReflection(production, id, '身近な値段を比較して考えます。', 'test-agent');
  const draft = JSON.parse(readFileSync('fixtures/draft-price-index.json', 'utf8'));
  const script = attachScript(production, id, draft, 'test-agent'); assert.throws(() => q.enqueueProduction(production, id, ['audio']), /未承認/);
  reviewWithCheckedFactsForTest(production, id, 'approve', script.hash, '', 'test-agent'); q.enqueueProduction(production, id, ['audio'], 'mock');
  addReflection(production, id, '考察を変更しました。', 'test-agent'); const original = readFileSync(join(production, id, 'job.json'));
  await q.drain(async () => assert.fail('stale approval ran')); assert.equal(q.snapshot().jobs[0].status, 'blocked');
  assert.deepEqual(readFileSync(join(production, id, 'job.json')), original); assert.equal(readdirSync(production).length, 1);
});

test('orphaned attempt directory collision is isolated before writes', async t => {
  const {q, directory, add} = setup(t); add('collision', ['x']); add('good', ['x']);
  const {mkdirSync} = await import('node:fs');
  const dir = join(directory, 'artifacts/collision/x/1'); mkdirSync(dir, {recursive: true}); writeFileSync(join(dir, 'output'), 'old');
  await q.drain(emit); assert.equal(q.snapshot().jobs[0].status, 'blocked'); assert.equal(q.snapshot().jobs[1].status, 'completed');
  assert.equal(readFileSync(join(dir, 'output'), 'utf8'), 'old');
});

test('symlinked artifact directory rejected without writing outside queue', async t => {
  const {q, directory, root, add} = setup(t); add('one', ['x']);
  const {symlinkSync, mkdirSync} = await import('node:fs'); const outside = join(root, 'outside'); mkdirSync(outside);
  symlinkSync(outside, join(directory, 'artifacts'), 'dir'); await q.drain(async () => assert.fail('unsafe directory ran'));
  assert.equal(q.snapshot().jobs[0].status, 'blocked'); assert.deepEqual(readdirSync(outside), []);
});

test('snapshot persistence failure stops queue; verified receipt restores completion', async t => {
  const {q, directory, add} = setup(t); add('one', ['x']); add('two', ['x']);
  const {mkdirSync} = await import('node:fs'); let running = '';
  await assert.rejects(q.drain(async ctx => {
    await emit(ctx); running = readFileSync(join(directory, 'queue.json'), 'utf8'); rmSync(join(directory, 'queue.json')); mkdirSync(join(directory, 'queue.json'));
  }));
  assert.throws(() => q.snapshot(), /persistence failed/); q.close();
  rmSync(join(directory, 'queue.json'), {recursive: true}); writeFileSync(join(directory, 'queue.json'), running);
  const reopened = LocalQueue.open(directory); t.after(() => reopened.close());
  assert.equal(reopened.recover().jobs[0].status, 'completed'); const ran: string[] = [];
  await reopened.drain(async ctx => {ran.push(ctx.job.id); await emit(ctx);}); assert.deepEqual(ran, ['two']);
});

test('stage input version tampering blocks completed reuse', async t => {
  const {q, directory, add} = setup(t); add('one', ['x']); await q.drain(emit); const output = q.snapshot().jobs[0].stages[0].outputs[0].file; q.close();
  rewriteSnapshot(directory, state => state.jobs[0].stages[0].inputVersion = 'a'.repeat(64));
  const reopened = LocalQueue.open(directory); t.after(() => reopened.close()); assert.equal(reopened.recover().jobs[0].status, 'blocked');
  assert.equal(readFileSync(join(directory, output), 'utf8'), 'one-x-1');
});

test('approved production mock queue completes without changing production workflow', async t => {
  const {q, root} = setup(t); const production = join(root, 'projects');
  const id = createProject(production, {schema: 1, candidates: [{id: 'price-index', title: '物価', hook: '価格とは', concept: '指数'}]}, {demo: true, by: 'test-agent'});
  selectTopic(production, id, 'price-index', 'test-agent'); addReflection(production, id, '身近な値段を比較して考えます。', 'test-agent');
  const script = attachScript(production, id, JSON.parse(readFileSync('fixtures/draft-price-index.json', 'utf8')), 'test-agent');
  reviewWithCheckedFactsForTest(production, id, 'approve', script.hash, '', 'test-agent'); const before = readFileSync(join(production, id, 'job.json'));
  q.enqueueProduction(production, id, ['audio', 'video', 'qa'], 'mock'); await q.drain(emit);
  assert.equal(q.snapshot().jobs[0].status, 'completed'); assert.deepEqual(readFileSync(join(production, id, 'job.json')), before);
});

test('missing snapshot cannot silently initialize over old evidence', async t => {
  const {q, directory, add} = setup(t); add('one', ['x']); await q.drain(emit); q.close();
  rmSync(join(directory, 'queue.json')); assert.throws(() => LocalQueue.open(directory), /missing queue state/);
  assert.equal(readFileSync(join(directory, 'artifacts/one/x/1/output'), 'utf8'), 'one-x-1');
});

test('missing completed output blocks even a direct drain', async t => {
  const {q, directory, add} = setup(t); add('one', ['x']); await q.drain(emit);
  rmSync(join(directory, q.snapshot().jobs[0].stages[0].outputs[0].file));
  await q.drain(async () => assert.fail('missing completed output rerun')); assert.equal(q.snapshot().jobs[0].status, 'blocked');
});

test('active drain refuses another drain, enqueue and close; names may contain extensions', async t => {
  const {q, add} = setup(t); add('one', ['x']);
  await q.drain(async ctx => {
    await assert.rejects(q.drain(emit), /already running/); assert.throws(() => add('two'), /draining/); assert.throws(() => q.close(), /running queue/);
    ctx.writeArtifact('audio.wav', 'mock');
  }); assert.equal(q.snapshot().jobs[0].status, 'completed');
});
