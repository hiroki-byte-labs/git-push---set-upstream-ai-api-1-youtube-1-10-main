// 版に結び付いた承認・差戻し（T033、T095）。<job>/review.json に履歴を追記する。
// 承認は「確認対象一式」（reviewBundle）の版に結び付き、承認時と現在の版が一致する間だけ有効（変更で失効）。
// 一式: 完成動画、採用タイトル・概要欄・タグ・チャプター（metadata.json）、字幕（subtitles.vtt）、サムネイル案すべて。
// 採用サムネイルを選ぶ機能がないため、当面は全案を対象にする。台本・検査記録・見直し履歴・review.json・時刻は対象外。
// 投稿はしない（Publisherは無効のまま）。M3のYouTube投稿（T032）はこの状態を前提にする。
import {existsSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

export type Decision = 'approve' | 'reject';
// bundleHashがない記録はT095より前の旧形式（動画のハッシュだけに結び付いた承認）。
export type ReviewEntry = {decision: Decision; note: string; outputHash: string; bundleHash?: string; inputHash: string; at: string; reviewer: string};
export type ApprovalState = 'pending' | 'approved' | 'rejected' | 'expired' | 'not-reviewable';
export type Approval = {state: ApprovalState; reason: string; latest?: ReviewEntry; currentHash?: string; bundle?: ReviewBundle};

const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

// 確認対象一式。欠落はnullで表し、欠落も版の違いとして扱う。
export type ReviewBundle = {
  schema: 1;
  video: string | null;
  subtitles: string | null;
  metadata: {selectedTitle: string; description: string; tags: string[]; chapters: {time: string; title: string}[]} | null;
  thumbnails: {file: string; sha256: string | null}[];
};

const fileHash = (dir: string, name: string) => (existsSync(join(dir, name)) ? sha256(readFileSync(join(dir, name))) : null);
const THUMB = /^thumbnail-[a-z]\.png$/;

export function reviewBundle(dir: string, job = readJob(dir)): ReviewBundle {
  const metaPath = join(dir, 'metadata.json');
  const m = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : null;
  const listed: string[] = (job.thumbnails ?? []).map((t: any) => t.file).filter((f: unknown) => typeof f === 'string' && THUMB.test(f));
  const files = [...new Set([...listed, ...readdirSync(dir).filter(f => THUMB.test(f))])].sort();
  return {
    schema: 1,
    video: fileHash(dir, 'sample.mp4'),
    subtitles: fileHash(dir, 'subtitles.vtt'),
    metadata: m ? {selectedTitle: m.selectedTitle ?? '', description: m.description ?? '', tags: m.tags ?? [], chapters: m.chapters ?? []} : null,
    thumbnails: files.map(file => ({file, sha256: fileHash(dir, file)})),
  };
}

// 一式の版。キーの順序を固定したJSONのSHA-256。承認時と判定時で同じ計算を使う。
export function bundleHash(bundle: ReviewBundle) {
  const {schema, video, subtitles, metadata, thumbnails} = bundle;
  const meta = metadata && {selectedTitle: metadata.selectedTitle, description: metadata.description, tags: metadata.tags, chapters: metadata.chapters.map(c => ({time: c.time, title: c.title}))};
  return sha256(JSON.stringify({schema, video, subtitles, metadata: meta, thumbnails: thumbnails.map(t => ({file: t.file, sha256: t.sha256}))}));
}

export function readJob(dir: string) {
  return JSON.parse(readFileSync(join(dir, 'job.json'), 'utf8'));
}

export function history(dir: string): ReviewEntry[] {
  const p = join(dir, 'review.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : [];
}

export function currentOutputHash(dir: string) {
  return fileHash(dir, 'sample.mp4') ?? undefined;
}

export function approvalOf(dir: string): Approval {
  const job = readJob(dir);
  if (job.status !== 'completed' || !job.outputHash) return {state: 'not-reviewable', reason: `ジョブが完了していない（${job.status}）`};
  const bundle = reviewBundle(dir, job);
  const currentHash = bundleHash(bundle);
  const latest = history(dir).at(-1);
  if (!latest) return {state: 'pending', reason: '未確認', currentHash, bundle};
  if (latest.decision === 'reject') return {state: 'rejected', reason: '差戻し', latest, currentHash, bundle};
  if (!latest.bundleHash) return {state: 'expired', reason: '旧形式の承認（動画のみ）。タイトル・概要欄・字幕・サムネイルを含む一式の再確認が必要', latest, currentHash, bundle};
  if (bundle.video !== job.outputHash) return {state: 'expired', reason: '完成ファイルがjob.jsonの記録と一致しないため失効', latest, currentHash, bundle};
  if (latest.bundleHash !== currentHash) return {state: 'expired', reason: '承認後に確認対象（動画・タイトル・概要欄・字幕・サムネイル等）が変わったため失効', latest, currentHash, bundle};
  return {state: 'approved', reason: '承認済み（現在の確認対象一式と一致）', latest, currentHash, bundle};
}

// 画面・CLIで表示していた一式の版（expectedHash）と現在の版が一致するときだけ記録する。別の版を誤って承認しないため。
export function recordReview(dir: string, decision: Decision, note: string, expectedHash: string, reviewer = 'local-user'): ReviewEntry {
  if (decision !== 'approve' && decision !== 'reject') throw Error('decisionはapproveかreject');
  if (typeof note !== 'string' || [...note].length > 500) throw Error('メモは500字まで');
  const job = readJob(dir);
  if (job.status !== 'completed' || !job.outputHash) throw Error(`完了していないジョブは確認できない（${job.status}）`);
  const bundle = reviewBundle(dir, job);
  if (!bundle.video || bundle.video !== job.outputHash) throw Error('完成ファイルがjob.jsonの記録と一致しない');
  const currentHash = bundleHash(bundle);
  if (expectedHash !== currentHash) throw Error('表示していた版と現在の版が異なる。画面を開き直して確認してください');
  if (decision === 'reject' && !note.trim()) throw Error('差戻しには理由のメモが必要');
  const entry: ReviewEntry = {decision, note, outputHash: bundle.video, bundleHash: currentHash, inputHash: job.inputHash, at: new Date().toISOString(), reviewer};
  writeFileSync(join(dir, 'review.json'), JSON.stringify([...history(dir), entry], null, 2));
  return entry;
}
