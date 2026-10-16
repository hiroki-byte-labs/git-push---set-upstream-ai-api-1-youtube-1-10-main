// 版に結び付いた承認・差戻し（T033、T095）。<job>/review.json に履歴を追記する。
// 承認は「確認対象一式」（reviewBundle）の版に結び付き、承認時と現在の版が一致する間だけ有効（変更で失効）。
// 一式: 完成動画、採用タイトル・概要欄・タグ・チャプター（metadata.json）、字幕（subtitles.vtt）、サムネイル案すべて。
// 採用サムネイルを選ぶ機能がないため、当面は全案を対象にする。台本・検査記録・見直し履歴・review.json・時刻は対象外。
// 投稿はしない（Publisherは無効のまま）。M3のYouTube投稿（T032）はこの状態を前提にする。
// 制作案件（T104、ADR-018）から作った動画は、台本の版（script）も一式に含め、案件の現在の承認済み台本と一致する間だけ有効。
import {existsSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {createHash} from 'node:crypto';
import {isAgentName, modeOf, projectState} from './production.ts';
import type {Mode, ProjectState} from './production.ts';

export type Decision = 'approve' | 'reject';
// bundleHashがない記録はT095より前の旧形式（動画のハッシュだけに結び付いた承認）。
export type ReviewEntry = {decision: Decision; note: string; outputHash: string; bundleHash?: string; inputHash: string; at: string; reviewer: string};
export type ApprovalState = 'pending' | 'approved' | 'rejected' | 'expired' | 'not-reviewable';
export type Approval = {state: ApprovalState; reason: string; latest?: ReviewEntry; currentHash?: string; bundle?: ReviewBundle; mode?: Mode; project?: string};

const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

// 確認対象一式。欠落はnullで表し、欠落も版の違いとして扱う。
export type ReviewBundle = {
  schema: 1;
  video: string | null;
  subtitles: string | null;
  metadata: {selectedTitle: string; description: string; tags: string[]; chapters: {time: string; title: string}[]; selectedThumbnail?: string} | null;
  thumbnails: {file: string; sha256: string | null}[];
  // 制作案件から作った動画だけ持つ（T104）。既存ジョブの版は変えない。
  script?: string | null;
  checklist?: {file: string; sha256: string | null}[];
  brief?: string | null;
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
    metadata: m ? {selectedTitle: m.selectedTitle ?? '', description: m.description ?? '', tags: m.tags ?? [], chapters: m.chapters ?? [], selectedThumbnail: m.selectedThumbnail ?? 'thumbnail-a.png'} : null,
    thumbnails: files.map(file => ({file, sha256: fileHash(dir, file)})),
    ...(job.project ? {script: typeof job.scriptHash === 'string' ? job.scriptHash : null} : {}),
    ...(existsSync(join(dir, 'thumbnail-brief.json')) ? {brief: fileHash(dir, 'thumbnail-brief.json')} : {}),
    ...(job.checklist || readdirSync(dir).some(f => /^checklist(?:\.json|\.txt|-\d+\.png)$/.test(f)) ? {
      checklist: [...new Set(['checklist.json', 'checklist.txt', ...(job.checklist?.files ?? []).filter((f: unknown) => typeof f === 'string' && /^checklist-\d+\.png$/.test(f)), ...readdirSync(dir).filter(f => /^checklist-\d+\.png$/.test(f))])].sort().map(file => ({file, sha256: fileHash(dir, file)})),
    } : {}),
  };
}

