import {reviewWithCheckedFactsForTest} from './helpers/checked-facts.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseSampleArgs} from '../src/commands/sample.ts';
import {
  openQueue,
  enqueueSample,
  enqueueProduce,
  createQueueExecutor,
  runSampleWithQueue,
  runProduceRenderWithQueue,
  processQueue,
} from '../src/queue-adapter.ts';
import {LocalQueue} from '../src/local-queue.ts';
import {createProject, selectTopic, addReflection, attachScript} from '../src/production.ts';

function createTempDir(prefix: string) {
  return mkdtempSync(join(tmpdir(), prefix));
}

test('parseSampleArgs parses --queue, --queue-dir, and --concurrency correctly', () => {
  const args = ['--plan', 'fixtures/sample.json', '--queue', '--queue-dir', 'work/custom-queue', '--concurrency', '4'];
  const opts = parseSampleArgs(args);
  assert.equal(opts.plan, 'fixtures/sample.json');
  assert.equal(opts.queue, true);
  assert.equal(opts.queueDir, 'work/custom-queue');
  assert.equal(opts.concurrency, 4);

  assert.throws(
    () => parseSampleArgs(['--unknown']),
    /不明な引数: --unknown/
  );
});

test('runSampleWithQueue executes sample via LocalQueue and persists verified state', async t => {
  const tempDir = createTempDir('queue-sample-');
  t.after(() => rmSync(tempDir, {recursive: true, force: true}));

  let runnerCalled = false;
  const mockSampleRunner = async (opts: any) => {
    runnerCalled = true;
    return {id: 'sample-mock-1234', dir: join(tempDir, 'outputs/sample-mock-1234')};
  };

  const result = await runSampleWithQueue(
    {
      plan: 'fixtures/sample.json',
      queue: true,
      queueDir: tempDir,
      concurrency: 1,
    },
    {sampleRunner: mockSampleRunner}
  );

  assert.equal(runnerCalled, true);
  assert.equal(result.id, 'sample-mock-1234');
  assert.ok(result.jobId.startsWith('sample-'));

  // キューの状態が completed で保存されていることを確認
  const queueFile = join(tempDir, 'queue.json');
  assert.ok(existsSync(queueFile));
  const queueData = JSON.parse(readFileSync(queueFile, 'utf8'));
  assert.equal(queueData.value.jobs.length, 1);
  const job = queueData.value.jobs[0];
  assert.equal(job.id, result.jobId);
  assert.equal(job.status, 'completed');
  assert.equal(job.stages[0].status, 'completed');

  // receipt.json が生成されていることを確認
  const attemptDir = job.stages[0].attempts[0].directory;
  const receiptFile = join(tempDir, attemptDir, 'receipt.json');
  assert.ok(existsSync(receiptFile));
  const receipt = JSON.parse(readFileSync(receiptFile, 'utf8'));
  assert.equal(receipt.value.job, result.jobId);
  assert.equal(receipt.value.stage, 'render');
});

test('runProduceRenderWithQueue checks prerequisites and links render on completion', async t => {
  const tempDir = createTempDir('queue-prod-');
  t.after(() => rmSync(tempDir, {recursive: true, force: true}));
  const queueDir = join(tempDir, 'queue');
  const prodRoot = join(tempDir, 'projects');

  const id = createProject(
    prodRoot,
    {schema: 1, candidates: [{id: 'price-index', title: '物価の決まり方', hook: '価格とは', concept: '指数'}]},
    {demo: true, by: 'test-agent'}
  );

  // 台本未承認のときはキュー投入で失敗することを確認
  await assert.rejects(
    runProduceRenderWithQueue(prodRoot, id, {queueDir, concurrency: 1}),
    /制作を開始できない/
  );

  // 正常フローを進める: 選択 → 考察 → 台本作成 → 事実確認 → 台本承認
  selectTopic(prodRoot, id, 'price-index', 'test-agent');
  addReflection(prodRoot, id, '身近な価格変動から考えます。', 'test-agent');
  const draft = JSON.parse(readFileSync('fixtures/draft-price-index.json', 'utf8'));
  const script = attachScript(prodRoot, id, draft, 'test-agent');

  reviewWithCheckedFactsForTest(prodRoot, id, 'approve', script.hash, '', 'test-reviewer');

  let produceRunnerCalled = false;
  const mockProduceRunner = async (root: string, projId: string, opts: any) => {
    produceRunnerCalled = true;
    return {id: 'render-job-999', dir: join(root, projId, 'render-job-999')};
  };

  const result = await runProduceRenderWithQueue(
    prodRoot,
    id,
    {queueDir, concurrency: 1},
    {produceRunner: mockProduceRunner}
  );

  assert.equal(produceRunnerCalled, true);
  assert.equal(result.id, 'render-job-999');
  assert.ok(result.jobId.startsWith(`${id}-`));

  // 制作プロジェクト側の job.json にレンダリング履歴が紐付いていることを確認
  const prodJob = JSON.parse(readFileSync(join(prodRoot, id, 'job.json'), 'utf8'));
  assert.equal(prodJob.workflow.renders.length, 1);
  assert.equal(prodJob.workflow.renders[0].jobId, 'render-job-999');
});

