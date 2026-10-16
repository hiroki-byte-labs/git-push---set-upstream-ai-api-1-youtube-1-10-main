// Existing motion-lab remains the sole pixel/motion analyzer and Remotion renderer.
// This adapter adds portable contracts and the missing differential metrics only.
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyzeVideo} from '../motion-lab/tools/analyze.ts';
import {compareVideos, type Comparison} from '../motion-lab/tools/compare.ts';
import {forEachFrame} from '../motion-lab/tools/lib/ffmpeg.ts';
import type {Analysis, ElementAnalysis, Status} from '../motion-lab/shared/analysis.ts';
import {parse, type AnalysisContract, type Evaluation, type Evidence, type ImprovementTasks} from './contracts.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
export const hashFile = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');
export function saveJSON(path: string, data: unknown): void {
  mkdirSync(dirname(path), {recursive: true});
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', {flag: 'wx'});
}
export function evidence(root: string, path: string, id: string, frame: number | null, description: string): Evidence {
  const rel = relative(resolve(root), resolve(path));
  if (!rel || rel.startsWith('..') || rel.startsWith('/')) throw Error('証跡は案件ディレクトリ内に必要');
  return {id, path: rel.split('\\').join('/'), sha256: hashFile(path), frame, description};
}
const basis = (s: Status): 'measured' | 'estimated' | 'unknown' => s === 'measured' ? 'measured' : s === 'unknown' ? 'unknown' : 'estimated';
const pointValue = (p: ElementAnalysis['animations'][number]['start']) => ['measured', 'estimated'].includes(p.status) ? p.time : null;

export async function analyzeForHandoff(root: string, sourceId: string, ref: string, rights: string, sourceType: AnalysisContract['source_type'] = 'local', sourceUrl: string | null = null): Promise<{contract: AnalysisContract; lab: Analysis}> {
  const dir = join(root, 'analysis');
  mkdirSync(dir, {recursive: false});
  const lab = await analyzeVideo(ref, {rightsNote: rights, outDir: dir, log: console.log});
  const raw = join(dir, 'lab-analysis.json');
  saveJSON(raw, lab);
  const ev = [evidence(root, raw, 'lab-measurements', null, 'FFmpeg画素計測・既存motion-labの解析結果。モデル推定と観測不能も原本に保存'), evidence(root, ref, 'reference-media', null, '利用許可の根拠を記録した元動画')];
  for (const segment of lab.motionSegments) {
    if (!segment.frames) continue;
    const frame = segment.startFrame;
    ev.push(evidence(root, join(dir, segment.frames.dir, `f${String(frame).padStart(4, '0')}.png`), `reference-frame-${frame}`, frame, 'FFmpegで実際に抽出した元動画フレーム（0始まり）'));
  }
  const unknown = lab.unresolved.map(x => `${x.item}: ${x.reason}`);
  const contract: AnalysisContract = {
    schema_version: '1', artifact_id: `${sourceId}-analysis`, source_id: sourceId, source_url: sourceUrl, source_type: sourceType,
    analysis_status: 'partial', video_metadata: {width: lab.video.width, height: lab.video.height, fps: lab.video.fps, frame_count: lab.video.frameCount, duration_seconds: lab.video.duration, has_audio: lab.video.hasAudio},
    scenes: lab.scenes.map(s => ({id: `scene-${s.index}`, start_frame: s.startFrame, end_frame: s.endFrame, description: `背景 ${s.background.color ?? '不明'}`})),
    objects: lab.elements.map(e => ({id: e.id, scene_id: `scene-${e.scene}`, description: e.shape.value})),
    animations: lab.elements.flatMap(e => e.animations.map(a => ({id: `${e.id}-${a.id}`, object_id: e.id, type: a.type, start_seconds: pointValue(a.start), end_seconds: pointValue(a.end), basis: 'estimated' as const, evidence_ids: ['lab-measurements']}))),
    timestamps: lab.scenes.flatMap(s => [{id: `scene-${s.index}-start`, frame: s.startFrame, seconds: s.start, basis: 'measured' as const}, {id: `scene-${s.index}-end`, frame: s.endFrame, seconds: s.end, basis: 'measured' as const}]),
    motion_parameters: lab.elements.flatMap(e => (['cx', 'cy', 'width', 'height'] as const).map(parameter => ({object_id: e.id, parameter: `final_${parameter}`, value: e.layout.status === 'unknown' ? null : e.layout.final[parameter], unit: 'px', basis: basis(e.layout.status), evidence_ids: ['lab-measurements']}))),
    visual_style: {description: '単色背景上の平面図形。色・形・配置の観測値はlab_analysis_pathを参照。'}, evidence: ev, confidence: null,
    limitations: [...unknown, ...lab.assumptions, '音声内容・意味・演出意図の解析は未実装。has_audioはストリームの存在だけ。', 'confidenceは校正していないためnull。境界外の時刻を実測として補完しない。', '画素由来の詳細仕様はlab_analysis_path。Geminiによる分析を実行したものではない。'],
    rights_note: rights, lab_analysis_path: relative(root, raw),
  };
  parse('analysis', contract);
  saveJSON(join(dir, 'animation-analysis.json'), contract);
  return {contract, lab};
}

