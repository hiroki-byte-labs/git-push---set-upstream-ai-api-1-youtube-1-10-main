// 本人が担う制作工程（T104、ADR-018）。題材候補→本人の選択→本人の考察→台本の確認・承認→制作→完成動画の確認。
// 制作案件は outputs/<id>/job.json（kind=production-project）の workflow に追記で記録する。開発チケットとは別物。
// 完成動画の承認は src/review.ts（確認対象一式＋台本の版）。投稿は引き続き無効。
import {existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {loadPlan, LIMITS, REFLECTION_PLACEHOLDER} from './plan.ts';
import type {Plan} from './plan.ts';
import {lintPlan, formatLint} from './lint.ts';
import {splitSmartCues} from './subtitle-optimizer.ts';
import {readScriptFactCheck, factCheckReportHash} from './script-fact-check.ts';

export type Mode = 'production' | 'demo';
export type Via = 'cli' | 'http';
export type Candidate = {id: string; title: string; hook: string; concept: string; example?: string; sources?: {title: string; url: string}[]};
export type Selection = {candidateId: string; by: string; at: string; via: Via};
// authorship: self=本人が書いた原文、assisted=本人の原文（basedOn）をエージェント等が整えた版。同一扱いしない。
export type Reflection = {version: number; text: string; sha256: string; authorship: 'self' | 'assisted'; basedOn?: number; by: string; at: string; via: Via};
export type ScriptVersion = {version: number; file: string; hash: string; fileSha256: string; candidateId: string; candidateSha256: string; reflectionVersion: number; reflectionSha256: string; draft: string; by: string; at: string};
export type ScriptReview = {decision: 'approve' | 'reject'; scriptHash: string; scriptVersion: number; note: string; by: string; at: string; via: Via; factCheckHash?: string};
export type RenderLink = {jobId: string; scriptHash: string; scriptVersion: number; at: string};
export type Workflow = {schema: 1; candidates: Candidate[]; candidatesNote?: string; selections: Selection[]; reflections: Reflection[]; scripts: ScriptVersion[]; scriptReviews: ScriptReview[]; renders: RenderLink[]};
export type Project = {id: string; kind: 'production-project'; mode: Mode; status: 'open'; createdAt: string; createdBy: string; workflow: Workflow; events: string[]};

export type ScriptState = 'none' | 'stale' | 'broken' | 'pending' | 'approved' | 'rejected';
export type Stage = 'topic-selection' | 'reflection' | 'script' | 'script-review' | 'render' | 'video-review';
export type ProjectState = {
  id: string; mode: Mode; stage: Stage; missing: string[];
  candidate?: Candidate; selection?: Selection; reflection?: Reflection;
  script?: ScriptVersion; scriptState: ScriptState; scriptReason: string; scriptReview?: ScriptReview;
  currentRenders: RenderLink[];
};

export const PROJECT_ID = /^production-(demo-)?[a-f0-9]{8}$/;
// 本人の工程をエージェント名で記録させない（本番案件のみ）。自己申告の名前に対する安全網であり、認証ではない。
// agent/botは語頭・単語として一致させ、Magenta・Talbot等の人名を誤って拒否しない（T104追加修正）。
export const AGENT_NAME = /\bagent|claude|codex|gpt|gemini|copilot|cursor|\bbot\b|\bai\b|エージェント/i;
// 確認者名を省略したときにCLI/確認画面が入れる既定名。本人の確認として扱わない。
export const DEFAULT_REVIEWERS = ['cli-user', 'local-user'];
// 考察の差し込みで尺を決める読み上げ速度（字/秒）。落ち着いたゆっくりした声を想定した暫定値（T007の希望）。
export const READ_CHARS_PER_SECOND = 6;
export const REFLECTION_SECONDS = [4, 120] as const;
export const REFLECTION_MAX_CHARS = REFLECTION_SECONDS[1] * READ_CHARS_PER_SECOND;

const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const chars = (t: string) => [...t].length;
const now = () => new Date().toISOString();
const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && chars(v) <= max;

export function isAgentName(by: string) {
  return AGENT_NAME.test(by);
}

function checkBy(p: Project, by: string, step: string) {
  if (!isText(by, 60)) throw Error(`${step}: 記録者名（--by）が必要（60字以内）`);
  if (p.mode === 'production' && isAgentName(by)) throw Error(`${step}: 本番の案件では本人の工程をエージェント名（${by}）で記録できない。試験はデモ案件（produce new --demo）で行う`);
}

export function validateCandidates(raw: any): {candidates: Candidate[]; note?: string} {
  const list = raw?.candidates;
  if (raw?.schema !== 1 || !Array.isArray(list) || !list.length || list.length > 20) throw Error('題材候補は {schema: 1, candidates: [1〜20件]}');
  const ids = new Set<string>();
  for (const c of list) {
    if (!/^[a-z0-9-]{1,40}$/.test(c?.id) || ids.has(c.id)) throw Error(`題材候補のidが不正か重複: ${c?.id}`);
    ids.add(c.id);
    if (!isText(c.title, 60) || !isText(c.hook, 200) || !isText(c.concept, 200) || (c.example !== undefined && !isText(c.example, 200))) throw Error(`題材候補${c.id}: title（60字）・hook・concept（各200字）が必要`);
    if (c.sources !== undefined && (!Array.isArray(c.sources) || c.sources.some((s: any) => !isText(s?.title, 120) || !/^https:\/\/\S+$/.test(s?.url ?? '')))) throw Error(`題材候補${c.id}: sourcesは{title, https URL}`);
  }
  return {candidates: list.map((c: any) => ({id: c.id, title: c.title, hook: c.hook, concept: c.concept, ...(c.example ? {example: c.example} : {}), ...(c.sources ? {sources: c.sources} : {})})), note: typeof raw.note === 'string' ? raw.note : undefined};
}

const projectPath = (root: string, id: string) => {
  if (!PROJECT_ID.test(id)) throw Error(`制作案件のIDではない: ${id}`);
  return join(root, id, 'job.json');
};

export function readProject(root: string, id: string): Project {
  const path = projectPath(root, id);
  if (!existsSync(path)) throw Error(`制作案件がない: ${id}`);
  const p = JSON.parse(readFileSync(path, 'utf8'));
  if (p.kind !== 'production-project' || !p.workflow || p.workflow.schema !== 1) throw Error(`制作案件の形式ではない: ${id}`);
  return p;
}

function save(root: string, p: Project) {
  const path = projectPath(root, p.id);
  writeFileSync(path + '.tmp', JSON.stringify(p, null, 2));
  renameSync(path + '.tmp', path);
}

export function createProject(root: string, candidatesRaw: unknown, opts: {demo?: boolean; by: string}) {
  const {candidates, note} = validateCandidates(candidatesRaw);
  if (!isText(opts.by, 60)) throw Error('作成者名（--by）が必要');
  const id = `production-${opts.demo ? 'demo-' : ''}${randomUUID().slice(0, 8)}`;
  mkdirSync(join(root, id), {recursive: true});
  const p: Project = {
    id, kind: 'production-project', mode: opts.demo ? 'demo' : 'production', status: 'open', createdAt: now(), createdBy: opts.by,
    workflow: {schema: 1, candidates, ...(note ? {candidatesNote: note} : {}), selections: [], reflections: [], scripts: [], scriptReviews: [], renders: []},
    events: ['created'],
  };
  save(root, p);
  return id;
}

export function selectTopic(root: string, id: string, candidateId: string, by: string, via: Via = 'cli') {
  const p = readProject(root, id);
  checkBy(p, by, '題材の選択');
  if (!p.workflow.candidates.some(c => c.id === candidateId)) throw Error(`候補にない題材: ${candidateId}（候補: ${p.workflow.candidates.map(c => c.id).join(', ')}）`);
  const s: Selection = {candidateId, by, at: now(), via};
  p.workflow.selections.push(s);
  p.events.push('topic-selected');
  save(root, p);
  return s;
}

export function addReflection(root: string, id: string, text: string, by: string, opts: {assistedFrom?: number; via?: Via} = {}) {
  const p = readProject(root, id);
  // 整形版（assisted）はエージェントが記録してよい。本人執筆（self）だけ本番でエージェント名を拒否する。
  if (opts.assistedFrom !== undefined) {
    if (!isText(by, 60)) throw Error('考察の整形版: 記録者名（--by）が必要（60字以内）');
  } else checkBy(p, by, '考察の入力');
  if (!p.workflow.selections.length) throw Error('先に題材を選ぶ（produce select）');
  const body = (text ?? '').replace(/\r\n/g, '\n').trim();
  if (!body) throw Error('考察が空');
  if (chars(body) > REFLECTION_MAX_CHARS) throw Error(`考察が長すぎる（${chars(body)}字。1場面の上限は${REFLECTION_MAX_CHARS}字）`);
  if (body.includes(REFLECTION_PLACEHOLDER)) throw Error('考察に未入力の目印が残っている');
  let basedOn: number | undefined;
  if (opts.assistedFrom !== undefined) {
    const base = p.workflow.reflections.find(r => r.version === opts.assistedFrom);
    if (!base || base.authorship !== 'self') throw Error(`整形版の元は本人執筆（self）の版にする（指定: ${opts.assistedFrom}）`);
    basedOn = base.version;
  }
  const r: Reflection = {version: p.workflow.reflections.length + 1, text: body, sha256: sha256(body), authorship: basedOn ? 'assisted' : 'self', ...(basedOn ? {basedOn} : {}), by, at: now(), via: opts.via ?? 'cli'};
  p.workflow.reflections.push(r);
  p.events.push('reflection-saved');
  save(root, p);
  return r;
}

// 字幕cueへの分割: 文（。！？）単位および文節・助詞境界を尊重し、1cueは字幕の上限（55字）以内。
// 改行と前後の空白はnarrationと同じく除く（cueに残るとVTTの空行=cue終端になり字幕が壊れる。T174追加修正）。
export function splitCues(text: string, max: number = LIMITS.cueText) {
  return splitSmartCues(text.replace(/\s*\n\s*/g, '').trim(), max);
}

// 下書きの考察の場面（role: reflection）へ本人の考察を差し込む。本文は変えない。尺は読み上げ速度で決める。
export function injectReflection(draft: any, text: string): any {
  const plan = JSON.parse(JSON.stringify(draft));
  const idx = (plan.scenes ?? []).map((s: any, i: number) => (s?.role === 'reflection' ? i : -1)).filter((i: number) => i >= 0);
  if (idx.length !== 1) throw Error(`台本の下書きには考察の場面（role: reflection）がちょうど1つ必要（${idx.length}つ）`);
  const scene = plan.scenes[idx[0]];
  const cues = splitCues(text);
  const total = cues.reduce((n, c) => n + chars(c), 0);
  const seconds = Math.max(REFLECTION_SECONDS[0], Math.ceil(total / READ_CHARS_PER_SECOND));
  if (seconds > REFLECTION_SECONDS[1]) throw Error('考察が長すぎて1場面に収まらない');
  // 0.5秒単位で文字数に比例して配分し、端数は最後のcueで合わせる。
  let used = 0;
  scene.cues = cues.map((c, k) => {
    const sec = k === cues.length - 1 ? seconds - used : Math.max(0.5, Math.round((seconds * chars(c)) / total * 2) / 2);
    used += sec;
    return {text: c, seconds: sec};
  });
  if (scene.cues.some((c: any) => c.seconds < 0.5)) throw Error('考察の字幕の尺を配分できない（文を短くする）');
  scene.narration = text.replace(/\s*\n\s*/g, '');
  scene.seconds = seconds;
  return plan;
}

function candidateOf(p: Project, id: string) {
  return p.workflow.candidates.find(c => c.id === id);
}

// 台本の版: 選択した候補の内容、考察の版とハッシュ、台本ファイルのハッシュ（ADR-018）。
export function scriptHashOf(parts: {candidateSha256: string; reflectionVersion: number; reflectionSha256: string; fileSha256: string}) {
  return sha256(JSON.stringify({schema: 1, candidate: parts.candidateSha256, reflection: {version: parts.reflectionVersion, sha256: parts.reflectionSha256}, script: parts.fileSha256}));
}

export function attachScript(root: string, id: string, draftRaw: unknown, by: string, opts: {draft?: string} = {}) {
  const p = readProject(root, id);
  if (!isText(by, 60)) throw Error('台本の作成者名（--by）が必要');
  const selection = p.workflow.selections.at(-1);
  if (!selection) throw Error('題材が未選択のため台本を作れない（produce select）');
  const reflection = p.workflow.reflections.at(-1);
  if (!reflection) throw Error('本人の考察が未入力のため台本を作れない（produce reflection）');
  const candidate = candidateOf(p, selection.candidateId)!;
  const injected = injectReflection(draftRaw, reflection.text);
  injected.production = {mode: p.mode, project: p.id};
  const plan = loadPlan(injected);
  const lint = lintPlan(plan);
  if (!lint.ok) throw Error('台本の安全検査に失敗したため確認に回さない:\n' + formatLint(lint));
  const version = p.workflow.scripts.length + 1;
  const file = `script-v${version}.json`;
  const body = JSON.stringify(plan, null, 2);
  writeFileSync(join(root, id, file), body);
  const parts = {candidateSha256: sha256(JSON.stringify(candidate)), reflectionVersion: reflection.version, reflectionSha256: reflection.sha256, fileSha256: sha256(body)};
  const s: ScriptVersion = {version, file, hash: scriptHashOf(parts), ...parts, candidateId: candidate.id, draft: opts.draft ?? '', by, at: now()};
  p.workflow.scripts.push(s);
  p.events.push('script-created');
  save(root, p);
  return s;
}

export function readScript(root: string, id: string, s: ScriptVersion): Plan {
  return loadPlan(JSON.parse(readFileSync(join(root, id, s.file), 'utf8')));
}

export function projectState(root: string, id: string): ProjectState {
  const p = readProject(root, id);
  const w = p.workflow;
  const selection = w.selections.at(-1);
  const candidate = selection && candidateOf(p, selection.candidateId);
  const reflection = w.reflections.at(-1);
  const script = w.scripts.at(-1);
  let scriptState: ScriptState = 'none', scriptReason = '台本が未作成';
  let scriptReview: ScriptReview | undefined;
  if (script) {
    const path = join(root, id, script.file);
    const fileSha = existsSync(path) ? sha256(readFileSync(path)) : null;
    const expected = candidate && reflection ? scriptHashOf({candidateSha256: sha256(JSON.stringify(candidate)), reflectionVersion: reflection.version, reflectionSha256: reflection.sha256, fileSha256: fileSha ?? ''}) : '';
    if (!fileSha || fileSha !== script.fileSha256) [scriptState, scriptReason] = ['broken', `台本ファイル${script.file}がない、または記録と一致しない`];
    else if (!candidate || candidate.id !== script.candidateId || sha256(JSON.stringify(candidate)) !== script.candidateSha256) [scriptState, scriptReason] = ['stale', '台本の作成後に題材の選択が変わった。台本を作り直す'];
    else if (!reflection || reflection.version !== script.reflectionVersion || reflection.sha256 !== script.reflectionSha256) [scriptState, scriptReason] = ['stale', '台本の作成後に考察が更新された。台本を作り直す'];
    else if (expected !== script.hash) [scriptState, scriptReason] = ['broken', '台本の版の記録が内容と一致しない'];
    else {
      scriptReview = w.scriptReviews.filter(r => r.scriptHash === script.hash).at(-1);
      const older = w.scriptReviews.some(r => r.scriptHash !== script.hash && r.decision === 'approve');
      if (!scriptReview) [scriptState, scriptReason] = ['pending', older ? '台本が変わったため以前の承認は失効。現在の版の確認待ち' : '台本の確認待ち'];
      else if (scriptReview.decision === 'reject') [scriptState, scriptReason] = ['rejected', `台本が差戻し中: ${scriptReview.note}`];
      else {
        try {
          const report = readScriptFactCheck(root, id, script, readScript(root, id, script));
          if (scriptReview.factCheckHash !== factCheckReportHash(report)) throw Error('事実・権利確認レポートが承認時から変更されたため再承認が必要');
          [scriptState, scriptReason] = ['approved', `台本承認済み（v${script.version}、${scriptReview.by}）`];
        } catch (error) { [scriptState, scriptReason] = ['pending', String((error as Error).message)]; }
      }
    }
  }
  const missing: string[] = [];
  if (!selection) missing.push('題材が未選択（produce select）');
  if (!reflection) missing.push('本人の考察が未入力（produce reflection）');
  if (scriptState === 'none' || scriptState === 'stale' || scriptState === 'broken') missing.push(`${scriptReason}（produce script）`);
  else if (scriptState === 'pending' || scriptState === 'rejected') missing.push(`台本が未承認: ${scriptReason}（produce script-review）`);
  const currentRenders = scriptState === 'approved' ? w.renders.filter(r => r.scriptHash === script!.hash) : [];
  const stage: Stage = !selection ? 'topic-selection' : !reflection ? 'reflection' : ['none', 'stale', 'broken'].includes(scriptState) ? 'script' : scriptState !== 'approved' ? 'script-review' : currentRenders.length ? 'video-review' : 'render';
  return {id, mode: p.mode, stage, missing, candidate, selection, reflection, script, scriptState, scriptReason, scriptReview, currentRenders};
}

export function reviewScript(root: string, id: string, decision: 'approve' | 'reject', hash: string, note: string, by: string, via: Via = 'cli') {
  const p = readProject(root, id);
  checkBy(p, by, '台本の確認');
  if (decision !== 'approve' && decision !== 'reject') throw Error('decisionはapproveかreject');
  if (typeof note !== 'string' || chars(note) > 500) throw Error('メモは500字まで');
  const st = projectState(root, id);
  if (!st.script || st.scriptState === 'none' || st.scriptState === 'stale' || st.scriptState === 'broken') throw Error(`確認できる台本がない: ${st.scriptReason}`);
  if (hash !== st.script.hash) throw Error('表示していた台本の版と現在の版が異なる。開き直して確認してください');
  if (decision === 'reject' && !note.trim()) throw Error('差戻しには理由のメモが必要');
  const factCheckHash = decision === 'approve' ? factCheckReportHash(readScriptFactCheck(root, id, st.script, readScript(root, id, st.script))) : undefined;
  const r: ScriptReview = {decision, scriptHash: hash, scriptVersion: st.script.version, note, by, at: now(), via, ...(factCheckHash ? {factCheckHash} : {})};
  p.workflow.scriptReviews.push(r);
  p.events.push(`script-${decision}`);
  save(root, p);
  return r;
}

// 制作の開始条件。満たさなければ不足項目を並べて拒否する（強制オプションなし）。
export function assertRenderable(root: string, id: string) {
  const st = projectState(root, id);
  if (st.scriptState !== 'approved' || st.missing.length) throw Error(`制作を開始できない（${id}）。不足:\n- ${st.missing.join('\n- ')}`);
  return {state: st, planPath: join(root, id, st.script!.file)};
}

export function linkRender(root: string, id: string, jobId: string, scriptHash: string, scriptVersion: number) {
  const p = readProject(root, id);
  p.workflow.renders.push({jobId, scriptHash, scriptVersion, at: now()});
  p.events.push('rendered');
  save(root, p);
}

// 考察の書き手の表示。デモ案件の考察は試験用の仮文で、本人の考察ではない（記録上のauthorshipに関わらず）。
export const authorshipLabel = (mode: Mode, r: Pick<Reflection, 'authorship' | 'basedOn'>) =>
  mode === 'demo' ? 'デモ用の仮文（本人の考察ではない）' : r.authorship === 'self' ? '本人執筆' : `整形版（元v${r.basedOn}。本人の原文と同一ではない）`;

// modeのない既存ジョブはデモ（旧ジョブ）として扱う。ファイルは書き換えない。
export const modeOf = (job: any): Mode => (job?.mode === 'production' ? 'production' : 'demo');
