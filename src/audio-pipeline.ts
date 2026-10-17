// 長尺ナレーション・字幕同期・音響仕上げの制作工程パイプライン（T127）。
// 接続抽象（Connection / callWithBudget）に則り、10〜20分の長尺台本を分割・合成し、
// 字幕cueとの同期検査、BGMミキシング・ダッキング計算、音量検査（LUFS/ピーク）、
// 予算・試行記録、および人の試聴評価メタデータ連携を行う。

import type {Plan} from './plan.ts';
import {totalSeconds} from './plan.ts';
import type {Connection, Usage, Attempt} from './connections.ts';
import {callWithBudget} from './connections.ts';
import {Budget} from './budget.ts';
import type {NarrationMetadata} from './narration.ts';

export type AudioSlice = {
  sceneIndex: number;
  cueIndex: number;
  text: string;
  expectedDurationSec: number;
  audioPath?: string;
  actualDurationSec?: number;
};

export type SyncCheckResult = {
  ok: boolean;
  totalExpectedDuration: number;
  totalActualDuration: number;
  driftSec: number;
  maxDriftSec: number;
  errors: string[];
};

export type DuckingProfile = {
  bgmVolumeDb: number;
  duckedVolumeDb: number;
  duckRangeSec: {start: number; end: number}[];
};

export type LoudnessResult = {
  integratedLufs: number;
  truePeakDbfs: number;
  passed: boolean;
  targetRange: {minLufs: number; maxLufs: number; maxPeakDbfs: number};
};

/**
 * 1. 台本をシーン・cue単位のスライスに分割する。
 */
export function sliceScriptForNarration(plan: Plan): AudioSlice[] {
  const slices: AudioSlice[] = [];
  plan.scenes.forEach((s, sIdx) => {
    s.cues.forEach((c, cIdx) => {
      slices.push({
        sceneIndex: sIdx,
        cueIndex: cIdx,
        text: c.text,
        expectedDurationSec: c.seconds,
      });
    });
  });
  return slices;
}

/**
 * 2. 音声スライスを合成・結合する（Connection抽象・予算・試行記録と統合）。
 * 模擬または手元の合成接続を用いて各スライスを生成し、全体の所要時間と使用量を記録する。
 */
export async function synthesizeLongFormAudio(
  slices: AudioSlice[],
  connection: Connection<AudioSlice, {audioPath: string; durationSec: number}>,
  budget: Budget,
  estimateUsdPerSlice = 0.001,
  maxAttempts = 3
): Promise<{
  slices: AudioSlice[];
  totalDurationSec: number;
  usage: Usage[];
  attempts: Attempt[];
}> {
  const usage: Usage[] = [];
  const attempts: Attempt[] = [];
  let totalDurationSec = 0;

  for (let i = 0; i < slices.length; i++) {
    const slice = slices[i];
    try {
      const res = await callWithBudget(
        connection,
        slice,
        budget,
        estimateUsdPerSlice,
        usage,
        maxAttempts,
        attempts
      );
      // 接続が測れなかった音声長（NaN・負値・無限大）を記録・合算しない（T127追加修正）。
      if (!Number.isFinite(res.durationSec) || res.durationSec < 0) throw Error(`接続が返した音声長が不正（${res.durationSec}）`);
      slice.audioPath = res.audioPath;
      slice.actualDurationSec = res.durationSec;
      totalDurationSec += res.durationSec;
    } catch (err) {
      throw new Error(`スライス[${i}] (scene ${slice.sceneIndex}, cue ${slice.cueIndex}) の合成に失敗: ${(err as Error).message}`);
    }
  }

  return {
    slices,
    totalDurationSec,
    usage,
    attempts,
  };
}

/**
 * 3. 発話時刻と字幕cueの同期を検査する。
 * 各cueおよび全体のドリフトが許容誤差（許容0.5秒）以内か確認。
 */
