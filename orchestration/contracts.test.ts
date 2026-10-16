import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, safeRelativePath, type AnalysisContract, type Evaluation, type ImprovementTasks } from './contracts.ts';

const frame = { id: 'ev-frame', path: 'frames/reference-001.png', sha256: 'a'.repeat(64), frame: 1, description: 'Decoded source frame' };
function analysis(): AnalysisContract {
  return { schema_version: '1', artifact_id: 'analysis-1', source_id: 'reference-1', source_url: null, source_type: 'synthetic', analysis_status: 'complete',
    video_metadata: { width: 320, height: 180, fps: 30, frame_count: 30, duration_seconds: 1, has_audio: false },
    scenes: [{ id: 'scene-1', start_frame: 0, end_frame: 29, description: 'Rectangle' }],
    objects: [{ id: 'object-1', scene_id: 'scene-1', description: null }],
    animations: [{ id: 'animation-1', object_id: 'object-1', type: 'translate', start_seconds: 0, end_seconds: 0.5, basis: 'measured', evidence_ids: ['ev-frame'] }],
    timestamps: [{ id: 'time-1', frame: 1, seconds: 1 / 30, basis: 'measured' }],
    motion_parameters: [{ object_id: 'object-1', parameter: 'x', value: 20, unit: 'px', basis: 'measured', evidence_ids: ['ev-frame'] }],
    visual_style: { description: null }, evidence: [frame], confidence: null, limitations: [], rights_note: 'Self-created synthetic shapes', lab_analysis_path: 'analysis/lab.json' };
}
function evaluation(): Evaluation {
  return { schema_version: '1', artifact_id: 'evaluation-1', reference_id: 'reference-1', generated_video_id: 'render-1', evaluation_version: 1, comparison_type: 'direct_frames',
    metrics: [{ id: 'position-x', axis: 'position', value: 2, unit: 'px', threshold: 3, pass: true, basis: 'measured', evidence_ids: ['ev-frame'] }],
    qualitative_findings: [{ axis: 'clarity', score: null, reason: 'Human review not performed', frame_evidence_ids: [], reviewer: null }],
    differences: [], evidence: [frame], confidence: null, improvement_candidates: [], limitations: ['Synthetic shapes only'], threshold_profile: 'provisional-v1' };
}
function tasks(): ImprovementTasks {
  return { schema_version: '1', artifact_id: 'tasks-1', evaluation_id: 'evaluation-1', reference_id: 'reference-1', generated_video_id: 'render-1', tasks: [{ task_id: 'fix-1', owner: 'animation-refiner', priority: 'P1', target_component: 'Rectangle', problem: 'Position differs', evidence: ['ev-frame'], expected_behavior: 'Align with source', acceptance_criteria: ['Position error <= 3 px'], status: 'ready' }] };
}

test('all three complete artifacts validate with pinned Ajv and semantic checks', () => {
  assert.equal(parse('analysis', analysis()).source_id, 'reference-1');
  assert.equal(parse('evaluation', evaluation()).metrics[0]?.value, 2);
  assert.equal(parse('tasks', tasks()).tasks[0]?.owner, 'animation-refiner');
});

test('unknown observations use null; unavailable public URL remains unavailable', () => {
  const a = analysis();
  a.analysis_status = 'unavailable'; a.source_type = 'youtube'; a.source_url = 'https://www.youtube.com/watch?v=irBD6OF8d2Q';
  a.video_metadata = { width: null, height: null, fps: null, frame_count: null, duration_seconds: null, has_audio: null };
  a.scenes = []; a.objects = []; a.animations = []; a.timestamps = []; a.motion_parameters = []; a.evidence = []; a.lab_analysis_path = null;
  a.limitations = ['No frames or video input received'];
  assert.equal(parse('analysis', a).analysis_status, 'unavailable');
  a.video_metadata.fps = 30;
  assert.throws(() => parse('analysis', a), /must not invent/);
});

test('schema rejects missing fields, extra fields, invalid confidence, invalid hashes and owner', () => {
  const without = { ...analysis() } as Partial<AnalysisContract>; delete without.rights_note;
  assert.throws(() => parse('analysis', without), /rights_note/);
  assert.throws(() => parse('analysis', { ...analysis(), fabricated_field: true }), /additional properties/);
  assert.throws(() => parse('analysis', { ...analysis(), confidence: 1.01 }), /<= 1/);
  const a = analysis(); a.evidence = [{ ...frame, sha256: 'bad' }];
  assert.throws(() => parse('analysis', a), /pattern/);
  const t = tasks(); (t.tasks[0] as unknown as { owner: string }).owner = 'project-orchestrator';
  assert.throws(() => parse('tasks', t), /allowed values/);
});