type Profile = {id: string; provisional: boolean; scope: string} & Record<Evaluation['metrics'][number]['axis'], number>;
function readProfile(path: string): Profile {
  const p: Profile = JSON.parse(readFileSync(path, 'utf8'));
  for (const key of ['position','size','color','start_time','end_time','displacement','speed_change','frame_change'] as const) if (!Number.isFinite(p[key]) || p[key] <= 0) throw Error(`閾値 ${key} は正の有限数が必要`);
  if (!p.id || p.provisional !== true) throw Error('初期閾値はid付き仮設定として管理する');
  return p;
}
function maxOrNull(values: number[]): number | null { return values.length ? Math.max(...values) : null; }
function xy(e: ElementAnalysis): Map<number, [number, number]> {
  const ys = new Map(e.series.cy.frames.map((f, i) => [f, e.series.cy.values[i]]));
  return new Map(e.series.cx.frames.filter(f => ys.has(f)).map(f => [f, [e.series.cx.values[e.series.cx.frames.indexOf(f)], ys.get(f)!]]));
}
export function extraMotionMetrics(ref: Analysis, gen: Analysis, cmp: Comparison): {color: number | null; displacement: number | null; speed_change: number | null} {
  const colors: number[] = [], displacements: number[] = [], accelerations: number[] = [];
  for (const pair of cmp.motion.elements) {
    const a = ref.elements.find(e => e.id === pair.reference), b = gen.elements.find(e => e.id === pair.generated);
    if (!a || !b) continue;
    if (a.color.rgb && b.color.rgb) colors.push(Math.hypot(...a.color.rgb.map((v, i) => v - b.color.rgb![i])));
    const ra = xy(a), rb = xy(b), frames = [...ra.keys()].filter(f => rb.has(f)).sort((x, y) => x - y);
    if (frames.length > 1) {
      const first = frames[0], last = frames.at(-1)!;
      displacements.push(Math.hypot(...[0, 1].map(i => (ra.get(last)![i] - ra.get(first)![i]) - (rb.get(last)![i] - rb.get(first)![i]))));
    }
    for (const f of frames) {
      if (![f - 1, f + 1].every(n => ra.has(n) && rb.has(n))) continue;
      accelerations.push(Math.hypot(...[0, 1].map(i => ((ra.get(f + 1)![i] - 2 * ra.get(f)![i] + ra.get(f - 1)![i]) - (rb.get(f + 1)![i] - 2 * rb.get(f)![i] + rb.get(f - 1)![i])) * ref.video.fps ** 2)));
    }
  }
  return {color: maxOrNull(colors), displacement: maxOrNull(displacements), speed_change: maxOrNull(accelerations)};
}
async function temporalChanges(video: string, lab: Analysis): Promise<number[]> {
  const values: number[] = []; let previous: Uint8Array | null = null;
  await forEachFrame(video, lab.video.width, lab.video.height, rgb => {
    if (previous) { let total = 0; for (let i = 0; i < rgb.length; i++) total += Math.abs(rgb[i] - previous[i]); values.push(total / rgb.length); }
    previous = new Uint8Array(rgb);
  }, {w: 64, h: 36});
  return values;
}
export async function evaluateForHandoff(root: string, ref: string, generated: string, lab: Analysis, sourceId: string, generatedId: string, revision: number, profilePath = join(HERE, 'thresholds.json')): Promise<Evaluation> {
  const out = join(root, `evaluation-${revision}`); mkdirSync(out, {recursive: false});
  const cmp = await compareVideos(ref, generated, lab, out, {log: console.log});
  const raw = join(out, 'lab-comparison.json'); saveJSON(raw, cmp);
  const gen: Analysis = JSON.parse(readFileSync(join(out, 'generated-analysis.json'), 'utf8'));
  const profile = readProfile(profilePath); saveJSON(join(out, 'thresholds.json'), profile);
  const extra = extraMotionMetrics(lab, gen, cmp);
  const [rChanges, gChanges] = await Promise.all([temporalChanges(ref, lab), temporalChanges(generated, gen)]);
  if (rChanges.length !== gChanges.length) throw Error('フレーム間変化の標本数が一致しない');
  saveJSON(join(out, 'extra-metrics.json'), {...extra, method: '色=RGB距離、移動量=共通観測区間の変位ベクトル差、速度変化=連続3フレームの中心座標の2階差分差×fps²、フレーム変化=64x36 area縮小RGB絶対差平均の動画間差。すべて最大誤差。', reference_frame_changes: rChanges, generated_frame_changes: gChanges});
  const ev: Evidence[] = [evidence(root, ref, 'reference-media', null, '直接比較でデコードした参考動画'), evidence(root, generated, 'generated-media', null, '直接比較でデコードした生成動画'), evidence(root, raw, 'comparison', null, '既存FFmpeg比較器による計測'), evidence(root, join(out, 'extra-metrics.json'), 'extra-metrics', null, '追加の速度変化等の測定'), evidence(root, join(out, 'thresholds.json'), 'thresholds', null, 'この評価に固定した仮閾値')];
  for (const path of cmp.images) {
    const f = Number(path.match(/cmp-f(\d+)\.png$/)![1]);
    ev.push(evidence(root, path, `comparison-frame-${f}`, f, '同じフレーム番号の参考|生成|差分×4。0始まり。'));
  }
  const timing = cmp.motion.elements.flatMap(e => e.animations).filter(a => a.basis === 'observed');
  const vals = {
    position: maxOrNull(cmp.motion.elements.flatMap(e => [e.maxError.cx, e.maxError.cy].filter((n): n is number => n !== undefined))),
    size: maxOrNull(cmp.motion.elements.flatMap(e => [e.maxError.w, e.maxError.h].filter((n): n is number => n !== undefined))),
    ...extra,
    start_time: maxOrNull(timing.flatMap(a => a.startDiff === null ? [] : [Math.abs(a.startDiff) / lab.video.fps])),
    end_time: maxOrNull(timing.flatMap(a => a.endDiff === null ? [] : [Math.abs(a.endDiff) / lab.video.fps])),
    frame_change: maxOrNull(rChanges.map((v, i) => Math.abs(v - gChanges[i]))),
  };
  const units = {position: 'px', size: 'px', color: 'RGB Euclidean / 0..441.67', start_time: 'seconds', end_time: 'seconds', displacement: 'px', speed_change: 'px/s^2', frame_change: 'mean RGB / 0..255'};
  const incomplete = cmp.motion.elements.some(e => !e.generated) || cmp.motion.unmatchedGenerated.length > 0;
  const evaluation: Evaluation = {
    schema_version: '1', artifact_id: `${sourceId}-evaluation-${revision}`, reference_id: sourceId, generated_video_id: generatedId, evaluation_version: revision + 1, comparison_type: 'direct_frames',
    metrics: (Object.keys(vals) as (keyof typeof vals)[]).map(axis => { const value = incomplete ? null : vals[axis]; return {id: `metric-${axis}`, axis, value, unit: units[axis], threshold: profile[axis], pass: value === null ? null : value <= profile[axis], basis: value === null ? 'unknown' as const : 'measured' as const, evidence_ids: ['comparison', 'extra-metrics', 'thresholds', ...ev.filter(e => e.frame !== null).map(e => e.id)]}; }),
    qualitative_findings: (['naturalness','readability','consistency','tempo','clarity'] as const).map(axis => ({axis, score: null, reason: '自動測定では判断しない。動画と比較フレームを実際に見て理由・参照フレーム付きで別の評価版を提出する。', frame_evidence_ids: [], reviewer: null})),
    differences: cmp.verdict.failures, evidence: ev, confidence: null,
    improvement_candidates: (Object.keys(vals) as (keyof typeof vals)[]).filter(k => vals[k] !== null && vals[k]! > profile[k]),
    limitations: ['音声解析・音声同期はこの無音サンプルでは未検証。', '作品品質の5観点は視聴レビュー待ち。再現度と合算しない。', '開始・終了は観測可能な動きのみ集計。画面外開始のモデル時刻を除外。', '対応付け・位置・角度は既存単色図形解析器の推定を含む。一般映像には適用しない。', 'フレーム変化は縮小画像の差であり全解像度の一致とは別。SSIMは原本comparisonに記録。', ...(incomplete ? ['図形の対応付けが不完全。集計をnullにして次工程の判定を保留。'] : [])], threshold_profile: profile.id,
  };
  parse('evaluation', evaluation); saveJSON(join(out, 'evaluation.json'), evaluation); return evaluation;
}
export function planImprovements(evaluation: Evaluation): ImprovementTasks {
  parse('evaluation', evaluation);
  const tasks: ImprovementTasks = {schema_version: '1', artifact_id: `${evaluation.artifact_id}-tasks`, evaluation_id: evaluation.artifact_id, reference_id: evaluation.reference_id, generated_video_id: evaluation.generated_video_id,
    tasks: evaluation.metrics.filter(m => m.pass === false).map((m, index) => ({task_id: `${evaluation.artifact_id}-fix-${index + 1}`, owner: 'animation-refiner', priority: 'P1', target_component: 'isolated-remotion-source', problem: `${m.axis}: ${m.value} ${m.unit} > ${m.threshold}`, evidence: m.evidence_ids, expected_behavior: `${m.axis}の差を${m.threshold} ${m.unit}以内にする。解析のunknownを補完しない。`, acceptance_criteria: [`次の動画で${m.axis} <= ${m.threshold} ${m.unit}`, '他の不合格指標を悪化させず、既存の合格指標を不合格にしない', '元版を保持して新しい実装・動画・評価を提出する'], status: 'ready'}))};
  return parse('tasks', tasks);
}
