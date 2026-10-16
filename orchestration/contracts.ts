import { readFileSync } from 'node:fs';
import { Ajv } from 'ajv';

export type Basis = 'measured' | 'estimated' | 'unknown';
export interface Evidence { id: string; path: string; sha256: string; frame: number | null; description: string }
interface Artifact { schema_version: '1'; artifact_id: string }
export interface AnalysisContract extends Artifact {
  source_id: string;
  source_url: string | null;
  source_type: 'local' | 'youtube' | 'synthetic';
  analysis_status: 'complete' | 'partial' | 'unavailable';
  video_metadata: { width: number | null; height: number | null; fps: number | null; frame_count: number | null; duration_seconds: number | null; has_audio: boolean | null };
  scenes: { id: string; start_frame: number | null; end_frame: number | null; description: string | null }[];
  objects: { id: string; scene_id: string; description: string | null }[];
  animations: { id: string; object_id: string; type: string; start_seconds: number | null; end_seconds: number | null; basis: Basis; evidence_ids: string[] }[];
  timestamps: { id: string; frame: number | null; seconds: number | null; basis: Basis }[];
  motion_parameters: { object_id: string; parameter: string; value: number | null; unit: string; basis: Basis; evidence_ids: string[] }[];
  visual_style: { description: string | null };
  evidence: Evidence[];
  confidence: number | null;
  limitations: string[];
  rights_note: string;
  lab_analysis_path: string | null;
}
export type MetricAxis = 'position' | 'size' | 'color' | 'start_time' | 'end_time' | 'displacement' | 'speed_change' | 'frame_change';
export type QualityAxis = 'naturalness' | 'readability' | 'consistency' | 'tempo' | 'clarity';
export interface Evaluation extends Artifact {
  reference_id: string;
  generated_video_id: string;
  evaluation_version: number;
  comparison_type: 'direct_frames' | 'specification_only' | 'unavailable';
  metrics: { id: string; axis: MetricAxis; value: number | null; unit: string; threshold: number; pass: boolean | null; basis: Basis; evidence_ids: string[] }[];
  qualitative_findings: { axis: QualityAxis; score: number | null; reason: string; frame_evidence_ids: string[]; reviewer: string | null }[];
  differences: string[];
  evidence: Evidence[];
  confidence: number | null;
  improvement_candidates: string[];
  limitations: string[];
  threshold_profile: string;
}
export interface ImprovementTasks extends Artifact {
  evaluation_id: string;
  reference_id: string;
  generated_video_id: string;
  tasks: {
    task_id: string;
    owner: 'animation-refiner' | 'remotion-developer' | 'render-engineer';
    priority: 'P1' | 'P2' | 'P3';
    target_component: string;
    problem: string;
    evidence: string[];
    expected_behavior: string;
    acceptance_criteria: string[];
    status: 'ready' | 'in_progress' | 'done' | 'blocked';
  }[];
}
export type ContractKind = 'analysis' | 'evaluation' | 'tasks';
export type Contract = AnalysisContract | Evaluation | ImprovementTasks;
const ajv = new Ajv({ allErrors: true, strict: true });
const filenames = { analysis: 'animation-analysis', evaluation: 'evaluation', tasks: 'improvement-tasks' };
const validators = Object.fromEntries(Object.entries(filenames).map(([kind, filename]) => [
  kind, ajv.compile(JSON.parse(readFileSync(new URL(`schemas/${filename}.schema.json`, import.meta.url), 'utf8'))),
]));

export class ContractError extends Error {
  constructor(kind: ContractKind, details: string[]) {
    super(`${kind} contract invalid: ${details.join('; ')}`);
    this.name = 'ContractError';
  }
}

/** Paths are run-relative POSIX paths. Reading/hashing files is the handoff layer's job. */
export function safeRelativePath(path: string): boolean {
  return path.length > 0 && !path.startsWith('/') && !path.includes('\\') &&
    !path.includes('\0') && !/^[A-Za-z]:/.test(path) &&
    path.split('/').every(part => part !== '' && part !== '.' && part !== '..');
}

