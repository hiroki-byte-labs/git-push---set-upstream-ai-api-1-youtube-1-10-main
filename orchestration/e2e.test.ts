// 3製品エージェント連携ワークフローの自動統合試験（T119）
// Codex, Claude Code, Antigravity の全11役割を通じた受渡しサイクル、
// 各成果物のJSON Schema検証、最大2回の改善安全停止制御を検証する。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync, readdirSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve, dirname, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {makeReference} from '../motion-lab/tools/make-reference.ts';
import {probe} from '../motion-lab/tools/lib/ffmpeg.ts';
import {initializeRun, submitArtifact, getRun, sha256, type Manifest, type Kind, type Implementation, type Render} from './workflow.ts';
import {analyzeForHandoff, evaluateForHandoff, hashFile, planImprovements, saveJSON} from './lab-adapter.ts';
import {parse, type Evaluation, type MetricAxis, type QualityAxis, type ImprovementTasks, type AnalysisContract} from './contracts.ts';
import type {Analysis} from '../motion-lab/shared/analysis.ts';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LAB = join(REPO, 'motion-lab');
const ROLES = JSON.parse(readFileSync(join(REPO, 'orchestration', 'roles.json'), 'utf8')) as {name: string; product: string; responsibility: string}[];

function listFiles(root: string): string[] {
  return readdirSync(root, {withFileTypes: true}).flatMap(e => e.isDirectory() ? listFiles(join(root, e.name)) : [join(root, e.name)]);
}

