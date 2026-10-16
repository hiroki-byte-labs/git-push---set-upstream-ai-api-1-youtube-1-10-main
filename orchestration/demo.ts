// Offline deterministic integration exercise, NOT a claim that another AI product ran.
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {makeReference} from '../motion-lab/tools/make-reference.ts';
import {probe} from '../motion-lab/tools/lib/ffmpeg.ts';
import {initializeRun, submitArtifact, getRun, type Implementation, type Render} from './workflow.ts';
import {analyzeForHandoff, evaluateForHandoff, hashFile, planImprovements, saveJSON} from './lab-adapter.ts';
import type {Analysis} from '../motion-lab/shared/analysis.ts';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LAB = join(REPO, 'motion-lab');
function listFiles(root: string): string[] {
  return readdirSync(root, {withFileTypes: true}).flatMap(e => e.isDirectory() ? listFiles(join(root, e.name)) : [join(root, e.name)]);
}
function implement(root: string, lab: Analysis, revision: number, taskId: string | null): {file: string; props: string; entry: string; video: string} {
  const manifest = getRun(root), dir = join(root, `revision-${revision}`);
  mkdirSync(dir);
  cpSync(join(LAB, 'src'), join(dir, 'src'), {recursive: true, errorOnExist: true, force: false});
  cpSync(join(LAB, 'shared'), join(dir, 'shared'), {recursive: true, errorOnExist: true, force: false});
  const component = join(dir, 'src', 'Reproduction.tsx');
  if (revision === 0) {
    const original = readFileSync(component, 'utf8');
    const changed = original.replace("const cx = v('cx'),", "const cx = v('cx') + 16, // T112 demo: deliberate 16px defect for measured improvement\n");
    if (changed === original) throw Error('デモ用欠陥の挿入先が変わった。既存コードには変更せず停止。');
    writeFileSync(component, changed);
  }
  const props = join(dir, 'props.json'); saveJSON(props, {analysis: lab, theme: 'measured'});
  const config = join(dir, 'render-settings.json'); saveJSON(config, {renderer: '@remotion/cli', composition: 'Reproduction', chrome_mode: 'chrome-for-testing', source: 'isolated copy of motion-lab', execution: 'local deterministic demo, not Claude Code'});
  const implementation: Implementation = {artifact_id: `${manifest.source_id}-implementation-${revision}`, reference_id: manifest.source_id, analysis_id: `${manifest.source_id}-analysis`, revision, files: listFiles(dir).map(path => ({path: relative(root, path), sha256: hashFile(path)})), rationale: revision === 0 ? 'ローカルの連携試験。隔離コピーへ位置の16pxずれを意図的に挿入。' : '評価で位置差を確認したため、次版の隔離ソースから16px加算を除去。元版は保持。', tasks_id: taskId};
  const file = join(dir, 'implementation.json'); saveJSON(file, implementation);
  submitArtifact(root, revision === 0 ? 'remotion-developer' : 'animation-refiner', 'implementation', file);
  return {file, props, entry: join(dir, 'src', 'index.ts'), video: join(dir, 'generated.mp4')};
}
function render(root: string, data: ReturnType<typeof implement>, revision: number): string {
  const req = createRequire(join(LAB, 'package.json')), pkgPath = req.resolve('@remotion/cli/package.json');
  const bin = JSON.parse(readFileSync(pkgPath, 'utf8')).bin;
  const cli = join(dirname(pkgPath), typeof bin === 'string' ? bin : bin.remotion);
  if (existsSync(data.video)) throw Error('既存の動画を上書きしない');
  const result = spawnSync(process.execPath, [cli, 'render', data.entry, 'Reproduction', data.video, `--props=${data.props}`, '--log=error', '--concurrency=2'], {cwd: LAB, encoding: 'utf8', timeout: 240000, maxBuffer: 16 * 1024 * 1024, env: {...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ''}`}});
  writeFileSync(join(dirname(data.video), 'render.log'), `${result.stdout ?? ''}\n${result.stderr ?? ''}\nexit=${result.status}\nerror=${result.error?.message ?? 'none'}\n`, {flag: 'wx'});
  if (result.error || result.status !== 0) throw Error(`Remotion失敗。${join(dirname(data.video), 'render.log')} を確認`);
  const info = probe(data.video); saveJSON(join(dirname(data.video), 'media-check.json'), info);
  const m = getRun(root), implementation: Implementation = JSON.parse(readFileSync(data.file, 'utf8'));
  const r: Render = {artifact_id: `${m.source_id}-render-${revision}`, reference_id: m.source_id, analysis_id: `${m.source_id}-analysis`, implementation_id: implementation.artifact_id, revision, video: {path: relative(root, data.video), sha256: hashFile(data.video)}};
  const file = join(dirname(data.video), 'render.json'); saveJSON(file, r); submitArtifact(root, 'render-engineer', 'render', file); return r.artifact_id;
}
export async function runDemo(root: string): Promise<void> {
  // Root under motion-lab/out lets copied source resolve existing pinned Remotion dependencies.
  const allowed = relative(join(LAB, 'out'), resolve(root));
  if (allowed.startsWith('..') || !allowed || allowed.startsWith('/')) throw Error('デモ出力は新しいmotion-lab/out/<案件>に指定');
  if (existsSync(root) || existsSync(`${root}-reference`)) throw Error('既存案件は上書きしない。新しい出力先を指定');
  mkdirSync(dirname(root), {recursive: true});
  console.log('自作参考動画を生成（既存T110の合成器、API呼出なし）');
  const made = await makeReference(`${root}-reference`);
  const refPath = typeof made === 'string' ? made : join(`${root}-reference`, 'reference.mp4');
  const rights = 'T110の自作図形・数式で生成した検証素材。第三者の映像・音声は不使用。';
  const m = initializeRun(root, {reference: refPath, rights, sourceType: 'synthetic'});
  const ref = join(root, m.reference!.path);
  const {lab} = await analyzeForHandoff(root, m.source_id, ref, rights, 'synthetic');
  submitArtifact(root, 'video-analysis-director', 'analysis', join(root, 'analysis', 'animation-analysis.json'));
  let taskId: string | null = null;
  for (let revision = 0; revision <= 1; revision++) {
    console.log(`隔離ソース実装・描画 revision=${revision}`);
    const imp = implement(root, lab, revision, taskId), generatedId = render(root, imp, revision);
    const evaluation = await evaluateForHandoff(root, ref, imp.video, lab, m.source_id, generatedId, revision);
    const state = submitArtifact(root, 'quality-evaluator', 'evaluation', join(root, `evaluation-${revision}`, 'evaluation.json'));
    console.log(JSON.stringify({revision, status: state.status, metrics: evaluation.metrics.map(x => ({axis: x.axis, value: x.value, pass: x.pass}))}));
    if (revision === 0) {
      if (state.status !== 'needs_tasks') throw Error(`欠陥を含む初版を改善工程に送れない: ${state.status}`);
      const tasks = planImprovements(evaluation), path = join(root, 'improvement-tasks-0.json'); saveJSON(path, tasks);
      submitArtifact(root, 'improvement-planner', 'tasks', path); taskId = tasks.artifact_id;
    }
  }
  const final = getRun(root);
  saveJSON(join(root, 'demo-result.json'), {execution: 'local deterministic adapters; no external AI product invocation', reference_id: final.source_id, status: final.status, revisions: [0, 1], paid_api_calls: 0, audio: 'silent synthetic sample; audio semantics/sync not tested', qualitative_review: 'pending; no invented subjective score', next_role: final.next_role});
  console.log(`結果: ${root}/demo-result.json`);
  if (final.status !== 'awaiting_quality') throw Error(`修正後の数値判定未達: ${final.status}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? join(LAB, 'out', `agent-demo-${Date.now()}`));
  await runDemo(root);
}