test('FIFO queue serializes execution when concurrency is 1', async t => {
  const tempDir = createTempDir('queue-fifo-');
  t.after(() => rmSync(tempDir, {recursive: true, force: true}));

  const queue = await openQueue({queueDir: tempDir, concurrency: 1});
  const inputPath = 'fixtures/sample.json';

  // 3つのジョブを登録
  queue.enqueue({id: 'job-1', mode: 'local', inputs: [inputPath], stages: ['render'], maxAttempts: 3});
  queue.enqueue({id: 'job-2', mode: 'local', inputs: [inputPath], stages: ['render'], maxAttempts: 3});
  queue.enqueue({id: 'job-3', mode: 'local', inputs: [inputPath], stages: ['render'], maxAttempts: 3});

  let activeCount = 0;
  let maxActive = 0;
  const executionOrder: string[] = [];

  const executor = async (ctx: any) => {
    activeCount++;
    maxActive = Math.max(maxActive, activeCount);
    executionOrder.push(ctx.job.id);
    // 非同期処理をシミュレート
    await new Promise(r => setTimeout(r, 20));
    ctx.writeArtifact('result.json', JSON.stringify({job: ctx.job.id}));
    activeCount--;
  };

  await queue.drain(executor);
  const snapshot = queue.snapshot();
  queue.close();

  assert.equal(maxActive, 1, 'concurrency=1のとき同時実行数は最大1であること');
  assert.deepEqual(executionOrder, ['job-1', 'job-2', 'job-3'], 'FIFO順序で実行されること');

  assert.ok(snapshot.jobs.every(j => j.status === 'completed'));
});

test('concurrent queue respects concurrency limit of 2', async t => {
  const tempDir = createTempDir('queue-conc-');
  t.after(() => rmSync(tempDir, {recursive: true, force: true}));

  const queue = await openQueue({queueDir: tempDir, concurrency: 2});
  const inputPath = 'fixtures/sample.json';

  for (let i = 1; i <= 4; i++) {
    queue.enqueue({id: `task-${i}`, mode: 'local', inputs: [inputPath], stages: ['render'], maxAttempts: 3});
  }

  let activeCount = 0;
  let maxActive = 0;
  const completedTasks: string[] = [];

  const executor = async (ctx: any) => {
    activeCount++;
    maxActive = Math.max(maxActive, activeCount);
    await new Promise(r => setTimeout(r, 25));
    completedTasks.push(ctx.job.id);
    ctx.writeArtifact('result.json', JSON.stringify({done: true}));
    activeCount--;
  };

  await queue.drain(executor);
  const snapshot = queue.snapshot();
  queue.close();

  assert.equal(maxActive, 2, 'concurrency=2のとき同時実行数は最大2であること');
  assert.equal(completedTasks.length, 4, '4つのタスクすべてが完了すること');

  assert.ok(snapshot.jobs.every(j => j.status === 'completed'));
});

