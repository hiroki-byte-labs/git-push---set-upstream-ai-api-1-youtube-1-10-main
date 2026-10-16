// T141: opt-in local/mock queue. Does not render, publish, or mutate existing production jobs.
import {closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {isAbsolute, join, relative, resolve} from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {ConnError} from './connections.ts';
import {assertRenderable} from './production.ts';
import {assessStagePrerequisites} from './orchestration-pipeline.ts';

export type Artifact = {file: string; sha256: string};
type Status = 'queued' | 'running' | 'completed' | 'failed' | 'blocked';
export type QueueAttempt = {number: number; directory: string; status: 'running' | 'completed' | 'failed' | 'interrupted'; charge: 'none' | 'unknown'; error?: string};
export type QueueStage = {name: string; status: Status; inputVersion?: string; outputs: Artifact[]; attempts: QueueAttempt[]};
export type QueueJob = {id: string; mode: 'local' | 'mock'; inputs: Artifact[]; stages: QueueStage[]; status: Status; maxAttempts: number; production?: {root: string; id: string; scriptHash: string}; error?: string};
export type QueueState = {schema: 1; concurrency: number; jobs: QueueJob[]; events: {sequence: number; job: string; stage?: string; status: string}[]};
export type QueueTask = {id: string; mode: 'local' | 'mock'; inputs: string[]; stages: string[]; maxAttempts?: number};
export type StageContext = {job: Readonly<QueueJob>; stage: string; attempt: number; previous: Artifact[]; writeArtifact(name: string, data: string | Buffer): Artifact};
// Executors must be local/mock only, with effects confined to writeArtifact. No external retry contract.
export type QueueExecutor = (context: StageContext) => Promise<void>;
const hash = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
const digest = (v: unknown) => hash(JSON.stringify(v));
const token = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(v);
const sha = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const integer = (v: unknown, max: number): v is number => Number.isInteger(v) && Number(v) >= 1 && Number(v) <= max;
function checkArtifact(a: Artifact) {
  if (!a || typeof a.file !== 'string' || !a.file || !sha(a.sha256)) throw Error('corrupt artifact record');
}
function validate(s: QueueState) {
  if (!s || s.schema !== 1 || !integer(s.concurrency, 16) || !Array.isArray(s.jobs) || !Array.isArray(s.events)) throw Error('corrupt queue state');
  const ids = new Set<string>();
  for (const j of s.jobs) {
    if (!token(j?.id) || ids.has(j.id) || !['local', 'mock'].includes(j.mode) || !integer(j.maxAttempts, 10) || !['queued', 'running', 'completed', 'failed', 'blocked'].includes(j.status) || !Array.isArray(j.inputs) || !j.inputs.length || !Array.isArray(j.stages) || !j.stages.length) throw Error('corrupt queue job');
    ids.add(j.id); j.inputs.forEach(a => {checkArtifact(a); if (!isAbsolute(a.file)) throw Error('corrupt input path');});
    if (j.production && (!isAbsolute(j.production.root) || !token(j.production.id) || !sha(j.production.scriptHash))) throw Error('corrupt production binding');
    const names = new Set<string>(); let unfinished = false;
    for (const st of j.stages) {
      if (!token(st?.name) || names.has(st.name) || !['queued', 'running', 'completed', 'failed', 'blocked'].includes(st.status) || !Array.isArray(st.outputs) || !Array.isArray(st.attempts) || st.attempts.length > j.maxAttempts || (st.inputVersion !== undefined && !sha(st.inputVersion))) throw Error('corrupt queue stage');
      names.add(st.name); st.outputs.forEach(checkArtifact);
      st.attempts.forEach((a, i) => {
        if (a.number !== i + 1 || a.directory !== `artifacts/${j.id}/${st.name}/${a.number}` || !['running', 'completed', 'failed', 'interrupted'].includes(a.status) || !['none', 'unknown'].includes(a.charge)) throw Error('corrupt attempt');
      });
      if (st.status === 'completed' && (!st.inputVersion || !st.outputs.length || st.attempts.at(-1)?.status !== 'completed')) throw Error('corrupt completion');
      if (st.status === 'running' && st.attempts.at(-1)?.status !== 'running') throw Error('corrupt running stage');
      if (st.status === 'completed' && unfinished) throw Error('corrupt stage ordering');
      if (st.status !== 'completed') unfinished = true;
    }
    if (j.status === 'completed' && j.stages.some(st => st.status !== 'completed')) throw Error('corrupt completed job');
  }
  s.events.forEach((e, i) => {if (e.sequence !== i + 1 || !ids.has(e.job) || typeof e.status !== 'string') throw Error('corrupt event');});
}
// fsync + atomic rename: torn writes leave the previous checked snapshot; no backup fallback.
function store(file: string, value: unknown) {
  const temp = `${file}.${randomUUID()}.tmp`;
  const fd = openSync(temp, 'wx', 0o600);
  try {writeFileSync(fd, JSON.stringify({value, sha256: digest(value)})); fsyncSync(fd);} finally {closeSync(fd);}
  renameSync(temp, file);
  const dir = openSync(resolve(file, '..'), 'r');
  try {fsyncSync(dir);} finally {closeSync(dir);}
}
function load(file: string): any {
  const envelope = JSON.parse(readFileSync(file, 'utf8'));
  if (!envelope || !sha(envelope.sha256) || digest(envelope.value) !== envelope.sha256) throw Error('checksum mismatch: ' + file);
  return envelope.value;
}

export class LocalQueue {
  readonly root: string;
  private state: QueueState;
  private closed = false;
  private draining = false;
  private poisoned = false;
  private constructor(root: string, concurrency: number, recoverDeadOwner: boolean) {
    mkdirSync(root, {recursive: true}); this.root = realpathSync(root);
    const lock = join(this.root, 'owner.json');
    if (existsSync(lock) && recoverDeadOwner) {
      const recoveryLock = join(this.root, 'recovery.lock');
      writeFileSync(recoveryLock, '', {flag: 'wx', mode: 0o600});
      try {
        const owner = JSON.parse(readFileSync(lock, 'utf8'));
        if (!integer(owner.pid, 2 ** 31 - 1)) throw Error('corrupt queue owner');
        try {process.kill(owner.pid, 0); throw Error('queue owner is alive');}
        catch (e) {if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e;}
        rmSync(lock);
      } finally {rmSync(recoveryLock);}
    }
    writeFileSync(lock, JSON.stringify({pid: process.pid}), {flag: 'wx', mode: 0o600});
    try {
      const file = join(this.root, 'queue.json');
      if (existsSync(file)) {this.state = load(file); validate(this.state); if (this.state.concurrency !== concurrency) throw Error('concurrency differs from persisted configuration');}
      else {
        if (readdirSync(this.root).some(name => name !== 'owner.json')) throw Error('missing queue state in nonempty directory; preserve evidence');
        this.state = {schema: 1, concurrency, jobs: [], events: []}; this.save();
      }
    } catch (e) {rmSync(lock); throw e;}
  }
  static open(root: string, options: {concurrency?: number; recoverDeadOwner?: boolean} = {}) {
    const concurrency = options.concurrency ?? 1;
    if (!integer(concurrency, 16)) throw Error('concurrency must be 1..16');
    return new LocalQueue(root, concurrency, options.recoverDeadOwner ?? false);
  }
  private usable() {if (this.closed || this.poisoned) throw Error('queue closed or persistence failed; reopen and recover');}
  private save() {
    try {validate(this.state); store(join(this.root, 'queue.json'), this.state);} catch (e) {this.poisoned = true; throw e;}
  }
  snapshot(): QueueState {this.usable(); return structuredClone(this.state);}
  close() {if (this.draining) throw Error('cannot close a running queue'); if (!this.closed) {rmSync(join(this.root, 'owner.json'), {force: true}); this.closed = true;}}
  private event(j: QueueJob, status: string, stage?: string) {this.state.events.push({sequence: this.state.events.length + 1, job: j.id, status, ...(stage ? {stage} : {})});}
  enqueue(task: QueueTask) {
    if (task.id.startsWith('production-')) throw Error('use enqueueProduction for production projects');
    this.enqueueTask(task);
  }
  private enqueueTask(task: QueueTask, production?: QueueJob['production']) {
    this.usable(); if (this.draining) throw Error('enqueue while draining is disabled');
    if (!token(task.id) || this.state.jobs.some(j => j.id === task.id)) throw Error('invalid or duplicate job id');
    if (!['local', 'mock'].includes(task.mode) || !integer(task.maxAttempts ?? 3, 10) || !Array.isArray(task.inputs) || !task.inputs.length || !Array.isArray(task.stages) || !task.stages.length || task.stages.some(n => !token(n)) || new Set(task.stages).size !== task.stages.length) throw Error('invalid local/mock task');
    const inputs = task.inputs.map(file => {const path = realpathSync(file); if (!lstatSync(path).isFile()) throw Error('input must be a file'); return {file: path, sha256: hash(readFileSync(path))};});
    const j: QueueJob = {id: task.id, mode: task.mode, inputs, maxAttempts: task.maxAttempts ?? 3, stages: task.stages.map(name => ({name, status: 'queued', outputs: [], attempts: []})), status: 'queued', ...(production ? {production} : {})};
    this.state.jobs.push(j); this.event(j, 'enqueued'); this.save();
  }
  enqueueProduction(root: string, id: string, stages: string[], mode: 'local' | 'mock' = 'local', maxAttempts = 3) {
    const {state, planPath} = assertRenderable(root, id);
    const assessment = assessStagePrerequisites(root, id);
    if (!assessment.canProceed || assessment.currentStage !== 'render') throw Error('production is waiting for human review');
    this.enqueueTask({id, mode, inputs: [planPath], stages, maxAttempts}, {root: realpathSync(root), id, scriptHash: state.script!.hash});
  }
  private outputPath(file: string) {
    if (isAbsolute(file) || file.split('/').some(p => !p || p === '.' || p === '..')) throw Error('unsafe artifact path');
    const path = join(this.root, file);
    const actual = realpathSync(path);
    if (relative(this.root, actual).startsWith('..') || lstatSync(path).isSymbolicLink() || !lstatSync(actual).isFile()) throw Error('unsafe artifact file');
    return actual;
  }
  private claimAttempt(directory: string) {
    const parts = directory.split('/'); let parent = this.root;
    for (const part of parts.slice(0, -1)) {
      parent = join(parent, part);
      if (!existsSync(parent)) mkdirSync(parent);
      if (lstatSync(parent).isSymbolicLink() || !lstatSync(parent).isDirectory()) throw Error('unsafe artifact directory');
    }
    // An orphaned or colliding attempt directory is evidence, never reused or renamed away.
    mkdirSync(join(this.root, directory));
  }
  private verify(j: QueueJob) {
    for (const a of j.inputs) if (hash(readFileSync(a.file)) !== a.sha256) throw Error('input hash mismatch');
    if (j.production) {
      const {state} = assertRenderable(j.production.root, j.production.id);
      if (state.script!.hash !== j.production.scriptHash) throw Error('production input version changed');
      const assessment = assessStagePrerequisites(j.production.root, j.production.id);
      if (!assessment.canProceed || assessment.currentStage !== 'render') throw Error('production is waiting for human review');
    }
    for (const st of j.stages) {
      if (st.attempts.some(a => a.charge === 'unknown')) throw Error('unknown cost; automatic resend disabled');
      if (st.status === 'completed') {
        if (st.inputVersion !== this.version(j, st)) throw Error('stage input version mismatch');
        this.verifyOutputs(st.outputs, st.attempts.at(-1)!.directory);
      }
    }
  }
  private version(j: QueueJob, st: QueueStage) {return digest({inputs: j.inputs, production: j.production ?? null, stage: st.name, previous: j.stages.slice(0, j.stages.indexOf(st)).map(s => ({name: s.name, outputs: s.outputs}))});}
  private verifyOutputs(outputs: Artifact[], directory: string) {
    if (!outputs.length || new Set(outputs.map(a => a.file)).size !== outputs.length) throw Error('empty or duplicate outputs');
    for (const a of outputs) {
      checkArtifact(a);
      if (!a.file.startsWith(directory + '/') || hash(readFileSync(this.outputPath(a.file))) !== a.sha256) throw Error('artifact hash mismatch');
    }
  }
  // Explicit offline resume. Running attempts without receipts remain isolated and count toward the limit.
  recover() {
    this.usable(); if (this.draining) throw Error('queue is running');
    for (const j of this.state.jobs) {
      if (j.status === 'blocked' || j.status === 'failed') continue;
      try {
        this.verify(j);
        for (const st of j.stages) if (st.status === 'running') {
          const a = st.attempts.at(-1)!; const receipt = join(this.root, a.directory, 'receipt.json');
          if (existsSync(receipt)) {
            const r = load(this.outputPath(`${a.directory}/receipt.json`));
            if (r.job !== j.id || r.stage !== st.name || r.attempt !== a.number || r.inputVersion !== this.version(j, st) || !Array.isArray(r.outputs)) throw Error('corrupt completion receipt');
            this.verifyOutputs(r.outputs, a.directory); st.outputs = r.outputs; st.inputVersion = r.inputVersion; st.status = 'completed'; a.status = 'completed';
            this.event(j, 'restored', st.name);
          } else {a.status = 'interrupted'; a.error = 'interrupted local/mock attempt'; st.status = st.attempts.length < j.maxAttempts ? 'queued' : 'failed'; this.event(j, 'interrupted', st.name);}
        }
        this.verify(j);
        j.status = j.stages.every(s => s.status === 'completed') ? 'completed' : j.stages.some(s => s.status === 'failed') ? 'failed' : 'queued';
      } catch (e) {j.status = 'blocked'; j.error = String(e); this.event(j, 'blocked');}
    }
    this.save(); return this.snapshot();
  }
  async drain(execute: QueueExecutor) {
    this.usable(); if (this.draining) throw Error('queue already running');
    if (this.state.jobs.some(j => j.status === 'running')) throw Error('interrupted queue; recover first');
    this.recover(); // Validate even completed jobs on every drain, without re-executing them.
    this.draining = true;
    try {
      const worker = async () => {
        while (!this.poisoned) {
          const j = this.state.jobs.find(j => j.status === 'queued'); if (!j) return;
          try {this.verify(j);} catch (e) {j.status = 'blocked'; j.error = String(e); this.event(j, 'blocked'); this.save(); continue;}
          j.status = 'running'; this.event(j, 'running'); this.save();
          await this.runJob(j, execute);
        }
      };
      const results = await Promise.allSettled(Array.from({length: this.state.concurrency}, worker));
      const failure = results.find(r => r.status === 'rejected'); if (failure?.status === 'rejected') throw failure.reason;
      this.usable(); return this.snapshot();
    } finally {this.draining = false;}
  }
  private async runJob(j: QueueJob, execute: QueueExecutor) {
    for (const st of j.stages) {
      if (st.status === 'completed') continue;
      while (st.attempts.length < j.maxAttempts) {
        this.usable();
        try {this.verify(j);} catch (e) {j.status = 'blocked'; j.error = String(e); this.event(j, 'blocked'); this.save(); return;}
        const number = st.attempts.length + 1, directory = `artifacts/${j.id}/${st.name}/${number}`;
        try {this.claimAttempt(directory);} catch (e) {
          j.status = 'blocked'; j.error = String(e); this.event(j, 'blocked', st.name); this.save(); return;
        }
        const a: QueueAttempt = {number, directory, status: 'running', charge: 'none'};
        st.attempts.push(a); st.status = 'running'; st.inputVersion = this.version(j, st); this.event(j, 'running', st.name); this.save();
        const outputs: Artifact[] = []; let failure: unknown; let failed = false; let accepting = true;
        try {
          await execute({job: structuredClone(j), stage: st.name, attempt: number, previous: structuredClone(j.stages.slice(0, j.stages.indexOf(st)).flatMap(s => s.outputs)), writeArtifact: (name, data) => {
            this.usable(); if (!accepting || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,119}$/.test(name) || name === 'receipt.json') throw Error('invalid artifact write');
            const file = `${directory}/${name}`;
            writeFileSync(join(this.root, file), data, {flag: 'wx', mode: 0o600});
            const fd = openSync(join(this.root, file), 'r'); try {fsyncSync(fd);} finally {closeSync(fd);}
            const artifact = {file, sha256: hash(readFileSync(this.outputPath(file)))}; outputs.push(artifact); return artifact;
          }});
          this.verify(j); this.verifyOutputs(outputs, directory);
        } catch (e) {failure = e; failed = true;} finally {accepting = false;}
        this.usable();
        if (failed) {
          a.status = 'failed'; a.error = String(failure); a.charge = failure instanceof ConnError ? failure.charge : 'none';
          const retry = failure instanceof ConnError && ['SERVER', 'RATE_LIMIT'].includes(failure.code) && a.charge === 'none' && number < j.maxAttempts;
          st.status = retry ? 'queued' : a.charge === 'unknown' ? 'blocked' : 'failed'; this.event(j, st.status, st.name);
          if (!retry) {j.status = st.status; j.error = a.error; this.save(); return;}
          this.save(); continue;
        }
        // Receipt precedes snapshot: a crash in between restores verified completion without re-execution.
        try {store(join(this.root, directory, 'receipt.json'), {job: j.id, stage: st.name, attempt: number, inputVersion: st.inputVersion, outputs});}
        catch (e) {this.poisoned = true; throw e;}
        st.outputs = outputs; st.status = 'completed'; a.status = 'completed'; this.event(j, 'completed', st.name); this.save(); break;
      }
    }
    j.status = 'completed'; this.event(j, 'completed'); this.save();
  }
}