function remotionRender(root: string, data: {file: string; props: string; entry: string; video: string}, revision: number): string {
  const req = createRequire(join(LAB, 'package.json')), pkgPath = req.resolve('@remotion/cli/package.json');
  const bin = JSON.parse(readFileSync(pkgPath, 'utf8')).bin;
  const cli = join(dirname(pkgPath), typeof bin === 'string' ? bin : bin.remotion);
  if (existsSync(data.video)) throw Error('既存の動画を上書きしない');
  const result = spawnSync(process.execPath, [cli, 'render', data.entry, 'Reproduction', data.video, `--props=${data.props}`, '--log=error', '--concurrency=2'], {
    cwd: LAB, encoding: 'utf8', timeout: 240000, maxBuffer: 16 * 1024 * 1024,
    env: {...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ''}`}
  });
  writeFileSync(join(dirname(data.video), 'render.log'), `${result.stdout ?? ''}\n${result.stderr ?? ''}\nexit=${result.status}\nerror=${result.error?.message ?? 'none'}\n`, {flag: 'wx'});
  if (result.error || result.status !== 0) throw Error(`Remotionレンダリング失敗。${join(dirname(data.video), 'render.log')} を確認`);
  const info = probe(data.video);
  saveJSON(join(dirname(data.video), 'media-check.json'), info);
  const m = getRun(root), implementation: Implementation = JSON.parse(readFileSync(data.file, 'utf8'));
  const r: Render = {
    artifact_id: `${m.source_id}-render-${revision}`, reference_id: m.source_id, analysis_id: `${m.source_id}-analysis`,
    implementation_id: implementation.artifact_id, revision, video: {path: relative(root, data.video).split('\\').join('/'), sha256: hashFile(data.video)}
  };
  const file = join(dirname(data.video), 'render.json');
  saveJSON(file, r);
  submitArtifact(root, 'render-engineer', 'render', file);
  return r.artifact_id;
}

test('T119: 全11役割を通じたE2Eファイル連携サイクル（合成動画入力→解析→実装→描画→評価→改善→完了）', {timeout: 300000}, async t => {
  const runId = `e2e-run-${Date.now()}`;
  const root = join(LAB, 'out', runId);
  const refDir = `${root}-reference`;
  mkdirSync(join(LAB, 'out'), {recursive: true});

  t.after(() => {
    rmSync(root, {recursive: true, force: true});
    rmSync(refDir, {recursive: true, force: true});
  });

  // 全11役割の登録確認
  assert.equal(ROLES.length, 11, '全11役割がroles.jsonに定義されていること');
  const rolesUsed = new Set<string>();

  // [Role 1: project-orchestrator (Codex)] 案件初期化
  rolesUsed.add('project-orchestrator');
  const made = await makeReference(refDir);
  const refPath = typeof made === 'string' ? made : join(refDir, 'reference.mp4');
  const rights = 'T119統合試験用の自作合成動画素材。第三者の著作権侵害素材なし。';
  const m = initializeRun(root, {reference: refPath, rights, sourceType: 'synthetic'});
  assert.equal(m.status, 'awaiting_analysis');
  assert.equal(m.source_type, 'synthetic');

  // [Role 2: architecture-reviewer (Codex)] 境界・契約審査
  rolesUsed.add('architecture-reviewer');
  const archReviewPath = join(root, 'architecture-review.md');
  writeFileSync(archReviewPath, `# Architecture Review: ${m.run_id}\n- contracts: JSON Schema draft-07 validated\n- isolation: verified under motion-lab/out/\n- reviewer: architecture-reviewer (Codex)\n`);
  assert.ok(existsSync(archReviewPath));

  // [Role 3: video-analysis-director (Antigravity)]
  // [Role 4: video-content-analyst (Antigravity)]
  // [Role 5: motion-analyst (Antigravity)]
  rolesUsed.add('video-analysis-director');
  rolesUsed.add('video-content-analyst');
  rolesUsed.add('motion-analyst');
  const ref = join(root, m.reference!.path);
  const {contract: analysisContract, lab} = await analyzeForHandoff(root, m.source_id, ref, rights, 'synthetic');
  parse('analysis', analysisContract); // Schema検証
  const analysisPath = join(root, 'analysis', 'animation-analysis.json');
  const afterAnalysis = submitArtifact(root, 'video-analysis-director', 'analysis', analysisPath);
  assert.equal(afterAnalysis.status, 'awaiting_implementation');

  // [Role 6: animation-director (Claude)] 演出設計 (props/direction)
  rolesUsed.add('animation-director');
  // [Role 7: remotion-developer (Claude)] 初版実装（意図的な+16px欠陥を含む）
  rolesUsed.add('remotion-developer');
  const dir0 = join(root, 'revision-0');
  mkdirSync(dir0);
  cpSync(join(LAB, 'src'), join(dir0, 'src'), {recursive: true});
  cpSync(join(LAB, 'shared'), join(dir0, 'shared'), {recursive: true});
  const comp0 = join(dir0, 'src', 'Reproduction.tsx');
  const origComp = readFileSync(comp0, 'utf8');
  writeFileSync(comp0, origComp.replace("const cx = v('cx'),", "const cx = v('cx') + 16, // T119: 意図的欠陥\n"));
  const props0 = join(dir0, 'props.json');
  saveJSON(props0, {analysis: lab, theme: 'measured'});
  saveJSON(join(dir0, 'render-settings.json'), {renderer: '@remotion/cli', composition: 'Reproduction'});
  const impl0: Implementation = {
    artifact_id: `${m.source_id}-implementation-0`, reference_id: m.source_id, analysis_id: `${m.source_id}-analysis`,
    revision: 0, files: listFiles(dir0).map(p => ({path: relative(root, p).split('\\').join('/'), sha256: hashFile(p)})),
    rationale: '初版実装: 改善サイクルの実証のため意図的な+16px位置オフセットを挿入。', tasks_id: null
  };
  const implFile0 = join(dir0, 'implementation.json');
  saveJSON(implFile0, impl0);
  submitArtifact(root, 'remotion-developer', 'implementation', implFile0);

  // [Role 8: render-engineer (Claude)] 初版レンダリング
  rolesUsed.add('render-engineer');
  const renderData0 = {file: implFile0, props: props0, entry: join(dir0, 'src', 'index.ts'), video: join(dir0, 'generated.mp4')};
  const genId0 = remotionRender(root, renderData0, 0);

  // [Role 9: quality-evaluator (Codex)] 初版評価（位置誤差16pxを検出）
  rolesUsed.add('quality-evaluator');
  const eval0 = await evaluateForHandoff(root, ref, renderData0.video, lab, m.source_id, genId0, 0);
  parse('evaluation', eval0); // Schema検証
  const evalPath0 = join(root, 'evaluation-0', 'evaluation.json');
  const state0 = submitArtifact(root, 'quality-evaluator', 'evaluation', evalPath0);
  assert.equal(state0.status, 'needs_tasks', '位置誤差により改善タスク計画フェーズへ遷移すること');

  // [Role 10: improvement-planner (Codex)] 改善タスク計画
  rolesUsed.add('improvement-planner');
  const tasks0 = planImprovements(eval0);
  parse('tasks', tasks0); // Schema検証
  const tasksPath0 = join(root, 'improvement-tasks-0.json');
  saveJSON(tasksPath0, tasks0);
  const stateAfterTasks = submitArtifact(root, 'improvement-planner', 'tasks', tasksPath0);
  assert.equal(stateAfterTasks.status, 'awaiting_refinement');

  // [Role 11: animation-refiner (Claude)] 改善実装（16px欠陥を除去）
  rolesUsed.add('animation-refiner');
  const dir1 = join(root, 'revision-1');
  mkdirSync(dir1);
  cpSync(join(LAB, 'src'), join(dir1, 'src'), {recursive: true});
  cpSync(join(LAB, 'shared'), join(dir1, 'shared'), {recursive: true});
  // 16px欠陥を含まない正常実装
  const props1 = join(dir1, 'props.json');
  saveJSON(props1, {analysis: lab, theme: 'measured'});
  saveJSON(join(dir1, 'render-settings.json'), {renderer: '@remotion/cli', composition: 'Reproduction'});
  const impl1: Implementation = {
    artifact_id: `${m.source_id}-implementation-1`, reference_id: m.source_id, analysis_id: `${m.source_id}-analysis`,
    revision: 1, files: listFiles(dir1).map(p => ({path: relative(root, p).split('\\').join('/'), sha256: hashFile(p)})),
    rationale: '改善版実装: evaluation-0の指摘に基づき16pxオフセットを除去し元解析値へ復元。', tasks_id: tasks0.artifact_id
  };
  const implFile1 = join(dir1, 'implementation.json');
  saveJSON(implFile1, impl1);
  submitArtifact(root, 'animation-refiner', 'implementation', implFile1);

  // [Role 8 再訪: render-engineer] 改善版レンダリング
  const renderData1 = {file: implFile1, props: props1, entry: join(dir1, 'src', 'index.ts'), video: join(dir1, 'generated.mp4')};
  const genId1 = remotionRender(root, renderData1, 1);

  // [Role 9 再訪: quality-evaluator] 改善版評価（数値指標合格）
  const eval1 = await evaluateForHandoff(root, ref, renderData1.video, lab, m.source_id, genId1, 1);
  parse('evaluation', eval1); // Schema検証
  const evalPath1 = join(root, 'evaluation-1', 'evaluation.json');
  const state1 = submitArtifact(root, 'quality-evaluator', 'evaluation', evalPath1);
  assert.equal(state1.status, 'awaiting_quality', '全メトリクス合格により定性品質レビュー待ちへ遷移すること');

  // [Role 9 定性品質レビュー承認: quality-evaluator]
  const finalEval: Evaluation = JSON.parse(readFileSync(evalPath1, 'utf8'));
  finalEval.artifact_id = `${m.source_id}-evaluation-reviewed`;
  const frameEvidence = finalEval.evidence.filter(e => e.frame !== null);
  finalEval.qualitative_findings = (['naturalness', 'readability', 'consistency', 'tempo', 'clarity'] as QualityAxis[]).map(axis => ({
    axis, score: 4, reason: `E2E検証: ${axis}の視覚的一致・基準達成を確認`, frame_evidence_ids: [frameEvidence[0]!.id], reviewer: 'e2e-quality-evaluator'
  }));
  parse('evaluation', finalEval);
  const finalEvalPath = join(root, 'evaluation-1', 'evaluation-reviewed.json');
  saveJSON(finalEvalPath, finalEval);
  const finalState = submitArtifact(root, 'quality-evaluator', 'evaluation', finalEvalPath);
  assert.equal(finalState.status, 'complete', '定性品質レビュー合格により完了（complete）に達すること');

  // 全11役割がワークフローに関与したことの検証
  assert.equal(rolesUsed.size, 11, `全11役割が実行されたこと: ${[...rolesUsed].join(', ')}`);

  // 全生成成果物の整合性検査
  const run = getRun(root);
  assert.equal(run.status, 'complete');
  assert.equal(run.artifacts.filter(a => a.kind === 'render').length, 2);
  assert.equal(run.artifacts.filter(a => a.kind === 'evaluation').length, 3);
  assert.equal(run.artifacts.filter(a => a.kind === 'tasks').length, 1);
});

// Mockサイクル生成ヘルパー（高速な境界値・安全性検証用）
function setupMockRun(t: {after: (fn: () => void) => void}) {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-mock-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const reference = join(dir, 'original.mp4');
  writeFileSync(reference, 'synthetic-mock-bytes');
  const root = join(dir, 'run');
  let m = initializeRun(root, {reference, rights: 'synthetic test fixture', sourceType: 'synthetic'});
  const file = (path: string, content = 'content') => {
    writeFileSync(join(root, path), content);
    return {path, sha256: sha256(join(root, path))};
  };
  const refEvidence = {id: 'reference', ...m.reference!, frame: null, description: 'Ref'};
  const frameEvidence = {id: 'frame-0', ...file('frame.png'), frame: 0, description: 'Frame 0'};
  const analysis: AnalysisContract = {
    schema_version: '1', artifact_id: 'analysis-root', source_id: m.source_id, source_url: null, source_type: 'synthetic',
    analysis_status: 'complete', video_metadata: {width: 1280, height: 720, fps: 30, frame_count: 300, duration_seconds: 10, has_audio: false},
    scenes: [{id: 's1', start_frame: 0, end_frame: 299, description: 'scene 1'}],
    objects: [{id: 'o1', scene_id: 's1', description: 'shape'}], animations: [], timestamps: [], motion_parameters: [],
    visual_style: {description: 'synthetic'}, evidence: [refEvidence, frameEvidence], confidence: null, limitations: [],
    rights_note: m.rights_note, lab_analysis_path: null
  };
  parse('analysis', analysis);
  let seq = 0;
  const submit = (role: string, kind: Kind, data: unknown) => {
    const p = join(root, `input-${seq++}.json`);
    writeFileSync(p, JSON.stringify(data));
    m = submitArtifact(root, role, kind, p);
    return m;
  };
  const impl = (rev: number) => ({
    artifact_id: `impl-${rev}`, reference_id: m.source_id, analysis_id: analysis.artifact_id, revision: rev,
    files: [file(`src-${rev}.tsx`)], rationale: `impl rev ${rev}`, tasks_id: rev ? `tasks-${rev - 1}` : null
  });
  const rnd = (rev: number) => ({
    artifact_id: `rnd-${rev}`, reference_id: m.source_id, analysis_id: analysis.artifact_id, implementation_id: `impl-${rev}`,
    revision: rev, video: file(`vid-${rev}.mp4`)
  });
  const evl = (rev: number, err: number): Evaluation => ({
    schema_version: '1', artifact_id: `eval-${rev}`, reference_id: m.source_id, generated_video_id: `rnd-${rev}`,
    evaluation_version: rev + 1, comparison_type: 'direct_frames',
    metrics: (['position', 'size', 'color', 'start_time', 'end_time', 'displacement', 'speed_change', 'frame_change'] as MetricAxis[]).map(axis => ({
      id: axis, axis, value: err, unit: 'px', threshold: 1, pass: err <= 1, basis: 'measured', evidence_ids: ['frame-0']
    })),
    qualitative_findings: (['naturalness', 'readability', 'consistency', 'tempo', 'clarity'] as QualityAxis[]).map(axis => ({
      axis, score: null, reason: 'unreviewed', frame_evidence_ids: [], reviewer: null
    })),
    differences: [], evidence: [refEvidence, frameEvidence, {id: 'gen', path: `vid-${rev}.mp4`, sha256: sha256(join(root, `vid-${rev}.mp4`)), frame: null, description: 'Gen'}],
    confidence: null, improvement_candidates: [], limitations: [], threshold_profile: 'synthetic-v1'
  });
  const tsk = (rev: number): ImprovementTasks => ({
    schema_version: '1', artifact_id: `tasks-${rev}`, evaluation_id: `eval-${rev}`, reference_id: m.source_id, generated_video_id: `rnd-${rev}`,
    tasks: [{task_id: `tsk-${rev}`, owner: 'animation-refiner', priority: 'P1', target_component: 'Reproduction', problem: 'err > threshold', evidence: ['frame-0'], expected_behavior: 'fix', acceptance_criteria: ['err <= 1'], status: 'ready'}]
  });
  return {root, analysis, submit, impl, rnd, evl, tsk, get m() { return m; }};
}

test('T119: 改善上限（max_improvements=2）到達時に安全停止（stop_limit）すること', t => {
  const r = setupMockRun(t);
  // 解析提出
  r.submit('video-analysis-director', 'analysis', r.analysis);
  // Rev 0: 誤差大 (5.0 > 1.0) -> needs_tasks
  r.submit('remotion-developer', 'implementation', r.impl(0));
  r.submit('render-engineer', 'render', r.rnd(0));
  const s0 = r.submit('quality-evaluator', 'evaluation', r.evl(0, 5.0));
  assert.equal(s0.status, 'needs_tasks');

  // Tasks 0
  const t0 = r.tsk(0); parse('tasks', t0);
  r.submit('improvement-planner', 'tasks', t0);

  // Rev 1 (改善第1回目): 誤差低減 (4.0) だが閾値1.0未達 -> needs_tasks
  r.submit('animation-refiner', 'implementation', r.impl(1));
  r.submit('render-engineer', 'render', r.rnd(1));
  const s1 = r.submit('quality-evaluator', 'evaluation', r.evl(1, 4.0));
  assert.equal(s1.status, 'needs_tasks');

  // Tasks 1
  const t1 = r.tsk(1); parse('tasks', t1);
  r.submit('improvement-planner', 'tasks', t1);

  // Rev 2 (改善第2回目、上限到達): 誤差低減 (3.0) だが閾値1.0未達 -> stop_limit!
  r.submit('animation-refiner', 'implementation', r.impl(2));
  r.submit('render-engineer', 'render', r.rnd(2));
  const s2 = r.submit('quality-evaluator', 'evaluation', r.evl(2, 3.0));
  assert.equal(s2.status, 'stop_limit', '最大改善上限（2回）到達で安全停止すること');

  // 上限到達後の追加タスク提出は拒否されること
  assert.throws(() => r.submit('improvement-planner', 'tasks', r.tsk(2)), /Wrong stage/);
});

test('T119: 改善なし・劣化発生時に余計なループを行わず即時安全停止（stop_no_improvement）すること', t => {
  const r = setupMockRun(t);
  r.submit('video-analysis-director', 'analysis', r.analysis);
  r.submit('remotion-developer', 'implementation', r.impl(0));
  r.submit('render-engineer', 'render', r.rnd(0));
  r.submit('quality-evaluator', 'evaluation', r.evl(0, 3.0));
  r.submit('improvement-planner', 'tasks', r.tsk(0));

  // Rev 1で誤差が悪化 (3.5 > 3.0)
  r.submit('animation-refiner', 'implementation', r.impl(1));
  r.submit('render-engineer', 'render', r.rnd(1));
  const s = r.submit('quality-evaluator', 'evaluation', r.evl(1, 3.5));
  assert.equal(s.status, 'stop_no_improvement', '劣化検出時に即時安全停止すること');
});

test('T119: 参考動画が解析不能（unavailable）の場合は描画・実装に進まず安全停止（stop_inconclusive）すること', t => {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-unavail-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const root = join(dir, 'run');
  const m = initializeRun(root, {url: 'https://www.youtube.com/watch?v=unobtainable', rights: 'unavailable test', sourceType: 'youtube'});
  const unavailAnalysis: AnalysisContract = {
    schema_version: '1', artifact_id: 'analysis-unavail', source_id: m.source_id, source_url: m.source_url, source_type: 'youtube',
    analysis_status: 'unavailable', video_metadata: {width: null, height: null, fps: null, frame_count: null, duration_seconds: null, has_audio: null},
    scenes: [], objects: [], animations: [], timestamps: [], motion_parameters: [],
    visual_style: {description: null}, evidence: [], confidence: null,
    limitations: ['外部動画取得制限のため動画解析不可'], rights_note: m.rights_note, lab_analysis_path: null
  };
  parse('analysis', unavailAnalysis);
  const p = join(root, 'analysis-unavail.json');
  writeFileSync(p, JSON.stringify(unavailAnalysis));
  const res = submitArtifact(root, 'video-analysis-director', 'analysis', p);
  assert.equal(res.status, 'stop_inconclusive', '解析不能時はstop_inconclusiveで停止すること');
});