test('failure records error and updates state safely', async t => {
  const tempDir = createTempDir('queue-err-');
  t.after(() => rmSync(tempDir, {recursive: true, force: true}));

  const queue = await openQueue({queueDir: tempDir, concurrency: 1});
  const inputPath = 'fixtures/sample.json';

  queue.enqueue({id: 'fail-job', mode: 'local', inputs: [inputPath], stages: ['render'], maxAttempts: 1});

  const executor = async (ctx: any) => {
    throw Error('故意のレンダリング障害');
  };

  await queue.drain(executor);
  const snapshot = queue.snapshot();
  queue.close();

  const failedJob = snapshot.jobs.find(j => j.id === 'fail-job');
  assert.ok(failedJob);
  assert.equal(failedJob.status, 'failed');
  assert.ok(failedJob.error?.includes('故意のレンダリング障害'));
  assert.equal(failedJob.stages[0].attempts.length, 1);
  assert.equal(failedJob.stages[0].attempts[0].status, 'failed');
});

test('先に積まれたジョブは自分の台本・実行条件で描画する（今回の呼出しの設定を流用しない。T172追加修正）', async t => {
  const tempDir = createTempDir('queue-own-opts-');
  t.after(() => rmSync(tempDir, {recursive: true, force: true}));
  const queue = await openQueue({queueDir: tempDir, concurrency: 1});
  const first = enqueueSample(queue, {plan: 'fixtures/sample.json', subtitles: 'soft', resolution: 1080});
  queue.close();
  const calls: any[] = [];
  const result = await runSampleWithQueue(
    {plan: 'fixtures/draft-price-index.json', subtitles: 'burn', queue: true, queueDir: tempDir, concurrency: 1},
    {sampleRunner: async (o: any) => {calls.push(o); return {id: `out-${calls.length}`, dir: tempDir};}}
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[0].plan, first.planPath);
  assert.equal(calls[0].subtitles, 'soft');
  assert.equal(calls[0].resolution, 1080);
  assert.match(calls[1].plan, /draft-price-index\.json$/);
  assert.equal(calls[1].subtitles, 'burn');
  assert.equal(calls[1].resolution, undefined);
  assert.equal(result.id, 'out-2');
});

test('描画済みの制作案件を同じキューで再描画できる（T172追加修正）', async t => {
  const tempDir = createTempDir('queue-rerender-');
  t.after(() => rmSync(tempDir, {recursive: true, force: true}));
  const queueDir = join(tempDir, 'queue');
  const prodRoot = join(tempDir, 'projects');
  const id = createProject(prodRoot, {schema: 1, candidates: [{id: 'price-index', title: '物価の決まり方', hook: '価格とは', concept: '指数'}]}, {demo: true, by: 'test-agent'});
  selectTopic(prodRoot, id, 'price-index', 'test-agent');
  addReflection(prodRoot, id, '身近な価格変動から考えます。', 'test-agent');
  const script = attachScript(prodRoot, id, JSON.parse(readFileSync('fixtures/draft-price-index.json', 'utf8')), 'test-agent');
  reviewWithCheckedFactsForTest(prodRoot, id, 'approve', script.hash, '', 'test-reviewer');
  const seen: any[] = [];
  const runner = {produceRunner: async (root: string, projId: string, o: any) => {seen.push(o); return {id: `render-${seen.length}`, dir: join(root, projId)};}};
  const r1 = await runProduceRenderWithQueue(prodRoot, id, {queueDir, concurrency: 1, subtitles: 'soft'}, runner);
  const r2 = await runProduceRenderWithQueue(prodRoot, id, {queueDir, concurrency: 1, subtitles: 'burn'}, runner);
  assert.notEqual(r1.jobId, r2.jobId);
  assert.ok(r1.jobId.startsWith(id) && r2.jobId.startsWith(id));
  assert.deepEqual(seen.map(o => o.subtitles), ['soft', 'burn']);
  const prodJob = JSON.parse(readFileSync(join(prodRoot, id, 'job.json'), 'utf8'));
  assert.deepEqual(prodJob.workflow.renders.map((r: any) => r.jobId), ['render-1', 'render-2']);
});