test('entity IDs, object references and evidence references cannot dangle or duplicate', () => {
  const a = analysis(); a.objects[0]!.scene_id = 'absent';
  assert.throws(() => parse('analysis', a), /missing scene/);
  a.objects[0]!.scene_id = 'scene-1'; a.animations[0]!.object_id = 'absent';
  assert.throws(() => parse('analysis', a), /missing object/);
  a.animations[0]!.object_id = 'object-1'; a.animations[0]!.evidence_ids = ['absent'];
  assert.throws(() => parse('analysis', a), /missing evidence/);
  a.animations[0]!.evidence_ids = ['ev-frame']; a.objects.push({ ...a.objects[0]! });
  assert.throws(() => parse('analysis', a), /duplicate ID/);
  const t = tasks(); t.tasks.push({ ...t.tasks[0]! });
  assert.throws(() => parse('tasks', t), /duplicate ID/);
});

test('timeline bounds and unknown numerical claims are rejected', () => {
  const a = analysis(); a.scenes[0]!.end_frame = 30;
  assert.throws(() => parse('analysis', a), /exceeds video/);
  a.scenes[0]!.end_frame = 29; a.animations[0]!.start_seconds = 0.9;
  assert.throws(() => parse('analysis', a), /reversed timestamps/);
  a.animations[0]!.start_seconds = 0; a.animations[0]!.basis = 'unknown';
  assert.throws(() => parse('analysis', a), /unknown times must be null/);
  a.animations[0]!.basis = 'measured'; a.motion_parameters[0]!.basis = 'unknown';
  assert.throws(() => parse('analysis', a), /basis\/value mismatch/);
});

test('page/specification inspection is not a measured frame comparison', () => {
  const e = evaluation(); e.comparison_type = 'specification_only';
  assert.throws(() => parse('evaluation', e), /measured metrics require direct_frames/);
  e.metrics[0]!.basis = 'estimated';
  assert.equal(parse('evaluation', e).comparison_type, 'specification_only');
  e.comparison_type = 'direct_frames'; e.evidence = [{ ...frame, frame: null }];
  assert.throws(() => parse('evaluation', e), /requires frame evidence/);
});

test('metric pass is derived from nonnegative error and positive threshold', () => {
  const e = evaluation(); e.metrics[0]!.pass = false;
  assert.throws(() => parse('evaluation', e), /pass\/value\/threshold mismatch/);
  e.metrics[0]!.pass = true; e.metrics[0]!.threshold = 0;
  assert.throws(() => parse('evaluation', e), /threshold/);
  e.metrics[0]!.threshold = 3; e.metrics[0]!.value = -1;
  assert.throws(() => parse('evaluation', e), /nonnegative/);
  e.metrics[0]!.basis = 'unknown'; e.metrics[0]!.value = null; e.metrics[0]!.pass = null;
  assert.equal(parse('evaluation', e).metrics[0]!.value, null);
});

test('one metric per axis prevents contradictory or selectively repeated comparisons', () => {
  const e = evaluation();
  e.metrics.push({ ...e.metrics[0]!, id: 'position-second' });
  assert.throws(() => parse('evaluation', e), /metric axes: duplicate ID/);
});

test('subjective scores require a named reviewer, reason and actual frame references', () => {
  const e = evaluation(); e.qualitative_findings[0]!.score = 4;
  assert.throws(() => parse('evaluation', e), /score requires frame evidence and reviewer/);
  e.qualitative_findings[0]!.reviewer = 'human'; e.qualitative_findings[0]!.frame_evidence_ids = ['ev-frame'];
  assert.equal(parse('evaluation', e).qualitative_findings[0]!.score, 4);
  e.qualitative_findings[0]!.reason = '';
  assert.throws(() => parse('evaluation', e), /fewer than 1 characters/);
});

test('unsafe evidence paths cannot be offered for handoff', () => {
  for (const path of ['/etc/passwd', '../private', 'frames/../../x', 'C:\\secrets', 'frames//one.png', './frames/a', 'a\0b']) {
    assert.equal(safeRelativePath(path), false, path);
    const e = evaluation(); e.evidence = [{ ...frame, path }];
    assert.throws(() => parse('evaluation', e), /unsafe path/);
  }
  assert.equal(safeRelativePath('frames/scene-01.png'), true);
});

test('unavailable comparison requires honest empty measurements and explanation', () => {
  const e = evaluation(); e.comparison_type = 'unavailable';
  assert.throws(() => parse('evaluation', e), /must not invent/);
  e.metrics = []; e.evidence = [];
  assert.equal(parse('evaluation', e).comparison_type, 'unavailable');
  e.limitations = [];
  assert.throws(() => parse('evaluation', e), /needs limitations/);
});
