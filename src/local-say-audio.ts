// macOS標準音声（sayコマンド）を活用した無課金ローカル実ナレーション音声合成プロバイダー（T170）。
// 有料API契約（T027）を待たずに、macOS標準の日本語音声（Kyoko等）を用いて
// スライス単位の実発話WAV音声を生成し、制作パイプライン（sample / produce）へオプション接続する。

import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import type {Plan} from './plan.ts';
import {totalSeconds} from './plan.ts';
import type {AudioProvider} from './providers.ts';
import type {AudioSlice} from './audio-pipeline.ts';

export const RATE = 24000;
export const DEFAULT_VOICE = 'Kyoko';

export type SayAudioOptions = {
  voice?: string;
  rateWpm?: number;
  padSilence?: boolean;
};

export type SynthesizedSlice = AudioSlice & {
  actualDurationSec: number;
  pcmData: Buffer;
  wavBuffer: Buffer;
};

/**
 * 現在の環境で macOS say コマンドが利用可能か判定する。
 */
export function isSayAvailable(): boolean {
  if (process.platform !== 'darwin') return false;
  try {
    const r = spawnSync('which', ['say'], {encoding: 'utf8', timeout: 3000});
    return r.status === 0;
  } catch {
    return false;
  }
}

/**
 * 利用可能な日本語音声名一覧を取得する。
 */
export function getAvailableJapaneseVoices(): string[] {
  if (!isSayAvailable()) return [];
  try {
    const r = spawnSync('say', ['-v', '?'], {encoding: 'utf8', timeout: 5000});
    if (r.status !== 0) return [];
    const lines = r.stdout.split('\n');
    const jaVoices: string[] = [];
    for (const line of lines) {
      if (/ja_JP/i.test(line)) {
        const match = line.match(/^(\S+)/);
        if (match) jaVoices.push(match[1]);
      }
    }
    return jaVoices;
  } catch {
    return [];
  }
}

/**
 * RIFF/WAVE バッファから PCM データ（チャンク解析）とメタデータを抽出する。
 * sayコマンドが出力する FLLR などのパディングチャンクに対応。
 */
export function extractWavPcm(buf: Buffer): {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  pcmData: Buffer;
  durationSec: number;
} {
  if (buf.length < 12 || buf.toString('utf8', 0, 4) !== 'RIFF' || buf.toString('utf8', 8, 12) !== 'WAVE') {
    throw new Error('無効なRIFF/WAVEデータです');
  }

  let offset = 12;
  let sampleRate = RATE;
  let channels = 1;
  let bitsPerSample = 16;
  let pcmData = Buffer.alloc(0);

  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString('utf8', offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    if (chunkId === 'fmt ') {
      channels = buf.readUInt16LE(offset + 10);
      sampleRate = buf.readUInt32LE(offset + 12);
      bitsPerSample = buf.readUInt16LE(offset + 22);
    } else if (chunkId === 'data') {
      const dataStart = offset + 8;
      const dataEnd = Math.min(buf.length, dataStart + chunkSize);
      pcmData = Buffer.from(buf.subarray(dataStart, dataEnd));
      break;
    }
    // チャンクサイズが奇数の場合のワードパディングを考慮
    const paddedSize = chunkSize + (chunkSize % 2);
    offset += 8 + paddedSize;
  }

  const bytesPerSample = (bitsPerSample / 8) * channels;
  const durationSec = bytesPerSample > 0 ? (pcmData.length / bytesPerSample) / sampleRate : 0;
  return {sampleRate, channels, bitsPerSample, pcmData, durationSec};
}

/**
 * 24000Hz, 16bit LE, モノラルの標準 44バイトヘッダー付き RIFF/WAVE バッファを生成する。
 */
export function buildWav(pcmData: Buffer, sampleRate = RATE): Buffer {
  const buf = Buffer.alloc(44 + pcmData.length);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + pcmData.length, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byteRate = sampleRate * 1 * (16/8)
  buf.writeUInt16LE(2, 32);  // blockAlign = 1 * (16/8)
  buf.writeUInt16LE(16, 34); // bitsPerSample = 16
  buf.write('data', 36);
  buf.writeUInt32LE(pcmData.length, 40);
  pcmData.copy(buf, 44);
  return buf;
}

/**
 * say コマンドを呼び出してテキストから実音声WAVを合成する。
 */
