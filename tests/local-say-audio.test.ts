// macOS標準音声（sayコマンド）を活用した無課金ローカル実ナレーション音声合成プロバイダーのテスト（T170）
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadPlan, totalSeconds} from '../src/plan.ts';
import {parseSampleArgs} from '../src/commands/sample.ts';
import {sliceScriptForNarration, checkSubtitleSync, calculateBgmDucking} from '../src/audio-pipeline.ts';
import {
  RATE,
  isSayAvailable,
  getAvailableJapaneseVoices,
  extractWavPcm,
  buildWav,
  synthesizeTextWithSay,
  synthesizePlanWithSay,
  LocalSayAudio,
} from '../src/local-say-audio.ts';

test('isSayAvailable と getAvailableJapaneseVoices の動作確認', () => {
  if (process.platform === 'darwin') {
    assert.equal(isSayAvailable(), true, 'macOS上ではsayコマンドが利用可能');
    const voices = getAvailableJapaneseVoices();
    assert.ok(voices.length > 0, '利用可能な日本語音声が1つ以上取得できる');
    assert.ok(voices.includes('Kyoko'), '標準のKyoko音声が含まれる');
  } else {
    assert.equal(isSayAvailable(), false, '非macOSではfalse');
  }
});

test('extractWavPcm と buildWav の往復整合性検証', () => {
  // 1秒間の合成PCMデータ（24000サンプル, 48000バイト）を作成
  const pcmIn = Buffer.alloc(RATE * 2);
  for (let i = 0; i < RATE; i++) {
    const val = Math.round(16000 * Math.sin(2 * Math.PI * 440 * i / RATE));
    pcmIn.writeInt16LE(val, i * 2);
  }

  const wavBuf = buildWav(pcmIn, RATE);
  assert.equal(wavBuf.toString('utf8', 0, 4), 'RIFF');
  assert.equal(wavBuf.toString('utf8', 8, 12), 'WAVE');
  assert.equal(wavBuf.length, 44 + pcmIn.length);

  const parsed = extractWavPcm(wavBuf);
  assert.equal(parsed.sampleRate, RATE);
  assert.equal(parsed.channels, 1);
  assert.equal(parsed.bitsPerSample, 16);
  assert.equal(parsed.durationSec, 1.0);
  assert.deepEqual(parsed.pcmData, pcmIn);
});

test('synthesizeTextWithSay: 日本語テキストから実音声WAVを合成しPCM・秒数を取得', () => {
  if (!isSayAvailable()) return;

  const text = '知的好奇心を刺激するドキュメンタリーへようこそ。';
  const res = synthesizeTextWithSay(text, {voice: 'Kyoko'});

  assert.ok(res.wavBuffer.length > 44, 'WAVファイルが生成されている');
  assert.ok(res.pcmData.length > 0, 'PCMデータが存在する');
  assert.ok(res.durationSec > 1.5 && res.durationSec < 6.0, `妥当な発話秒数である（実測: ${res.durationSec}s）`);
  assert.equal(res.sampleRate, RATE);

  // PCMデータに非ゼロの音声波形が存在し、クリッピングしていないことを検証
  let peak = 0;
  for (let i = 0; i < res.pcmData.length; i += 2) {
    peak = Math.max(peak, Math.abs(res.pcmData.readInt16LE(i)));
  }
  assert.ok(peak > 1000, `音声ピークが存在する（実測: ${peak}）`);
  assert.ok(peak < 32767, '音声がクリッピングしていない');
});

