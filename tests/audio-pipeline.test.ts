import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadPlan} from '../src/plan.ts';
import type {Plan} from '../src/plan.ts';
import {
  sliceScriptForNarration,
  synthesizeLongFormAudio,
  checkSubtitleSync,
  calculateBgmDucking,
  checkAudioLoudness,
  verifyNarrationLink,
} from '../src/audio-pipeline.ts';
import {MockConnection, ConnError} from '../src/connections.ts';
import {Budget} from '../src/budget.ts';
import type {NarrationMetadata} from '../src/narration.ts';

// 10分〜20分の長尺台本を模擬（15分 = 900秒）
function makeLongFormPlan(totalMinutes = 15): Plan {
  const numScenes = 10;
  const secondsPerScene = (totalMinutes * 60) / numScenes; // 90秒/シーン
  const cuesPerScene = 3;
  const secondsPerCue = secondsPerScene / cuesPerScene; // 30秒/cue

  return loadPlan({
    schema: 2,
    id: 'long-form-superstar',
    title: 'なぜ2位ではダメなのか？【スーパースター経済学】',
    version: 2,
    sources: [],
    scenes: Array.from({length: numScenes}, (_, i) => ({
      title: `章${i + 1}`,
      role: i === 0 ? 'hook' : i === 9 ? 'reflection' : 'body',
      chapter: `章${i + 1}`,
      seconds: secondsPerScene,
      cues: Array.from({length: cuesPerScene}, (_, j) => ({
        seconds: secondsPerCue,
        text: `シーン${i + 1}のキュー${j + 1}の解説ナレーション。長尺のドキュメンタリー音声です。`,
      })),
      diagram: {
        type: 'compare',
        left: '1位',
        right: '2位',
        leftItems: ['市場独占', '指数関数的報酬'],
        rightItems: ['知名度不足', '生存競争'],
      },
      sources: [],
      narration: i === 9 ? '【本人の考察：未入力】' : `シーン${i + 1}のナレーション全体テキスト。`,
    })),
  });
}

test('台本のスライス分割: シーンとcue単位に正しく分解される', () => {
  const plan = makeLongFormPlan(15);
  const slices = sliceScriptForNarration(plan);

  assert.equal(slices.length, 30); // 10シーン * 3cue
  assert.equal(slices[0].sceneIndex, 0);
  assert.equal(slices[0].cueIndex, 0);
  assert.equal(slices[0].expectedDurationSec, 30);
  assert.equal(slices[29].sceneIndex, 9);
  assert.equal(slices[29].cueIndex, 2);
});

test('長尺ナレーションの合成と予算管理: 正常系完走と使用量・試行記録', async () => {
  const plan = makeLongFormPlan(15);
  const slices = sliceScriptForNarration(plan);

  // 模擬音声接続
  const mockConn = new MockConnection<any, {audioPath: string; durationSec: number}>(
    'audio',
    'mock-tts',
    'mock-voice',
    {audioPath: 'mock/path/audio.wav', durationSec: 30}
  );

  const budget = new Budget(1.0); // 1.0 USD上限
  const res = await synthesizeLongFormAudio(slices, mockConn, budget, 0.01);

  assert.equal(res.slices.length, 30);
  assert.equal(res.totalDurationSec, 900); // 30 * 30秒 = 900秒 (15分)
  assert.equal(res.usage.length, 30);
  assert.equal(res.attempts.length, 30);
  assert.ok(res.attempts.every(a => a.outcome === 'success' && a.charge === 'confirmed'));
});

test('予算上限超過時の安全な停止: 上限を超える試行は拒否される', async () => {
  const plan = makeLongFormPlan(15);
  const slices = sliceScriptForNarration(plan);

  const mockConn = new MockConnection<any, {audioPath: string; durationSec: number}>(
    'audio',
    'mock-tts',
    'mock-voice',
    {audioPath: 'mock/path/audio.wav', durationSec: 30}
  );

  const budget = new Budget(0.005); // 上限0.005 USD（見積り0.01 USDを下回るため初回で拒否）
  await assert.rejects(
    async () => {
      await synthesizeLongFormAudio(slices, mockConn, budget, 0.01);
    },
    /上限/
  );
});

test('字幕同期検査: 許容誤差内の同期とドリフト超過の検出', () => {
  const plan = makeLongFormPlan(10); // 10分 = 600秒 (30スライス * 20秒)
  const slices = sliceScriptForNarration(plan);

  // 1. 完全同期
  slices.forEach(s => {
    s.actualDurationSec = s.expectedDurationSec;
  });
  const check1 = checkSubtitleSync(plan, slices);
  assert.equal(check1.ok, true);
  assert.equal(check1.driftSec, 0);
  assert.equal(check1.maxDriftSec, 0);

  // 2. 微小な誤差（0.2秒）は許容（toleranceSec=0.5）
  slices[0].actualDurationSec = slices[0].expectedDurationSec + 0.2;
  slices[1].actualDurationSec = slices[1].expectedDurationSec - 0.2;
  const check2 = checkSubtitleSync(plan, slices, 0.5);
  assert.equal(check2.ok, true);

  // 3. 累積ドリフトが許容超過（1.5秒ズレ）
  slices[2].actualDurationSec = slices[2].expectedDurationSec + 1.5;
  const check3 = checkSubtitleSync(plan, slices, 0.5);
  assert.equal(check3.ok, false);
  assert.ok(check3.errors.length > 0);
  assert.match(check3.errors[0], /同期ずれ超過/);
});

