// T172: sample/produce コマンドと LocalQueue のオプトイン接続アダプター
import {existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {LocalQueue} from './local-queue.ts';
import type {QueueExecutor, StageContext, QueueJob, QueueState} from './local-queue.ts';
import type {SampleOptions} from './commands/sample.ts';

export const DEFAULT_QUEUE_DIR = 'work/queue';
export const DEFAULT_CONCURRENCY = 1;
export const DEFAULT_MAX_ATTEMPTS = 3;

export type QueueOptions = {
  queueDir?: string;
  concurrency?: number;
  maxAttempts?: number;
  recoverDeadOwner?: boolean;
  timeoutMs?: number;
};

export type RunnerOverrides = {
  sampleRunner?: (opts: SampleOptions) => Promise<{id: string; dir: string}>;
  produceRunner?: (root: string, id: string, opts: SampleOptions) => Promise<{id: string; dir: string}>;
};

export async function openQueue(options: QueueOptions = {}): Promise<LocalQueue> {
  const queueDir = options.queueDir ?? process.env.QUEUE_DIR ?? DEFAULT_QUEUE_DIR;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const timeout = options.timeoutMs ?? 10000;
  const poll = 100;
  const start = Date.now();
  while (true) {
    try {
      return LocalQueue.open(queueDir, {concurrency, recoverDeadOwner: options.recoverDeadOwner ?? true});
    } catch (e: any) {
      if ((e?.message?.includes('owner is alive') || e?.code === 'EEXIST') && Date.now() - start < timeout) {
        await new Promise(r => setTimeout(r, poll));
        continue;
      }
      throw e;
    }
  }
}

// 投入時の描画条件。ジョブの入力として保存・ハッシュ照合し、drainした呼出し側の設定を他のジョブへ流用しない（T172追加修正）。
type RenderRequest = Pick<SampleOptions, 'subtitles' | 'budgetUsd' | 'resolution' | 'renderer' | 'audio'>;
const REQUEST_KEYS = ['subtitles', 'budgetUsd', 'resolution', 'renderer', 'audio'] as const;

function writeRequest(queue: LocalQueue, jobId: string, opts: SampleOptions): string {
  const request: RenderRequest = {};
  for (const k of REQUEST_KEYS) if (opts[k] !== undefined) (request as any)[k] = opts[k];
  const dir = join(queue.root, 'requests');
  mkdirSync(dir, {recursive: true});
  const path = join(dir, `${jobId}.json`);
  writeFileSync(path, JSON.stringify({schema: 1, job: jobId, request}) + '\n', {flag: 'wx', mode: 0o600});
  return path;
}

function readRequest(job: QueueJob): RenderRequest {
  const file = job.inputs[1]?.file;
  if (!file || !file.endsWith(`/requests/${job.id}.json`)) throw Error(`ジョブ ${job.id} に投入時の描画条件の記録がない（旧形式）。今回の設定で代わりに描画しないため、再投入してください`);
  const data = JSON.parse(readFileSync(file, 'utf8'));
  if (data?.schema !== 1 || data.job !== job.id || typeof data.request !== 'object') throw Error(`ジョブ ${job.id} の描画条件の記録が不正`);
  const request: RenderRequest = {};
  for (const k of REQUEST_KEYS) if (data.request[k] !== undefined) (request as any)[k] = data.request[k];
  return request;
}

export function enqueueSample(queue: LocalQueue, opts: SampleOptions = {}): {jobId: string; planPath: string} {
  const rawPlan = opts.plan ?? 'fixtures/sample.json';
  if (!existsSync(rawPlan)) throw Error(`台本ファイルが見つかりません: ${rawPlan}`);
  const planPath = realpathSync(rawPlan);
  if (!lstatSync(planPath).isFile()) throw Error(`台本は通常ファイルである必要があります: ${planPath}`);
  const jobId = `sample-${randomUUID().slice(0, 8)}`;
  const request = writeRequest(queue, jobId, opts);
  try {queue.enqueue({
    id: jobId,
    mode: 'local',
    inputs: [planPath, request],
    stages: ['render'],
    maxAttempts: opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
  });} catch (e) {rmSync(request, {force: true}); throw e;}
  return {jobId, planPath};
}

// 同じ案件の再描画（差戻し・台本更新後など）もキューで扱えるよう、ジョブIDは案件ID＋一意の接尾辞にする。
export function enqueueProduce(queue: LocalQueue, root: string, id: string, maxAttempts = DEFAULT_MAX_ATTEMPTS, opts: SampleOptions = {}): {jobId: string} {
  const jobId = `${id}-${randomUUID().slice(0, 8)}`;
  const request = writeRequest(queue, jobId, opts);
  try {queue.enqueueProduction(root, id, ['render'], 'local', maxAttempts, {jobId, extraInputs: [request]});}
  catch (e) {rmSync(request, {force: true}); throw e;}
  return {jobId};
}

export function createQueueExecutor(
  defaultOpts: SampleOptions = {},
  overrides?: RunnerOverrides
): QueueExecutor {
  return async (context: StageContext) => {
    const j = context.job;
    if (j.production) {
      const prod = j.production;
      const runProduce = overrides?.produceRunner ?? (async (root, id, o) => {
        const {sample} = await import('./commands/sample.ts');
        const {assertRenderable} = await import('./production.ts');
        const {state, planPath} = assertRenderable(root, id);
        return sample({
          ...o,
          queue: false,
          plan: planPath,
          job: {mode: state.mode, project: id, scriptHash: state.script!.hash, scriptVersion: state.script!.version},
        });
      });
      const res = await runProduce(prod.root, prod.id, {...readRequest(j)});
      context.writeArtifact('result.json', JSON.stringify(res));
    } else {
      const runSample = overrides?.sampleRunner ?? (async (o) => {
        const {sample} = await import('./commands/sample.ts');
        return sample({...o, queue: false});
      });
      const res = await runSample({...readRequest(j), plan: j.inputs[0].file});
      context.writeArtifact('result.json', JSON.stringify(res));
    }
  };
}

function extractResult(queue: LocalQueue, job: QueueJob): {id: string; dir: string; jobId: string} {
  const stage = job.stages[0];
  const artifact = stage?.outputs.find(a => a.file.endsWith('/result.json'));
  if (!artifact) throw Error(`ジョブ ${job.id} の実行結果アーティファクトが見つかりません`);
  const data = JSON.parse(readFileSync(join(queue.root, artifact.file), 'utf8'));
  return {...data, jobId: job.id};
}

export async function runSampleWithQueue(
  opts: SampleOptions = {},
  overrides?: RunnerOverrides
): Promise<{id: string; dir: string; jobId: string}> {
  const queue = await openQueue({
    queueDir: opts.queueDir,
    concurrency: opts.concurrency,
    maxAttempts: opts.maxAttempts,
  });
  try {
    const {jobId} = enqueueSample(queue, opts);
    console.log(`[queue] ジョブ ${jobId} をキューに登録しました (キュー: ${queue.root}, 並行数: ${opts.concurrency ?? DEFAULT_CONCURRENCY})`);
    const executor = createQueueExecutor(opts, overrides);
    await queue.drain(executor);
    const snapshot = queue.snapshot();
    const j = snapshot.jobs.find(x => x.id === jobId);
    if (!j) throw Error(`キューからジョブ ${jobId} が消失しました`);
    if (j.status === 'failed') throw Error(`ジョブ ${jobId} の実行に失敗しました: ${j.error ?? 'unknown error'}`);
    if (j.status === 'blocked') throw Error(`ジョブ ${jobId} の実行がブロックされました: ${j.error ?? 'unknown error'}`);
    if (j.status !== 'completed') throw Error(`ジョブ ${jobId} が完了していません: status=${j.status}`);
    return extractResult(queue, j);
  } finally {
    queue.close();
  }
}

export async function runProduceRenderWithQueue(
  root: string,
  id: string,
  opts: SampleOptions = {},
  overrides?: RunnerOverrides
): Promise<{id: string; dir: string; jobId: string}> {
  const queue = await openQueue({
    queueDir: opts.queueDir,
    concurrency: opts.concurrency,
    maxAttempts: opts.maxAttempts,
  });
  try {
    const {jobId} = enqueueProduce(queue, root, id, opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS, opts);
    console.log(`[queue] 制作案件 ${id} のレンダリングジョブをキューに登録しました (キュー: ${queue.root}, 並行数: ${opts.concurrency ?? DEFAULT_CONCURRENCY})`);
    const executor = createQueueExecutor(opts, overrides);
    await queue.drain(executor);
    const snapshot = queue.snapshot();
    const j = snapshot.jobs.find(x => x.id === jobId);
    if (!j) throw Error(`キューからジョブ ${jobId} が消失しました`);
    if (j.status === 'failed') throw Error(`ジョブ ${jobId} の実行に失敗しました: ${j.error ?? 'unknown error'}`);
    if (j.status === 'blocked') throw Error(`ジョブ ${jobId} の実行がブロックされました: ${j.error ?? 'unknown error'}`);
    if (j.status !== 'completed') throw Error(`ジョブ ${jobId} が完了していません: status=${j.status}`);
    const result = extractResult(queue, j);
    // キュー完了後に制作案件へレンダリング結果を紐付ける
    const {assertRenderable, linkRender} = await import('./production.ts');
    const {state} = assertRenderable(root, id);
    linkRender(root, id, result.id, state.script!.hash, state.script!.version);
    return result;
  } finally {
    queue.close();
  }
}

export async function processQueue(
  options: QueueOptions = {},
  overrides?: RunnerOverrides
): Promise<QueueState> {
  const queue = await openQueue(options);
  try {
    const executor = createQueueExecutor({}, overrides);
    await queue.drain(executor);
    return queue.snapshot();
  } finally {
    queue.close();
  }
}