export function synthesizeTextWithSay(
  text: string,
  options: SayAudioOptions = {}
): {
  wavBuffer: Buffer;
  pcmData: Buffer;
  durationSec: number;
  sampleRate: number;
} {
  const voice = options.voice ?? DEFAULT_VOICE;
  const tempDir = mkdtempSync(join(tmpdir(), 'say-synth-'));
  const tempOut = join(tempDir, 'output.wav');
  const tempText = join(tempDir, 'input.txt');

  try {
    writeFileSync(tempText, text, 'utf8');
    const args = [
      '--file-format=WAVE',
      `--data-format=LEI16@${RATE}`,
      '-v', voice,
      ...(options.rateWpm ? ['-r', String(options.rateWpm)] : []),
      '-f', tempText,
      '-o', tempOut,
    ];

    const result = spawnSync('say', args, {
      encoding: 'utf8',
      timeout: 60000,
    });

    if (result.status !== 0 || !existsSync(tempOut)) {
      throw new Error(`say コマンド失敗 (${result.status}): ${result.error?.message ?? result.stderr}`);
    }

    const rawWav = readFileSync(tempOut);
    const parsed = extractWavPcm(rawWav);
    const standardWav = buildWav(parsed.pcmData, parsed.sampleRate);

    return {
      wavBuffer: standardWav,
      pcmData: parsed.pcmData,
      durationSec: parsed.durationSec,
      sampleRate: parsed.sampleRate,
    };
  } finally {
    rmSync(tempDir, {recursive: true, force: true});
  }
}

/**
 * 台本（Plan）の各シーン・cue を say コマンドで合成し、
 * 各 cue の期待秒数に合わせて連結した全体の WAV バッファを生成する。
 */
export function synthesizePlanWithSay(
  plan: Plan,
  options: SayAudioOptions = {}
): {
  audioBuffer: Buffer;
  slices: SynthesizedSlice[];
  totalDurationSec: number;
} {
  const voice = options.voice ?? DEFAULT_VOICE;
  const slices: SynthesizedSlice[] = [];
  const totalPlanSec = totalSeconds(plan);
  const totalSamples = Math.round(totalPlanSec * RATE);
  const totalPcm = Buffer.alloc(totalSamples * 2); // 16bit = 2 bytes per sample

  let sampleOffset = 0;

  for (let sIdx = 0; sIdx < plan.scenes.length; sIdx++) {
    const scene = plan.scenes[sIdx];
    for (let cIdx = 0; cIdx < scene.cues.length; cIdx++) {
      const cue = scene.cues[cIdx];
      const cueSamples = Math.round(cue.seconds * RATE);
      const cueText = cue.text.trim();

      let synthResult: {wavBuffer: Buffer; pcmData: Buffer; durationSec: number; sampleRate: number};

      if (!cueText) {
        // 空テキストの場合は無音
        const silentPcm = Buffer.alloc(cueSamples * 2);
        synthResult = {
          wavBuffer: buildWav(silentPcm),
          pcmData: silentPcm,
          durationSec: cue.seconds,
          sampleRate: RATE,
        };
      } else {
        // 発話時間が cue.seconds を大幅に超過しないよう、文字数/秒数からレートを補助計算
        const charsPerSec = [...cueText].length / Math.max(1, cue.seconds);
        let rateWpm = options.rateWpm;
        if (!rateWpm && charsPerSec > 5) {
          // 早口が必要な場合はレートを上げる（上限260）
          rateWpm = Math.min(260, Math.max(180, Math.round(charsPerSec * 40)));
        }

        synthResult = synthesizeTextWithSay(cueText, {voice, rateWpm});
      }

      slices.push({
        sceneIndex: sIdx,
        cueIndex: cIdx,
        text: cue.text,
        expectedDurationSec: cue.seconds,
        actualDurationSec: synthResult.durationSec,
        pcmData: synthResult.pcmData,
        wavBuffer: synthResult.wavBuffer,
      });

      // cue の秒数枠に収まるよう配置（発話が cue 秒数より長ければ切り詰め、短ければ末尾パディング）
      const copySamples = Math.min(synthResult.pcmData.length / 2, cueSamples);
      const targetOffset = sampleOffset * 2;
      synthResult.pcmData.copy(totalPcm, targetOffset, 0, copySamples * 2);

      sampleOffset += cueSamples;
    }
  }

  const finalWav = buildWav(totalPcm, RATE);
  return {
    audioBuffer: finalWav,
    slices,
    totalDurationSec: totalPlanSec,
  };
}

/**
 * AudioProvider 実装: macOS say コマンドを用いた実ナレーション音声生成
 */
export class LocalSayAudio implements AudioProvider {
  kind = 'local.say';
  voice: string;

  constructor(voice = DEFAULT_VOICE) {
    this.voice = voice;
  }

  async create(plan: Plan, outPath: string): Promise<void> {
    const {audioBuffer} = synthesizePlanWithSay(plan, {voice: this.voice});
    writeFileSync(outPath, audioBuffer);
  }
}