test('synthesizePlanWithSay と LocalSayAudio: 台本から全体のaudio.wavを生成し所要時間・冒頭音声を検証', async () => {
  if (!isSayAvailable()) return;

  const plan = loadPlan(JSON.parse(readFileSync('fixtures/sample-v2.json', 'utf8')));
  const expectedTotalSec = totalSeconds(plan);

  const {audioBuffer, slices, totalDurationSec} = synthesizePlanWithSay(plan, {voice: 'Kyoko'});

  assert.equal(totalDurationSec, expectedTotalSec, '全体の秒数がtotalSeconds(plan)と完全に一致する');
  const expectedSamples = expectedTotalSec * RATE;
  assert.equal(audioBuffer.length, 44 + expectedSamples * 2, 'WAVサイズが期待サンプル数と完全に一致する');

  // スライス分割・字幕同期・ダッキング計算との連携検証
  const rawSlices = sliceScriptForNarration(plan);
  assert.equal(slices.length, rawSlices.length, 'スライス数がcue数と一致');

  // 各スライスの実測時間が記録されていること
  for (const sl of slices) {
    assert.ok(sl.actualDurationSec > 0, `スライスの実発話秒数が記録されている（${sl.text}: ${sl.actualDurationSec}s）`);
    assert.ok(sl.pcmData.length > 0);
  }

  // 字幕同期判定（実音声時間でのドリフト検査）
  const sync = checkSubtitleSync(plan, slices, 5.0); // 許容範囲内でのドリフト確認
  assert.equal(sync.totalExpectedDuration, expectedTotalSec);

  // BGMダッキング計算
  const ducking = calculateBgmDucking(slices);
  assert.equal(ducking.bgmVolumeDb, -18);
  assert.equal(ducking.duckedVolumeDb, -28);
  assert.ok(ducking.duckRangeSec.length > 0, 'ダッキング区間が計算されている');

  // LocalSayAudio クラスによる実ファイル出力の検証
  const tmp = mkdtempSync(join(tmpdir(), 'say-provider-'));
  try {
    const outWav = join(tmp, 'audio.wav');
    const provider = new LocalSayAudio('Kyoko');
    assert.equal(provider.kind, 'local.say');
    await provider.create(plan, outWav);

    const fileBuf = readFileSync(outWav);
    assert.equal(fileBuf.length, audioBuffer.length);
    const parsed = extractWavPcm(fileBuf);
    assert.equal(parsed.durationSec, expectedTotalSec);

    // 冒頭0.7秒に音声が存在するか検証（media.tsの検査要件）
    let firstPeak = 0;
    const checkSamples = Math.min(parsed.pcmData.length / 2, 0.7 * RATE);
    for (let j = 0; j < checkSamples; j++) {
      firstPeak = Math.max(firstPeak, Math.abs(parsed.pcmData.readInt16LE(j * 2)));
    }
    assert.ok(firstPeak > 500, `冒頭0.7秒に音声が存在する（peak: ${firstPeak}）`);
  } finally {
    rmSync(tmp, {recursive: true, force: true});
  }
});

test('parseSampleArgs: --audio mock|say 引数のパースとバリデーション', () => {
  const o1 = parseSampleArgs(['--audio', 'say']);
  assert.equal(o1.audio, 'say');

  const o2 = parseSampleArgs(['--audio', 'mock']);
  assert.equal(o2.audio, 'mock');

  const o3 = parseSampleArgs([]);
  assert.equal(o3.audio, undefined);

  assert.throws(() => parseSampleArgs(['--audio', 'invalid']), /不明な引数.*--audio/);
});

test('T170 regression: valid short cue with longer real speech fails without writing a truncated WAV', async () => {
  if (!isSayAvailable()) return;
  const raw = JSON.parse(readFileSync('fixtures/sample-v2.json', 'utf8'));
  raw.scenes = [{...raw.scenes[0], seconds: 2, narration: '説明を確認しましょう。',
    cues: [{text: '私たちは問いと説明の関係を、落ち着いて丁寧に確認していきましょう。', seconds: 2}]}];
  const plan = loadPlan(raw), dir = mkdtempSync(join(tmpdir(), 'say-overflow-'));
  const original = JSON.stringify(plan);
  try {
    await assert.rejects(new LocalSayAudio().create(plan, join(dir, 'audio.wav')), /場面1.*cue1.*超過/);
    assert.equal(existsSync(join(dir, 'audio.wav')), false);
    assert.equal(JSON.stringify(plan), original, 'approved input timing must not be changed implicitly');
  } finally {rmSync(dir, {recursive: true, force: true});}
});

test('cue placement preserves all PCM and uses absolute fractional boundaries', () => {
  const raw = JSON.parse(readFileSync('fixtures/sample-v2.json', 'utf8'));
  raw.scenes = [{...raw.scenes[0], seconds: 2, narration: '音声の配置を確認します。',
    cues: [{text: 'あ', seconds: 0.50003}, {text: 'い', seconds: 0.50003}, {text: 'う', seconds: 0.99994}]}];
  const plan = loadPlan(raw);
  const speech = [1000, -2000, 3000].map((sample, i) => {
    const pcmData = Buffer.alloc([12000, 12000, 23998][i] * 2);
    for (let j = 0; j < pcmData.length; j += 2) pcmData.writeInt16LE(sample, j);
    return {pcmData, sampleRate: RATE, durationSec: pcmData.length / 2 / RATE, wavBuffer: buildWav(pcmData)};
  });
  let calls = 0;
  const result = synthesizePlanWithSay(plan, {}, () => speech[calls++]);
  assert.equal(calls, 3);
  const pcm = extractWavPcm(result.audioBuffer).pcmData;
  assert.equal(pcm.length, 2 * RATE * 2);
  for (const [i, start] of [0, 12001, 24001].entries()) assert.deepEqual(pcm.subarray(start * 2, start * 2 + speech[i].pcmData.length), speech[i].pcmData);
});
