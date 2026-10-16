import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, type AnalysisContract } from './contracts.ts';
import { analyzeVideo, buildVideoRequest, parseVideoResponse, type VideoAnalysisInput, type MockVideoTransport } from './gemini-video.ts';

// All credentials and responses here are synthetic; no environment credentials are read.
const key = 'synthetic-test-credential';
const env = { GEMINI_API_KEY: key };
const input: VideoAnalysisInput = {
  artifactId: 'analysis-mock', sourceId: 'source-mock', model: 'mock-video-model',
  rightsNote: 'Synthetic mock only; no video fetched',
  source: { kind: 'youtube', url: 'https://www.youtube.com/watch?v=mock' },
};
function fixture(i = input): AnalysisContract {
  return {
    schema_version: '1', artifact_id: i.artifactId, source_id: i.sourceId,
    source_type: i.source.kind === 'youtube' ? 'youtube' : 'local',
    source_url: i.source.kind === 'youtube' ? i.source.url : null,
    analysis_status: 'partial',
    video_metadata: { width: null, height: null, fps: null, frame_count: null, duration_seconds: null, has_audio: null },
    scenes: [{ id: 'scene', start_frame: null, end_frame: null, description: 'Mock rectangle' }],
    objects: [], animations: [], timestamps: [], motion_parameters: [], visual_style: { description: null },
    evidence: [], confidence: null, limitations: ['Synthetic fixture without decoded frames'],
    rights_note: i.rightsNote, lab_analysis_path: null,
  };
}
function envelope(value: unknown): string {
  const json = JSON.stringify(value);
  return JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [
    { text: json.slice(0, 30) }, { text: json.slice(30) },
  ] } }] });
}
function mock(text = envelope(fixture()), status = 200): MockVideoTransport {
  return { mode: 'mock', async send() { return { status, async text() { return text; } }; } };
}
function unavailable(result: Awaited<ReturnType<typeof analyzeVideo>>) {
  assert.equal(result.mode, 'mock');
  const a = parse('analysis', result.analysis);
  assert.equal(a.analysis_status, 'unavailable');
  assert.ok(Object.values(a.video_metadata).every(v => v === null));
  for (const field of ['scenes', 'objects', 'animations', 'timestamps', 'motion_parameters', 'evidence'] as const) assert.deepEqual(a[field], []);
  assert.equal(a.confidence, null);
  assert.equal(a.visual_style.description, null);
  assert.equal(a.lab_analysis_path, null);
  assert.ok(a.limitations.length > 0);
  assert.ok(!JSON.stringify(result).includes(key));
}

test('YouTube request sends key in header only and embeds the actual analysis schema', async () => {
  let calls = 0;
  const result = await analyzeVideo(input, { env, transport: { mode: 'mock', async send(request) {
    calls++;
    assert.equal(request.method, 'POST');
    assert.equal(request.headers['x-goog-api-key'], key);
    assert.ok(!request.url.includes(key));
    assert.ok(!request.body.includes(key));
    assert.match(request.url, /models\/mock-video-model:generateContent$/);
    const body = JSON.parse(request.body);
    assert.equal(body.contents[0].parts[0].fileData.fileUri, input.source.kind === 'youtube' && input.source.url);
    assert.equal(body.generationConfig.responseMimeType, 'application/json');
    assert.ok(body.generationConfig.responseJsonSchema.required.includes('analysis_status'));
    assert.equal(body.generationConfig.responseJsonSchema.additionalProperties, false);
    return { status: 200, async text() { return envelope(fixture()); } };
  } } });
  assert.equal(calls, 1);
  assert.equal(parse('analysis', result.analysis).analysis_status, 'partial');
  assert.ok(result.analysis.limitations.some(s => s.includes('mock transport only')));
});

test('already uploaded video URI builds fileData without uploading or reading files', async () => {
  const uploaded: VideoAnalysisInput = { ...input, source: { kind: 'uploaded', uri: 'https://generativelanguage.googleapis.com/v1beta/files/mock-file', mimeType: 'video/mp4' } };
  const request = buildVideoRequest(uploaded, key);
  assert.deepEqual(JSON.parse(request.body).contents[0].parts[0].fileData,
    { fileUri: uploaded.source.kind === 'uploaded' && uploaded.source.uri, mimeType: 'video/mp4' });
  const result = await analyzeVideo(uploaded, { env, transport: mock(envelope(fixture(uploaded))) });
  assert.equal(result.analysis.source_type, 'local');
  assert.equal(result.analysis.source_url, null);
  parse('analysis', result.analysis);
});

test('missing/empty keys stop before calling the mock', async () => {
  for (const env of [{}, { GEMINI_API_KEY: '' }, { GEMINI_API_KEY: '  ' }]) {
    unavailable(await analyzeVideo(input, { env, transport: { mode: 'mock', async send() { assert.fail('must not send'); } } }));
  }
});

test('transport exceptions are sanitized and never retried', async () => {
  let calls = 0;
  unavailable(await analyzeVideo(input, { env, transport: { mode: 'mock', async send() { calls++; throw Error(key); } } }));
  assert.equal(calls, 1);
});

