// 制作ジョブの管理（T033）。一覧、中断ジョブの検出、abandon、退避。
// 退避は削除ではなく outputs/_trash/ と outputs/_archive/ への移動（元に戻せる）。既存の退避先は上書きしない（T094）。
import {existsSync, lstatSync, readdirSync, renameSync, mkdirSync, statSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {approvalOf, readJob} from './review.ts';

export const JOB_ID = /^[-a-z0-9]+-[a-f0-9]{8}$/;
// outputs/ 直下で退避しないもの。
export const KEEP = new Set(['latest.json', '.gitkeep', '_trash', '_archive', '.DS_Store']);
// pidの記録がない旧ジョブが running のまま、この時間を過ぎたら中断扱い。
export const STALE_AFTER_MS = 60 * 60 * 1000;

export type JobSummary = {id: string; status: string; createdAt: string; durationSeconds?: number; subtitles?: string; stale: boolean; approval: string};

function alive(pid: unknown) {
  if (!Number.isInteger(pid)) return false;
  try {
    process.kill(pid as number, 0);
    return true;
  } catch (e: any) {
    return e?.code === 'EPERM';
  }
}

// runningなのにプロセスがない（またはpid記録がなく古い）ジョブは中断扱い。
export function isStale(job: any, now = Date.now()) {
  if (job.status !== 'running') return false;
  if (job.pid !== undefined) return !alive(job.pid);
  return now - Date.parse(job.createdAt) > STALE_AFTER_MS;
}

export function jobDirs(root = 'outputs') {
  if (!existsSync(root)) return [];
  return readdirSync(root).filter(n => JOB_ID.test(n) && existsSync(join(root, n, 'job.json'))).map(n => join(root, n));
}

export function listJobs(root = 'outputs'): JobSummary[] {
  return jobDirs(root).map(dir => {
    const j = readJob(dir);
    return {id: j.id, status: j.status, createdAt: j.createdAt, durationSeconds: j.durationSeconds, subtitles: j.subtitles, stale: isStale(j), approval: approvalOf(dir).state};
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function abandon(root: string, id: string, note: string) {
  if (!JOB_ID.test(id)) throw Error('不正なジョブID');
  const dir = join(root, id);
  const j = readJob(dir);
  if (j.status !== 'running') throw Error(`runningのジョブだけabandonできる（${j.status}）`);
  if (!isStale(j)) throw Error('プロセスが動作中の可能性があるためabandonしない');
  Object.assign(j, {status: 'abandoned', abandonedAt: new Date().toISOString(), abandonNote: note || '中断を確認'});
  writeFileSync(join(dir, 'job.json'), JSON.stringify(j, null, 2));
  return j;
}

export type CleanPlan = {jobs: {id: string; status: string}[]; loose: string[]};

// 退避候補: failed/abandonedのジョブ、ジョブ以外の直下ファイル（旧引き渡しコピーなど）。
export function planClean(root = 'outputs'): CleanPlan {
  const jobs = jobDirs(root).map(d => readJob(d)).filter(j => j.status === 'failed' || j.status === 'abandoned').map(j => ({id: j.id, status: j.status}));
  const loose = existsSync(root) ? readdirSync(root).filter(n => !KEEP.has(n) && !(JOB_ID.test(n) && statSync(join(root, n)).isDirectory())) : [];
  return {jobs, loose};
}

// 退避先と同名のファイル・ディレクトリがあれば、何も移動せずに拒否する（T094）。
// renameは既存ファイルや空ディレクトリを黙って置き換えるため、移動の直前にも確認する。
// 途中で失敗したときは、移動済みの項目を error.moved とメッセージで返す。
export function applyClean(root: string, plan: CleanPlan, stamp = new Date().toISOString().slice(0, 10)) {
  const moves = [
    ...plan.jobs.map(j => ({from: j.id, to: `_trash/${j.id}`})),
    ...plan.loose.map(n => ({from: n, to: `_archive/${stamp}/${n}`})),
  ];
  const taken = (rel: string) => existsSync(join(root, rel)) || isLink(join(root, rel));
  const conflicts = moves.filter(m => taken(m.to)).map(m => m.to);
  if (conflicts.length) throw Error(`退避先が既に存在するため、何も移動していない: ${conflicts.join(', ')}。退避済みのものを別名にするか、別の場所へ移してから再実行する`);
  const moved: string[] = [];
  try {
    for (const m of moves) {
      mkdirSync(dirname(join(root, m.to)), {recursive: true});
      if (taken(m.to)) throw Error(`退避先が既に存在する: ${m.to}`);
      renameSync(join(root, m.from), join(root, m.to));
      moved.push(`${m.from} → ${m.to}`);
    }
  } catch (e: any) {
    const err: any = Error(`退避の途中で失敗: ${e?.message ?? e}。移動済み: ${moved.length ? moved.join(', ') : 'なし'}。未移動の項目は元の場所に残っている`);
    err.moved = moved;
    throw err;
  }
  return moved;
}

function isLink(path: string) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}
