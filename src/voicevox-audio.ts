// T179: loopback-only VOICEVOX adapter. No paid endpoint, implicit voice adoption,
// or silent fallback to mock audio. Overlong speech is rejected, never truncated.
import {readFileSync, writeFileSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import type {AudioProvider} from './providers.ts';
import type {Plan} from './plan.ts';
import {totalSeconds} from './plan.ts';
import {buildWav} from './local-say-audio.ts';
import {ffmpegPath} from './media.ts';

export type VoicevoxRights = {speaker: number; credit: string; termsUrl: string; checkedAt: string; commercialUseAllowed: true};
export type VoicevoxOptions = {endpoint?: string; rights: VoicevoxRights; charsPerSecond?: number; pauseSeconds?: number; timeoutMs?: number; transport?: typeof fetch};
export function validateVoicevoxRights(rights: VoicevoxRights) {
  if (!rights || !Number.isInteger(rights.speaker) || rights.speaker < 0 || rights.commercialUseAllowed !== true ||
      typeof rights.credit !== 'string' || !rights.credit.trim() || !/^https:\/\/\S+$/.test(rights.termsUrl) ||
      !Number.isFinite(Date.parse(rights.checkedAt))) throw Error('VOICEVOXのspeaker・利用条件確認・クレジット記録が必要');
  return rights;
}

export function parseVoicevoxWav(buf: Buffer) {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE' || buf.readUInt32LE(4) + 8 !== buf.length) throw Error('VOICEVOX WAV: RIFF長が不正');
  let rate = 0, pcm: Buffer | undefined, hasFormat = false;
  for (let offset = 12; offset + 8 <= buf.length;) {
    const kind = buf.toString('ascii', offset, offset + 4), size = buf.readUInt32LE(offset + 4), start = offset + 8;
    if (start + size > buf.length) throw Error('VOICEVOX WAV: チャンク切断');
    if (kind === 'fmt ') {
      if (hasFormat || size < 16 || buf.readUInt16LE(start) !== 1 || buf.readUInt16LE(start + 2) !== 1 || buf.readUInt16LE(start + 14) !== 16) throw Error('VOICEVOX WAV: mono PCM16が必要');
      rate = buf.readUInt32LE(start + 4);
      if (![24000, 48000].includes(rate) || buf.readUInt16LE(start + 12) !== 2 || buf.readUInt32LE(start + 8) !== rate * 2) throw Error('VOICEVOX WAV: sample rate/format不正');
      hasFormat = true;
    } else if (kind === 'data') {
      if (pcm) throw Error('VOICEVOX WAV: data重複');
      pcm = buf.subarray(start, start + size);
    }
    offset = start + size + size % 2;
  }
  if (!hasFormat || !pcm?.length || pcm.length % 2) throw Error('VOICEVOX WAV: PCM欠測');
  let sum = 0, peak = 0, clipping = 0;
  for (let i = 0; i < pcm.length; i += 2) {
    const sample = pcm.readInt16LE(i), value = sample / 32768;
    sum += value * value; peak = Math.max(peak, Math.abs(value));
    if (sample === -32768 || sample === 32767) clipping++;
  }
  const rms = Math.sqrt(sum / (pcm.length / 2));
  if (rms < 0.0001 || clipping) throw Error('VOICEVOX WAV: 無音またはクリッピング');
  return {sampleRate: rate, pcm, seconds: pcm.length / 2 / rate, rms, peak, clipping};
}

export function measureVoicevoxLoudness(path: string) {
  const result = spawnSync(ffmpegPath(), ['-hide_banner', '-nostdin', '-i', path, '-af', 'loudnorm=I=-18:TP=-1:LRA=11:print_format=json', '-f', 'null', '-'],
    {encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024});
  const json = result.stderr?.match(/\{\s*"input_i"[\s\S]*?\}/)?.[0];
  if (result.status !== 0 || !json) throw Error('VOICEVOX: 独立LUFS測定失敗');
  const data = JSON.parse(json), lufs = Number(data.input_i), truePeakDb = Number(data.input_tp);
  if (!Number.isFinite(lufs) || !Number.isFinite(truePeakDb)) throw Error('VOICEVOX: LUFS/True Peak欠測');
  return {lufs, truePeakDb};
}

export class VoicevoxAudio implements AudioProvider {
  kind = 'local.voicevox';
  private endpoint: string;
  private options: VoicevoxOptions;
  constructor(options: VoicevoxOptions) {
    validateVoicevoxRights(options.rights);
    const endpoint = new URL(options.endpoint ?? 'http://127.0.0.1:50021');
    if (endpoint.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(endpoint.hostname) || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash) throw Error('VOICEVOXは数値loopbackのHTTPエンジンのみ');
    const rate = options.charsPerSecond ?? 5.5, pause = options.pauseSeconds ?? 0.4, timeout = options.timeoutMs ?? 30000;
    if (!Number.isFinite(rate) || rate < 5.2 || rate > 5.8 || !Number.isFinite(pause) || pause < 0.3 || pause > 0.5 || !Number.isFinite(timeout) || timeout <= 0 || timeout > 120000) throw Error('VOICEVOX話速/ポーズ/timeoutが不正');
    this.endpoint = endpoint.origin; this.options = options;
  }
  private async request(route: string, params: Record<string, string>, body?: unknown) {
    const url = new URL(route, this.endpoint);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    try {
      const response = await (this.options.transport ?? fetch)(url, {method: 'POST', redirect: 'error',
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 30000),
        headers: body ? {'Content-Type': 'application/json'} : undefined, body: body ? JSON.stringify(body) : undefined});
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      return response;
    } catch { throw Error('VOICEVOXローカルエンジンに接続/処理できません（起動・speaker・timeoutを確認）'); }
  }
  async synthesize(text: string) {
    if (!text.trim() || [...text].length > 500) throw Error('VOICEVOXの入力は1〜500字');
    const params = {speaker: String(this.options.rights.speaker)};
    const query = await (await this.request('/audio_query', {...params, text})).json() as Record<string, unknown>;
    if (!query || !Array.isArray(query.accent_phrases) || !query.accent_phrases.length) throw Error('VOICEVOX query欠測');
    const target = this.options.charsPerSecond ?? 5.5;
    let scale = 1;
    for (let attempt = 0; attempt < 3; attempt++) {
      Object.assign(query, {speedScale: scale, outputSamplingRate: 24000, outputStereo: false,
        prePhonemeLength: 0.05, postPhonemeLength: this.options.pauseSeconds ?? 0.4,
        pauseLength: this.options.pauseSeconds ?? 0.4, pauseLengthScale: 1});
      const response = await this.request('/synthesis', params, query);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > 24000 * 2 * 180 + 4096) throw Error('VOICEVOX応答が長すぎる');
      const wav = parseVoicevoxWav(buffer);
      if (wav.sampleRate !== 24000) throw Error('VOICEVOX応答のsample rateが要求と不一致');
      const actualRate = [...text].length / wav.seconds;
      if (actualRate >= 5.2 && actualRate <= 5.8) return {buffer, ...wav, actualRate, speedScale: scale};
      scale *= target / actualRate;
      if (!Number.isFinite(scale) || scale < 0.5 || scale > 2) break;
    }
    throw Error('VOICEVOX実測話速が5.2〜5.8字/秒に収まりません（本文/設定を見直す）');
  }
  async create(plan: Plan, path: string): Promise<void> {
    const pcm = Buffer.alloc(Math.round(totalSeconds(plan) * 24000) * 2);
    const slices: {scene: number; cue: number; actualSeconds: number; actualRate: number; startSeconds: number; textSha256: string}[] = [];
    let offset = 0;
    for (const [sceneIndex, scene] of plan.scenes.entries()) {
      for (const [cueIndex, cue] of scene.cues.entries()) {
        const result = await this.synthesize(cue.text);
        const samples = Math.round(cue.seconds * 24000);
        if (result.pcm.length > samples * 2) throw Error(`VOICEVOX発話がcueを超過（scene ${sceneIndex + 1}/cue ${cueIndex + 1}）。字幕/尺を調整する。切り詰めない`);
        result.pcm.copy(pcm, offset * 2);
        slices.push({scene: sceneIndex + 1, cue: cueIndex + 1, actualSeconds: result.seconds, actualRate: result.actualRate,
          startSeconds: offset / 24000, textSha256: createHash('sha256').update(cue.text).digest('hex')});
        offset += samples;
      }
    }
    writeFileSync(path, buildWav(pcm));
    const stats = parseVoicevoxWav(readFileSync(path)), loudness = measureVoicevoxLoudness(path);
    const ok = loudness.lufs >= -30 && loudness.lufs <= -10 && loudness.truePeakDb <= -1;
    writeFileSync(join(dirname(path), 'voicevox-report.json'), JSON.stringify({schema: 1, provider: this.kind,
      planHash: createHash('sha256').update(JSON.stringify(plan)).digest('hex'), rights: this.options.rights,
      transport: this.options.transport ? 'injected-transport' : 'live-loopback',
      rms: stats.rms, peak: stats.peak, clipping: stats.clipping, ...loudness, slices, ok, voiceEvaluation: 'pending-human',
      note: 'RMS/peakは実PCM、LUFS/true peakはFFmpeg測定。ノイズ感・自然さ・低音の適性は本人試聴待ち。'}, null, 2));
    if (!ok) throw Error('VOICEVOX音量基準外（voicevox-report.jsonを確認）');
    writeFileSync(join(dirname(path), 'voicevox-attribution.txt'), this.options.rights.credit + '\n');
  }
}

export function voicevoxFromEnvironment() {
  const file = process.env.VOICEVOX_RIGHTS_FILE;
  if (!file) throw Error('VOICEVOX_RIGHTS_FILEに音声ライブラリの利用条件・speaker・credit記録を指定する');
  return new VoicevoxAudio({rights: JSON.parse(readFileSync(file, 'utf8')), endpoint: process.env.VOICEVOX_ENDPOINT});
}