// 一式の版。キーの順序を固定したJSONのSHA-256。承認時と判定時で同じ計算を使う。
export function bundleHash(bundle: ReviewBundle) {
  const {schema, video, subtitles, metadata, thumbnails, script, checklist, brief} = bundle;
  const meta = metadata && {selectedTitle: metadata.selectedTitle, description: metadata.description, tags: metadata.tags, chapters: metadata.chapters.map(c => ({time: c.time, title: c.title})), selectedThumbnail: metadata.selectedThumbnail ?? 'thumbnail-a.png'};
  return sha256(JSON.stringify({schema, video, subtitles, metadata: meta, thumbnails: thumbnails.map(t => ({file: t.file, sha256: t.sha256})), ...(script !== undefined ? {script} : {}), ...(checklist !== undefined ? {checklist} : {}), ...(brief !== undefined ? {brief} : {})}));
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

// 制作案件から作った動画が、案件の現在の承認済み台本の動画か（T104）。違えばその理由を返す。
export function scriptMismatch(dir: string, job = readJob(dir)): string | null {
  if (!job.project) return null;
  let st: ProjectState;
  try {
    st = projectState(dirname(dir), job.project);
  } catch (e) {
    return `制作案件${job.project}を読めない（${(e as Error).message}）`;
  }
  if (st.scriptState !== 'approved') return `制作案件の台本が承認済みでない（${st.scriptReason}）。この動画は承認済み台本の動画として扱わない`;
  if (st.script!.hash !== job.scriptHash) return `台本が変わった（制作時v${job.scriptVersion ?? '?'}、現在v${st.script!.version}）。この動画は現在の承認済み台本の動画ではない`;
  if (st.mode !== modeOf(job)) return '動画と制作案件のデモ/本番の区別が一致しない';
  return null;
}

export function approvalOf(dir: string): Approval {
  const job = readJob(dir);
  const ctx = {mode: modeOf(job), ...(job.project ? {project: job.project} : {})};
  if (job.kind === 'production-project') return {state: 'not-reviewable', reason: '制作案件（動画は制作ジョブで確認する）', ...ctx};
  if (job.status !== 'completed' || !job.outputHash) return {state: 'not-reviewable', reason: `ジョブが完了していない（${job.status}）`, ...ctx};
  const bundle = reviewBundle(dir, job);
  const currentHash = bundleHash(bundle);
  const latest = history(dir).at(-1);
  const mismatch = scriptMismatch(dir, job);
  if (mismatch) return {state: 'expired', reason: mismatch, latest, currentHash, bundle, ...ctx};
  if (!latest) return {state: 'pending', reason: '未確認', currentHash, bundle, ...ctx};
  if (latest.decision === 'reject') return {state: 'rejected', reason: '差戻し', latest, currentHash, bundle, ...ctx};
  if (!latest.bundleHash) return {state: 'expired', reason: '旧形式の承認（動画のみ）。タイトル・概要欄・字幕・サムネイルを含む一式の再確認が必要', latest, currentHash, bundle, ...ctx};
  if (bundle.video !== job.outputHash) return {state: 'expired', reason: '完成ファイルがjob.jsonの記録と一致しないため失効', latest, currentHash, bundle, ...ctx};
  if (latest.bundleHash !== currentHash) return {state: 'expired', reason: '承認後に確認対象（動画・タイトル・概要欄・字幕・サムネイル等）が変わったため失効', latest, currentHash, bundle, ...ctx};
  return {state: 'approved', reason: '承認済み（現在の確認対象一式と一致）', latest, currentHash, bundle, ...ctx};
}

// 公開前の判定（T104）。投稿機能は無効のままだが、将来の投稿（T032）はこれを必須にする。
// デモ・旧ジョブ・制作案件を経ていない動画・台本と一致しない動画・未承認の動画はすべて不可。
export function publishReadiness(dir: string): {ok: boolean; reasons: string[]} {
  const job = readJob(dir);
  const reasons: string[] = [];
  if (modeOf(job) !== 'production') reasons.push(job.mode ? 'デモの動画（本人の工程を経ていない）' : '旧ジョブ（デモ扱い。本人の工程を経ていない）');
  if (!job.project) reasons.push('制作案件（題材選択・考察・台本承認）を経ていない');
  else {
    try {
      const st = projectState(dirname(dir), job.project);
      if (st.mode !== 'production') reasons.push('デモの制作案件');
      if (!st.currentRenders.some(r => r.jobId === job.id)) reasons.push('制作案件の現在の台本から作った動画として記録されていない');
    } catch (e) {
      reasons.push(`制作案件を読めない（${(e as Error).message}）`);
    }
  }
  const metaPath = join(dir, 'metadata.json');
  const m = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : null;
  const selectedThumb = m?.selectedThumbnail ?? 'thumbnail-a.png';
  const thumbItem = (job.thumbnails ?? []).find((t: any) => t.file === selectedThumb);
  if (!job.thumbnailQuality && !job.thumbnails) {
    reasons.push('サムネイルが未検査（品質検査記録なし）');
  } else if (job.thumbnailQuality && !job.thumbnailQuality.canProceed) {
    reasons.push('採用サムネイルが品質検査に不合格（安全停止）');
  } else if (!thumbItem || !thumbItem.ok) {
    reasons.push(`採用サムネイル（${selectedThumb}）が品質検査に不合格`);
  }
  const a = approvalOf(dir);
  if (a.state !== 'approved') reasons.push(`完成動画が承認済みでない（${a.reason}）`);
  return {ok: reasons.length === 0, reasons: [...new Set(reasons)]};
}

// 制作案件の工程と、現在の台本から作った動画の確認状態（T104）。stageの最後はvideo-review→done。
export function workflowStatus(root: string, id: string) {
  const st = projectState(root, id);
  const renders = st.currentRenders.map(r => ({...r, approval: existsSync(join(root, r.jobId, 'job.json')) ? approvalOf(join(root, r.jobId)) : undefined}));
  const done = renders.some(r => r.approval?.state === 'approved');
  const missing = [...st.missing];
  if (st.stage === 'render') missing.push('承認済み台本の動画が未制作（produce render）');
  if (st.stage === 'video-review' && !done) missing.push('完成動画が未承認（review / 確認画面）');
  return {...st, stage: done ? 'done' as const : st.stage, missing, renders};
}

// 画面・CLIで表示していた一式の版（expectedHash）と現在の版が一致するときだけ記録する。別の版を誤って承認しないため。
export function recordReview(dir: string, decision: Decision, note: string, expectedHash: string, reviewer = 'local-user'): ReviewEntry {
  if (decision !== 'approve' && decision !== 'reject') throw Error('decisionはapproveかreject');
  if (typeof note !== 'string' || [...note].length > 500) throw Error('メモは500字まで');
  const job = readJob(dir);
  if (job.kind === 'production-project') throw Error('制作案件は動画の確認対象ではない（台本はproduce script-review）');
  if (job.status !== 'completed' || !job.outputHash) throw Error(`完了していないジョブは確認できない（${job.status}）`);
  const mismatch = scriptMismatch(dir, job);
  if (mismatch) throw Error(`この動画は承認できない: ${mismatch}`);
  if (modeOf(job) === 'production' && isAgentName(reviewer)) throw Error(`本番の動画の確認をエージェント名（${reviewer}）で記録できない`);
  const bundle = reviewBundle(dir, job);
  if (!bundle.video || bundle.video !== job.outputHash) throw Error('完成ファイルがjob.jsonの記録と一致しない');
  if (decision === 'approve') {
    if (bundle.checklist?.some(f => !f.sha256)) throw Error('チェックリストの成果物が欠落しています。再生成して確認してください');
    if (bundle.metadata) {
      const selectedThumb = bundle.metadata.selectedThumbnail ?? 'thumbnail-a.png';
      const thumbFile = bundle.thumbnails.find(t => t.file === selectedThumb);
      if (!thumbFile?.sha256) throw Error(`採用サムネイル（${selectedThumb}）の画像ファイルが欠落しています`);
      if (!job.thumbnailQuality && !job.thumbnails) {
        throw Error('サムネイルが未検査です。再生成・検査してから承認してください');
      }
      if (job.thumbnailQuality && !job.thumbnailQuality.canProceed) {
        throw Error('採用サムネイルが品質検査に不合格（安全停止）のため承認できません');
      }
      if (job.thumbnails) {
        const checkedItem = job.thumbnails.find((t: any) => t.file === selectedThumb);
        if (!checkedItem || !checkedItem.ok) {
          throw Error(`採用サムネイル（${selectedThumb}）が品質検査に合格していません（${checkedItem?.issues?.join(' / ') || '未検査'}）`);
        }
      }
    }
  }
  const currentHash = bundleHash(bundle);
  if (expectedHash !== currentHash) throw Error('表示していた版と現在の版が異なる。画面を開き直して確認してください');
  if (decision === 'reject' && !note.trim()) throw Error('差戻しには理由のメモが必要');
  const entry: ReviewEntry = {decision, note, outputHash: bundle.video, bundleHash: currentHash, inputHash: job.inputHash, at: new Date().toISOString(), reviewer};
  writeFileSync(join(dir, 'review.json'), JSON.stringify([...history(dir), entry], null, 2));
  return entry;
}