test('BGMダッキング計算: ナレーション発話区間と音量設定', () => {
  const plan = makeLongFormPlan(10);
  const slices = sliceScriptForNarration(plan).slice(0, 2); // 2スライスだけ検証
  slices[0].actualDurationSec = 30;
  slices[1].actualDurationSec = 30;

  const ducking = calculateBgmDucking(slices, -18, -28);
  assert.equal(ducking.bgmVolumeDb, -18);
  assert.equal(ducking.duckedVolumeDb, -28);
  assert.equal(ducking.duckRangeSec.length, 2);
  assert.deepEqual(ducking.duckRangeSec[0], {start: 0, end: 30});
  assert.deepEqual(ducking.duckRangeSec[1], {start: 30, end: 60});
});

test('音量検査: YouTube規格（-14 LUFS ± 1.0, True Peak <= -1.0 dBFS）の判定', () => {
  // 合格例
  const ok = checkAudioLoudness(-14.2, -1.5);
  assert.equal(ok.passed, true);

  // LUFS小さすぎ（音が小さすぎる）
  const tooQuiet = checkAudioLoudness(-16.5, -3.0);
  assert.equal(tooQuiet.passed, false);

  // LUFS大きすぎ（音が大きすぎる）
  const tooLoud = checkAudioLoudness(-12.0, -0.5);
  assert.equal(tooLoud.passed, false);

  // ピークがクリッピング超過
  const peakClipped = checkAudioLoudness(-14.0, -0.2);
  assert.equal(peakClipped.passed, false);
});

test('人の試聴評価メタデータ（T125）の整合性確認', () => {
  const metadata: NarrationMetadata = {
    schema: 1,
    planId: 'plan-123',
    scriptHash: 'hash-abc',
    audioPath: 'outputs/audio.wav',
    durationSec: 600,
    profile: {
      engine: 'mock',
      voiceId: 'calm-male',
      speedCharsPerSec: 5.5,
      pitch: 'low',
      pauseSec: {comma: 0.3, period: 0.6, paragraph: 1.0},
    },
    evaluations: [
      {
        voiceId: 'calm-male',
        naturalness: 5,
        pronunciation: 5,
        documentaryFit: 5,
        clarity: 4,
        reviewer: 'テスト利用者',
        reviewedAt: '2026-10-13T12:00:00Z',
      },
    ],
  };

  // 一致
  const valid = verifyNarrationLink('plan-123', 'hash-abc', metadata);
  assert.equal(valid.linked, true);
  assert.equal(valid.hasHumanReview, true);

  // ハッシュ不一致
  const mismatch = verifyNarrationLink('plan-123', 'hash-xyz', metadata);
  assert.equal(mismatch.linked, false);
  assert.equal(mismatch.hasHumanReview, false);

  // 評価なし
  const noEval: NarrationMetadata = {...metadata, evaluations: []};
  const validNoEval = verifyNarrationLink('plan-123', 'hash-abc', noEval);
  assert.equal(validNoEval.linked, true);
  assert.equal(validNoEval.hasHumanReview, false);
});

// T127追加修正（T120再監査）: 測れていない音声長を同期合格にしない
test('字幕同期検査: 音声長の欠測・NaN・負値は同期ずれ0として合格させない', () => {
  const plan = makeLongFormPlan(10);
  for (const bad of [Number.NaN, undefined, -1, Number.POSITIVE_INFINITY]) {
    const slices = sliceScriptForNarration(plan);
    slices.forEach(s => {s.actualDurationSec = s.expectedDurationSec;});
    (slices[0] as any).actualDurationSec = bad;
    const r = checkSubtitleSync(plan, slices);
    assert.equal(r.ok, false, String(bad));
    assert.ok(r.errors.some(e => e.includes('音声長')), String(bad));
  }
});

test('長尺ナレーションの合成: 接続が非有限の音声長を返したら失敗にする', async () => {
  const slices = sliceScriptForNarration(makeLongFormPlan(10));
  const conn = new MockConnection<any, {audioPath: string; durationSec: number}>('audio', 'mock-tts', 'mock-voice', {audioPath: 'mock/path/audio.wav', durationSec: Number.NaN});
  await assert.rejects(synthesizeLongFormAudio(slices, conn, new Budget(1.0), 0.01), /音声長/);
});