test('HTTP auth, rate limit and server failures stop without parsing raw bodies', async () => {
  for (const status of [401, 403, 429, 500, 503]) {
    unavailable(await analyzeVideo(input, { env, transport: { mode: 'mock', async send() {
      return { status, async text() { assert.fail('do not read error body'); } };
    } } }));
  }
});

test('invalid JSON, missing fields, extra fields and bad semantics become unavailable', async () => {
  const dangling = fixture(); dangling.objects = [{ id: 'o', scene_id: 'absent', description: null }];
  const invalid = [null, {}, { ...fixture(), confidence: 2 }, { ...fixture(), invented: true }, dangling,
    { ...fixture(), analysis_status: 'complete' }, { ...fixture(), artifact_id: 'other' },
    { ...fixture(), source_url: 'https://youtu.be/other' }, { ...fixture(), rights_note: 'changed' }];
  for (const value of invalid) unavailable(await analyzeVideo(input, { env, transport: mock(envelope(value)) }));
  for (const text of ['not json', 'null', '{}', '{"candidates":null}']) unavailable(await analyzeVideo(input, { env, transport: mock(text) }));
});

test('blocked, truncated, thought and empty candidates become unavailable', async () => {
  for (const body of [
    { promptFeedback: { blockReason: 'SAFETY' } },
    { candidates: [] },
    { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: JSON.stringify(fixture()) }] } }] },
    { candidates: [{ finishReason: 'STOP', content: { parts: [] } }] },
    { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(fixture()), thought: true }] } }] },
    { candidates: [{ finishReason: 'STOP', content: { parts: [{ fileData: {} }] } }] },
  ]) unavailable(await analyzeVideo(input, { env, transport: mock(JSON.stringify(body)) }));
});

test('response body read failure and credential echo never escape', async () => {
  unavailable(await analyzeVideo(input, { env, transport: { mode: 'mock', async send() { return { status: 200, async text() { throw Error(key); } }; } } }));
  const echo = fixture(); echo.limitations.push(key);
  unavailable(await analyzeVideo(input, { env, transport: mock(envelope(echo)) }));
  const escaped = envelope(echo).replaceAll(key, '\\u0073' + key.slice(1));
  unavailable(await analyzeVideo(input, { env, transport: mock(escaped) }));
});

test('deadline bounds an unresponsive transport and response reader, aborting both', async () => {
  for (const stallBody of [false, true]) {
    let signal: AbortSignal | undefined;
    unavailable(await analyzeVideo(input, { env, timeoutMs: 5, transport: { mode: 'mock', async send(_req, s) {
      signal = s;
      if (!stallBody) return new Promise(() => {});
      return { status: 200, text: () => new Promise(() => {}) };
    } } }));
    assert.equal(signal?.aborted, true);
  }
});

test('non-mock transports and invalid deadlines are rejected without dispatch', async () => {
  const transport = { mode: 'real', async send() { assert.fail('must not send'); } } as unknown as MockVideoTransport;
  unavailable(await analyzeVideo(input, { env, transport }));
  for (const timeoutMs of [0, -1, NaN, Infinity, 2_147_483_648]) unavailable(await analyzeVideo(input, { env, timeoutMs, transport: mock() }));
});

test('invalid caller identity and uploaded source fail locally before dispatch', () => {
  assert.throws(() => buildVideoRequest({ ...input, source: { kind: 'youtube', url: 'http://invalid' } }, key));
  assert.throws(() => buildVideoRequest({ ...input, artifactId: '' }, key));
  assert.throws(() => buildVideoRequest({ ...input, source: { kind: 'uploaded', uri: '/private/local.mp4', mimeType: 'video/mp4' } }, key));
  assert.throws(() => buildVideoRequest({ ...input, source: { kind: 'uploaded', uri: 'https://generativelanguage.googleapis.com/v1beta/files/mock', mimeType: 'text/plain' } }, key));
});

test('parser preserves contract data and rejects invented evidence paths', () => {
  assert.deepEqual(parseVideoResponse(envelope(fixture()), input), fixture());
  const a = fixture();
  a.evidence = [{ id: 'e', path: '../secret', sha256: 'a'.repeat(64), frame: null, description: 'mock' }];
  assert.throws(() => parseVideoResponse(envelope(a), input), /unsafe path/);
});

test('complete mock response preserves all schema fields; unavailable mock invents no observations', async () => {
  const a = fixture();
  a.analysis_status = 'complete';
  a.video_metadata = { width: 320, height: 180, fps: 30, frame_count: 30, duration_seconds: 1, has_audio: false };
  a.scenes[0]!.start_frame = 0; a.scenes[0]!.end_frame = 29;
  a.evidence = [{ id: 'e', path: 'mock/frame.png', sha256: 'a'.repeat(64), frame: 0, description: 'Synthetic evidence reference only' }];
  const result = await analyzeVideo(input, { env, transport: mock(envelope(a)) });
  assert.equal(result.analysis.analysis_status, 'complete');
  assert.deepEqual(result.analysis.evidence, a.evidence);
  parse('analysis', result.analysis);
  const missing = fixture(); missing.analysis_status = 'unavailable'; missing.scenes = [];
  unavailable(await analyzeVideo(input, { env, transport: mock(envelope(missing)) }));
});
