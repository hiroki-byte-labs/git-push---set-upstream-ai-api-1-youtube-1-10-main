// 自律制作パイプラインの段階連携・オーケストレーション（T128）。
// 題材候補 → 本人選択 → 本人考察 → エージェント台本案 → 事実・権利確認 → 本人承認 → 音声/映像制作 → 完成動画の本人承認
// 段階状態、成果物契約、前段成果物検証、承認待ち安全停止、失敗/再実行追跡を管理する。

import {existsSync, readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import type {Candidate, Project, Stage, ProjectState, Selection, Reflection, ScriptVersion, ScriptReview} from './production.ts';
import {
  readProject, projectState, selectTopic, addReflection, attachScript,
  reviewScript, assertRenderable, linkRender, readScript, authorshipLabel
} from './production.ts';
import type {FactCheckReport} from './fact-check.ts';
import {validateScriptFactCheck} from './script-fact-check.ts';
import type {NarrationMetadata} from './narration.ts';
import {validateNarrationMetadata} from './narration.ts';
import {verifyNarrationLink, checkSubtitleSync, sliceScriptForNarration} from './audio-pipeline.ts';
import {workflowStatus, approvalOf, recordReview, publishReadiness} from './review.ts';
import type {Usage, Attempt} from './connections.ts';

const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

export type StageExecutionStatus = 'idle' | 'running' | 'completed' | 'waiting_human' | 'failed';

export type StageRecord = {
  stage: Stage | 'fact-check' | 'audio-synthesis' | 'video-render' | 'qa-inspection';
  status: StageExecutionStatus;
  inputVersion?: string;
  outputVersion?: string;
  outputFiles?: string[];
  usage?: Usage[];
  attempts?: Attempt[];
  error?: string;
  waitingFor?: string;
  updatedAt: string;
};

export type PipelineManifest = {
  schema: 1;
  projectId: string;
  mode: 'production' | 'demo';
  stages: Record<string, StageRecord>;
  updatedAt: string;
};

/**
 * 案件ディレクトリ内のパイプライン・マニフェストを取得または初期化
 */
export function getPipelineManifest(root: string, projectId: string): PipelineManifest {
  const manifestPath = join(root, projectId, 'pipeline-manifest.json');
  if (existsSync(manifestPath)) {
    return JSON.parse(readFileSync(manifestPath, 'utf8'));
  }
  const p = readProject(root, projectId);
  const manifest: PipelineManifest = {
    schema: 1,
    projectId,
    mode: p.mode,
    stages: {},
    updatedAt: new Date().toISOString(),
  };
  savePipelineManifest(root, projectId, manifest);
  return manifest;
}

export function savePipelineManifest(root: string, projectId: string, manifest: PipelineManifest): void {
  const manifestPath = join(root, projectId, 'pipeline-manifest.json');
  manifest.updatedAt = new Date().toISOString();
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

/**
 * 前段成果物および現在の制作段階を検査し、次の実行可否と状態を判定する。
 */
export function assessStagePrerequisites(
  root: string,
  projectId: string
): {
  canProceed: boolean;
  currentStage: Stage;
  nextAction: string;
  waitingForHuman: boolean;
  blockers: string[];
} {
  const st = projectState(root, projectId);
  const blockers: string[] = [];
  let nextAction = '';
  let waitingForHuman = false;

  switch (st.stage) {
    case 'topic-selection':
      waitingForHuman = true;
      nextAction = '本人が題材候補を選択してください（produce select）';
      blockers.push('題材が未選択です');
      break;

    case 'reflection':
      waitingForHuman = true;
      nextAction = '本人が考察を入力してください（produce reflection）';
      blockers.push('本人の考察が未入力です');
      break;

    case 'script':
      waitingForHuman = false;
      nextAction = 'エージェントが台本案を作成・差し込みます（produce script）';
      break;

    case 'script-review':
      waitingForHuman = true;
      nextAction = `本人が台本案（v${st.script?.version}）を確認・承認してください（produce script-review approve --hash ${st.script?.hash}）`;
      blockers.push(`台本が未承認です（状態: ${st.scriptState}）`);
      break;

    case 'render':
      waitingForHuman = false;
      nextAction = '承認済み台本から音声・映像・完成動画を制作します（produce render）';
      break;

    case 'video-review':
      const wf = workflowStatus(root, projectId);
      const approvedRender = wf.renders.find(r => r.approval?.state === 'approved');
      if (approvedRender) {
        waitingForHuman = false;
        nextAction = '完成動画が承認されました。制作工程完了です';
      } else {
        waitingForHuman = true;
        nextAction = '本人が完成動画を確認・承認してください（review <job-id> approve）';
        blockers.push('完成動画が未承認です');
      }
      break;
  }

  return {
    canProceed: blockers.length === 0,
    currentStage: st.stage,
    nextAction,
    waitingForHuman,
    blockers,
  };
}

/**
 * 段階成果物（Fact-check report）を案件ディレクトリに保存し検証する
 */
export function attachFactCheckReport(
  root: string,
  projectId: string,
  reportRaw: unknown
): FactCheckReport {
  const state = projectState(root, projectId);
  const script = state.script;
  if (!script) throw Error('事実確認の対象台本がありません');
  if (['stale', 'broken'].includes(state.scriptState)) throw Error('事実確認の対象台本の版が無効です');
  const report = validateScriptFactCheck(reportRaw, projectId, script, readScript(root, projectId, script));
  if (!report.ok) {
    throw new Error(`事実・権利確認にエスカレーション項目があるため台本承認へ進めません:\n- ${report.escalations.join('\n- ')}`);
  }
  const reportPath = join(root, projectId, 'fact-check-report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const manifest = getPipelineManifest(root, projectId);
  manifest.stages['fact-check'] = {
    stage: 'fact-check',
    status: 'completed',
    outputVersion: sha256(JSON.stringify(report)),
    outputFiles: ['fact-check-report.json'],
    updatedAt: new Date().toISOString(),
  };
  savePipelineManifest(root, projectId, manifest);

  return report;
}

/**
 * ナレーション音声メタデータ（T125 / T127）を案件ディレクトリに保存し整合性を検証する
 */
export function attachNarrationMetadata(
  root: string,
  projectId: string,
  metadataRaw: unknown
): NarrationMetadata {
  const metadata = validateNarrationMetadata(metadataRaw);
  const st = projectState(root, projectId);

  if (!st.script) {
    throw new Error('台本が存在しない案件には音声メタデータを登録できません');
  }

  const link = verifyNarrationLink(projectId, st.script.hash, metadata);
  if (!link.linked) {
    throw new Error(`音声メタデータと台本版の整合性検証に失敗: ${link.notes}`);
  }

  const audioMetaPath = join(root, projectId, 'narration-metadata.json');
  writeFileSync(audioMetaPath, JSON.stringify(metadata, null, 2));

  const manifest = getPipelineManifest(root, projectId);
  manifest.stages['audio-synthesis'] = {
    stage: 'audio-synthesis',
    status: 'completed',
    inputVersion: st.script.hash,
    outputVersion: sha256(JSON.stringify(metadata)),
    outputFiles: ['narration-metadata.json'],
    updatedAt: new Date().toISOString(),
  };
  savePipelineManifest(root, projectId, manifest);

  return metadata;
}

/**
 * 自律制作パイプライン実行オーケストレーター:
 * 前段成果物や本人の判断点を検証し、安全停止または自律ステップを実行する。
 */
export async function advancePipelineStage(
  root: string,
  projectId: string,
  actor: {by: string; via?: 'cli' | 'http'}
): Promise<{
  stage: Stage;
  status: StageExecutionStatus;
  message: string;
  waitingForHuman: boolean;
}> {
  const assessment = assessStagePrerequisites(root, projectId);
  const manifest = getPipelineManifest(root, projectId);

  if (!assessment.canProceed) {
    // 人の確認・入力待ち、または前提条件不足のため安全停止
    manifest.stages[assessment.currentStage] = {
      stage: assessment.currentStage,
      status: assessment.waitingForHuman ? 'waiting_human' : 'failed',
      waitingFor: assessment.nextAction,
      error: assessment.blockers.join('; '),
      updatedAt: new Date().toISOString(),
    };
    savePipelineManifest(root, projectId, manifest);

    return {
      stage: assessment.currentStage,
      status: assessment.waitingForHuman ? 'waiting_human' : 'failed',
      message: `[安全停止] ${assessment.nextAction} (理由: ${assessment.blockers.join(', ')})`,
      waitingForHuman: assessment.waitingForHuman,
    };
  }

  // 進行可能（エージェントが自律的に実行可能な工程）
  manifest.stages[assessment.currentStage] = {
    stage: assessment.currentStage,
    status: 'running',
    updatedAt: new Date().toISOString(),
  };
  savePipelineManifest(root, projectId, manifest);

  return {
    stage: assessment.currentStage,
    status: 'running',
    message: `[進行可能] ${assessment.nextAction}`,
    waitingForHuman: false,
  };
}
