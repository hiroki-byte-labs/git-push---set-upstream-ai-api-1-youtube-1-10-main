/** T116: offline video-understanding protocol. No default/native network transport. */
import { readFileSync } from 'node:fs';
import { parse, type AnalysisContract } from './contracts.ts';

export type VideoSource = { kind: 'youtube'; url: string } |
  { kind: 'uploaded'; uri: string; mimeType: string };
export interface VideoAnalysisInput {
  artifactId: string;
  sourceId: string;
  source: VideoSource;
  rightsNote: string;
  model: string;
}
export interface VideoRequest {
  method: 'POST';
  url: string;
  headers: Record<string, string>;
  body: string;
}
/** Implementations in this task are in-memory mocks only; never pass fetch here. */
export interface MockVideoTransport {
  mode: 'mock';
  send(request: VideoRequest, signal: AbortSignal): Promise<{ status: number; text(): Promise<string> }>;
}
export interface VideoAnalysisResult { mode: 'mock'; analysis: AnalysisContract }
const schema = JSON.parse(readFileSync(new URL('./schemas/animation-analysis.schema.json', import.meta.url), 'utf8'));

function empty(input: VideoAnalysisInput, reason: string): AnalysisContract {
  return parse('analysis', {
    schema_version: '1', artifact_id: input.artifactId, source_id: input.sourceId,
    source_type: input.source.kind === 'youtube' ? 'youtube' : 'local',
    source_url: input.source.kind === 'youtube' ? input.source.url : null,
    analysis_status: 'unavailable',
    video_metadata: { width: null, height: null, fps: null, frame_count: null, duration_seconds: null, has_audio: null },
    scenes: [], objects: [], animations: [], timestamps: [], motion_parameters: [],
    visual_style: { description: null }, evidence: [], confidence: null,
    limitations: ['mock transport only; no real video analysis performed', reason],
    rights_note: input.rightsNote, lab_analysis_path: null,
  });
}

export function buildVideoRequest(input: VideoAnalysisInput, key: string): VideoRequest {
  // Validate caller-owned identity before constructing any request. Invalid inputs throw locally.
  empty(input, 'input validation');
  if (!input.model.trim() || !key.trim()) throw new Error('model and key are required');
  const source = input.source;
  if (source.kind === 'uploaded' &&
      (!/^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/files\/[A-Za-z0-9_-]+$/.test(source.uri) ||
       !/^video\/[A-Za-z0-9.+-]+$/.test(source.mimeType))) {
    throw new Error('uploaded source requires a file URI and video MIME type');
  }
  return {
    method: 'POST',
    url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent`,
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [
        { fileData: { fileUri: source.kind === 'youtube' ? source.url : source.uri,
          ...(source.kind === 'uploaded' ? { mimeType: source.mimeType } : {}) } },
        { text: `Return animation-analysis JSON for this identity: ${JSON.stringify({ artifact_id: input.artifactId, source_id: input.sourceId, source_type: source.kind === 'youtube' ? 'youtube' : 'local', source_url: source.kind === 'youtube' ? source.url : null, rights_note: input.rightsNote })}. Use null/empty arrays for unknown observations and explain limitations. Never invent evidence files or hashes.` },
      ] }],
      generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema },
    }),
  };
}

/** Accept exactly one finished, non-thought JSON candidate, then validate structure and semantics. */
export function parseVideoResponse(text: string, input: VideoAnalysisInput): AnalysisContract {
  const body = JSON.parse(text);
  if (body.promptFeedback?.blockReason || !Array.isArray(body.candidates) || body.candidates.length !== 1) throw new Error('invalid candidates');
  const candidate = body.candidates[0];
  if (candidate.finishReason !== 'STOP' || !Array.isArray(candidate.content?.parts) ||
      candidate.content.parts.length === 0 || candidate.content.parts.some((p: { text?: unknown; thought?: unknown }) => typeof p.text !== 'string' || p.thought)) throw new Error('unfinished response');
  const value = parse('analysis', JSON.parse(candidate.content.parts.map((p: { text: string }) => p.text).join('')));
  const identity = empty(input, 'identity validation');
  for (const field of ['artifact_id', 'source_id', 'source_type', 'source_url', 'rights_note'] as const) {
    if (value[field] !== identity[field]) throw new Error('response identity mismatch');
  }
  return value;
}

/** Keys and raw errors/responses are never logged, persisted, or returned. No retries. */
export async function analyzeVideo(input: VideoAnalysisInput, options: {
  transport: MockVideoTransport;
  env?: { GEMINI_API_KEY?: string };
  timeoutMs?: number;
}): Promise<VideoAnalysisResult> {
  const unavailable = (reason: string): VideoAnalysisResult => ({ mode: 'mock', analysis: empty(input, reason) });
  const fallback = unavailable('transport unavailable');
  if (options.transport.mode !== 'mock') return unavailable('mock transport required');
  const key = (options.env ?? process.env).GEMINI_API_KEY;
  if (!key?.trim()) return unavailable('GEMINI_API_KEY is not configured');
  const timeoutMs = options.timeoutMs ?? 5000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) return unavailable('invalid timeout');
  const request = buildVideoRequest(input, key);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async (): Promise<VideoAnalysisResult> => {
        const response = await options.transport.send(request, controller.signal);
        if (response.status < 200 || response.status >= 300) return unavailable('HTTP request failed');
        const text = await response.text();
        // A transport may echo credentials even inside valid JSON. Drop the entire response.
        if (text.includes(key)) return unavailable('invalid response');
        try {
          const analysis = parseVideoResponse(text, input);
          if (JSON.stringify(analysis).includes(key)) return unavailable('invalid response');
          analysis.limitations.push('mock transport only; no real video analysis performed');
          return { mode: 'mock', analysis };
        } catch { return unavailable('invalid response'); }
      })(),
      new Promise<VideoAnalysisResult>(resolve => {
        timer = setTimeout(() => { controller.abort(); resolve(unavailable('transport timed out')); }, timeoutMs);
      }),
    ]);
  } catch { return fallback; }
  finally { clearTimeout(timer); }
}