export function assertContract(kind: ContractKind, value: unknown): void {
  const validator = validators[kind];
  if (!validator(value)) {
    throw new ContractError(kind, (validator.errors ?? []).map(e => `${e.instancePath || '/'} ${e.message}`));
  }
  const errors: string[] = [];
  const require = (condition: boolean, message: string) => { if (!condition) errors.push(message); };
  const unique = (ids: string[], label: string) => require(new Set(ids).size === ids.length, `${label}: duplicate ID`);
  if (kind === 'tasks') {
    const data = value as ImprovementTasks;
    unique(data.tasks.map(t => t.task_id), 'tasks');
    // Task evidence belongs to a separate evaluation; handoff validates those cross-artifact links.
  } else {
    const data = value as AnalysisContract | Evaluation;
    unique(data.evidence.map(e => e.id), 'evidence');
    for (const e of data.evidence) require(safeRelativePath(e.path), `evidence ${e.id}: unsafe path`);
    const evidence = new Map(data.evidence.map(e => [e.id, e]));
    const refs = (ids: string[], label: string) => ids.forEach(id => require(evidence.has(id), `${label}: missing evidence ${id}`));
    if (kind === 'analysis') {
      const a = data as AnalysisContract;
      unique([...a.scenes, ...a.objects, ...a.animations, ...a.timestamps].map(v => v.id), 'analysis entities');
      unique(a.motion_parameters.map(v => `${v.object_id}\0${v.parameter}`), 'motion parameters');
      const scenes = new Set(a.scenes.map(s => s.id));
      const objects = new Set(a.objects.map(o => o.id));
      for (const s of a.scenes) {
        require(s.start_frame === null || s.end_frame === null || s.end_frame >= s.start_frame, `scene ${s.id}: reversed frames`);
        require(a.video_metadata.frame_count === null || s.end_frame === null || s.end_frame < a.video_metadata.frame_count, `scene ${s.id}: frame exceeds video`);
      }
      for (const o of a.objects) require(scenes.has(o.scene_id), `object ${o.id}: missing scene`);
      for (const motion of [...a.animations, ...a.motion_parameters]) {
        require(objects.has(motion.object_id), `motion: missing object ${motion.object_id}`);
        refs(motion.evidence_ids, 'motion');
        if (motion.basis !== 'unknown') require(motion.evidence_ids.length > 0, 'known motion needs evidence');
      }
      for (const animation of a.animations) {
        require(animation.start_seconds === null || animation.end_seconds === null || animation.end_seconds >= animation.start_seconds, `animation ${animation.id}: reversed timestamps`);
        if (animation.basis === 'unknown') require(animation.start_seconds === null && animation.end_seconds === null, `animation ${animation.id}: unknown times must be null`);
      }
      for (const parameter of a.motion_parameters) {
        require((parameter.basis === 'unknown') === (parameter.value === null), `parameter ${parameter.parameter}: basis/value mismatch`);
      }
      for (const timestamp of a.timestamps) {
        if (timestamp.basis === 'unknown') require(timestamp.frame === null && timestamp.seconds === null, `timestamp ${timestamp.id}: unknown must be null`);
        else require(timestamp.frame !== null || timestamp.seconds !== null, `timestamp ${timestamp.id}: known needs value`);
      }
      if (a.source_type === 'youtube') {
        require(a.source_url !== null && /^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(a.source_url), 'youtube source needs an HTTPS YouTube URL');
      }
      if (a.lab_analysis_path !== null) require(safeRelativePath(a.lab_analysis_path), 'unsafe lab_analysis_path');
      if (a.analysis_status === 'complete') require(a.scenes.length > 0 && a.evidence.length > 0 && Object.values(a.video_metadata).every(v => v !== null), 'complete analysis requires scenes, evidence and metadata');
      if (a.analysis_status === 'unavailable') {
        require(Object.values(a.video_metadata).every(v => v === null) && a.scenes.length === 0 && a.objects.length === 0 && a.animations.length === 0 && a.timestamps.length === 0 && a.motion_parameters.length === 0 && a.confidence === null && a.visual_style.description === null, 'unavailable analysis must not invent observations');
      }
      if (a.analysis_status !== 'complete') require(a.limitations.length > 0, 'partial/unavailable analysis needs limitations');
    } else {
      const e = data as Evaluation;
      unique(e.metrics.map(m => m.id), 'metrics');
      unique(e.metrics.map(m => m.axis), 'metric axes');
      unique(e.qualitative_findings.map(q => q.axis), 'qualitative axes');
      for (const m of e.metrics) {
        require(m.threshold > 0, `metric ${m.id}: threshold must be positive`);
        require(m.value === null || m.value >= 0, `metric ${m.id}: error value must be nonnegative`);
        refs(m.evidence_ids, `metric ${m.id}`);
        require((m.basis === 'unknown') === (m.value === null), `metric ${m.id}: basis/value mismatch`);
        require(m.value === null ? m.pass === null : m.pass === (m.value <= m.threshold), `metric ${m.id}: pass/value/threshold mismatch`);
        if (m.basis !== 'unknown') require(m.evidence_ids.length > 0, `metric ${m.id}: evidence required`);
        if (m.basis === 'measured') {
          require(e.comparison_type === 'direct_frames', `metric ${m.id}: measured metrics require direct_frames`);
          require(m.evidence_ids.some(id => evidence.get(id)?.frame != null), `metric ${m.id}: frame evidence required`);
        }
      }
      for (const q of e.qualitative_findings) {
        refs(q.frame_evidence_ids, `quality ${q.axis}`);
        require(q.frame_evidence_ids.every(id => evidence.get(id)?.frame != null), `quality ${q.axis}: evidence must identify frames`);
        if (q.score !== null) require(q.frame_evidence_ids.length > 0 && q.reviewer !== null && q.reviewer.trim().length > 0, `quality ${q.axis}: score requires frame evidence and reviewer`);
      }
      if (e.comparison_type === 'direct_frames') require(e.evidence.some(item => item.frame !== null), 'direct_frames comparison requires frame evidence');
      if (e.comparison_type === 'unavailable') require(e.metrics.every(m => m.value === null) && e.qualitative_findings.every(q => q.score === null) && e.confidence === null && e.limitations.length > 0, 'unavailable comparison must not invent scores and needs limitations');
    }
  }
  if (errors.length > 0) throw new ContractError(kind, errors);
}

export function parse(kind: 'analysis', value: unknown): AnalysisContract;
export function parse(kind: 'evaluation', value: unknown): Evaluation;
export function parse(kind: 'tasks', value: unknown): ImprovementTasks;
export function parse(kind: ContractKind, value: unknown): Contract;
export function parse(kind: ContractKind, value: unknown): Contract {
  assertContract(kind, value);
  return value as Contract;
}