export function checkSubtitleSync(
  plan: Plan,
  slices: AudioSlice[],
  toleranceSec = 0.5
): SyncCheckResult {
  const errors: string[] = [];
  const totalExpected = totalSeconds(plan);
  let totalActual = 0;
  let maxDrift = 0;

  let expectedAcc = 0;
  let actualAcc = 0;

  if (slices.length !== plan.scenes.flatMap(s => s.cues).length) {
    errors.push(`スライス数 (${slices.length}) と台本のcue数 (${plan.scenes.flatMap(s => s.cues).length}) が一致しません`);
  }

  for (let i = 0; i < slices.length; i++) {
    const sl = slices[i];
    // 未測定・非有限・負の音声長は0扱いで同期合格にせず、検査の失敗にする（T127追加修正）。
    if (typeof sl.actualDurationSec !== 'number' || !Number.isFinite(sl.actualDurationSec) || sl.actualDurationSec < 0) {
      errors.push(`スライス[${i}]の音声長が未測定または不正（${sl.actualDurationSec}）`);
      continue;
    }
    const actual = sl.actualDurationSec;
    expectedAcc += sl.expectedDurationSec;
    actualAcc += actual;
    totalActual += actual;

    const drift = Math.abs(actualAcc - expectedAcc);
    if (drift > maxDrift) {
      maxDrift = drift;
    }
    if (drift > toleranceSec) {
      errors.push(`スライス[${i}]で同期ずれ超過: 期待 ${expectedAcc.toFixed(2)}s, 実績 ${actualAcc.toFixed(2)}s (差分 ${drift.toFixed(2)}s > 許容 ${toleranceSec}s)`);
    }
  }

  const finalDrift = Math.abs(totalActual - totalExpected);

  return {
    ok: errors.length === 0,
    totalExpectedDuration: totalExpected,
    totalActualDuration: totalActual,
    driftSec: finalDrift,
    maxDriftSec: maxDrift,
    errors,
  };
}

/**
 * 4. BGMダッキング計算（ナレーション発話区間中にBGMを減衰）。
 * ナレーション発話区間（ナレーション再生中）は duckedVolumeDb、思考の間やポーズ区間は bgmVolumeDb。
 */
export function calculateBgmDucking(
  slices: AudioSlice[],
  bgmVolumeDb = -18,
  duckedVolumeDb = -28
): DuckingProfile {
  let currentTime = 0;
  const duckRangeSec: {start: number; end: number}[] = [];

  for (const s of slices) {
    const dur = s.actualDurationSec ?? s.expectedDurationSec;
    if (s.text.trim().length > 0) {
      duckRangeSec.push({
        start: currentTime,
        end: currentTime + dur,
      });
    }
    currentTime += dur;
  }

  return {
    bgmVolumeDb,
    duckedVolumeDb,
    duckRangeSec,
  };
}

/**
 * 5. 音量検査（YouTube推奨規格: -14 LUFS ± 1.0, True Peak <= -1.0 dBFS）
 */
export const TARGET_LOUDNESS = {
  minLufs: -15.0,
  maxLufs: -13.0,
  maxPeakDbfs: -1.0,
};

export function checkAudioLoudness(
  integratedLufs: number,
  truePeakDbfs: number,
  targets = TARGET_LOUDNESS
): LoudnessResult {
  const passed =
    integratedLufs >= targets.minLufs &&
    integratedLufs <= targets.maxLufs &&
    truePeakDbfs <= targets.maxPeakDbfs;

  return {
    integratedLufs,
    truePeakDbfs,
    passed,
    targetRange: targets,
  };
}

/**
 * 6. ナレーション評価メタデータ（T125）との整合性チェック
 */
export function verifyNarrationLink(
  planId: string,
  scriptHash: string,
  metadata?: NarrationMetadata
): {linked: boolean; hasHumanReview: boolean; notes?: string} {
  if (!metadata) {
    return {linked: false, hasHumanReview: false, notes: '試聴メタデータが存在しません'};
  }
  if (metadata.planId !== planId || metadata.scriptHash !== scriptHash) {
    return {
      linked: false,
      hasHumanReview: false,
      notes: `台本版不一致 (期待: ${planId}/${scriptHash}, 実績: ${metadata.planId}/${metadata.scriptHash})`,
    };
  }
  const hasHumanReview = metadata.evaluations && metadata.evaluations.length > 0;
  return {
    linked: true,
    hasHumanReview: Boolean(hasHumanReview),
    notes: hasHumanReview ? `人の試聴評価 ${metadata.evaluations.length}件 記録済み` : '人の試聴評価が未実施',
  };
}
