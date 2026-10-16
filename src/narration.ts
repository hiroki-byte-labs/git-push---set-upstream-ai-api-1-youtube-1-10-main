// 合成ナレーションの生成・評価メタデータ仕様（T125）。
// ドキュメンタリー向け音響基準（低音・適切な話速・思考の間）、台本版との結び付け、人の試聴評価記録。
// Skill・検査は評価を支援するものであり、音声品質を独断で合格扱いしない。

export type PitchLevel = 'low' | 'medium-low' | 'medium';

export type NarrationProfile = {
  engine: string;
  voiceId: string;
  speedCharsPerSec: number;
  pitch: PitchLevel;
  pauseSec: {
    comma: number;
    period: number;
    paragraph: number;
  };
};

export type EvaluationRating = 1 | 2 | 3 | 4 | 5;

export type AudioEvaluation = {
  voiceId: string;
  naturalness: EvaluationRating;
  pronunciation: EvaluationRating;
  documentaryFit: EvaluationRating;
  clarity: EvaluationRating;
  reviewer: string;
  reviewedAt: string;
  notes?: string;
};

export type NarrationMetadata = {
  schema: 1;
  planId: string;
  scriptHash: string;
  audioPath: string;
  durationSec: number;
  profile: NarrationProfile;
  evaluations: AudioEvaluation[];
  adopted?: boolean;
};

const isNonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

export function validateNarrationProfile(p: any): NarrationProfile {
  if (!p || typeof p !== 'object') throw Error('profileオブジェクトが必要');
  if (!isNonEmpty(p.engine)) throw Error('profile.engineが必要');
  if (!isNonEmpty(p.voiceId)) throw Error('profile.voiceIdが必要');
  if (typeof p.speedCharsPerSec !== 'number' || p.speedCharsPerSec <= 0 || p.speedCharsPerSec > 15) {
    throw Error('profile.speedCharsPerSecは0〜15の数値が必要');
  }
  if (!['low', 'medium-low', 'medium'].includes(p.pitch)) {
    throw Error('profile.pitchはlow/medium-low/mediumが必要');
  }
  if (!p.pauseSec || typeof p.pauseSec !== 'object') throw Error('profile.pauseSecが必要');
  const {comma, period, paragraph} = p.pauseSec;
  if (typeof comma !== 'number' || typeof period !== 'number' || typeof paragraph !== 'number') {
    throw Error('profile.pauseSecはcomma, period, paragraph（秒数）が必要');
  }

  return {
    engine: p.engine,
    voiceId: p.voiceId,
    speedCharsPerSec: p.speedCharsPerSec,
    pitch: p.pitch,
    pauseSec: {comma, period, paragraph},
  };
}

export function validateEvaluation(e: any, index: number): AudioEvaluation {
  if (!e || typeof e !== 'object') throw Error(`評価[${index}]: オブジェクトが必要`);
  if (!isNonEmpty(e.voiceId)) throw Error(`評価[${index}]: voiceIdが必要`);
  for (const k of ['naturalness', 'pronunciation', 'documentaryFit', 'clarity'] as const) {
    const val = e[k];
    if (typeof val !== 'number' || val < 1 || val > 5 || !Number.isInteger(val)) {
      throw Error(`評価[${index}]: ${k}は1〜5の整数評価が必要`);
    }
  }
  if (!isNonEmpty(e.reviewer)) throw Error(`評価[${index}]: reviewer（評価者名）が必要`);
  if (!isNonEmpty(e.reviewedAt) || Number.isNaN(Date.parse(e.reviewedAt))) {
    throw Error(`評価[${index}]: reviewedAt（ISO日付）が必要`);
  }

  return {
    voiceId: e.voiceId,
    naturalness: e.naturalness,
    pronunciation: e.pronunciation,
    documentaryFit: e.documentaryFit,
    clarity: e.clarity,
    reviewer: e.reviewer,
    reviewedAt: e.reviewedAt,
    ...(e.notes ? {notes: String(e.notes)} : {}),
  };
}

export function validateNarrationMetadata(raw: any): NarrationMetadata {
  if (!raw || raw.schema !== 1) throw Error('NarrationMetadataはschema=1が必要');
  if (!isNonEmpty(raw.planId)) throw Error('planIdが必要');
  if (!isNonEmpty(raw.scriptHash)) throw Error('scriptHash（台本の版ハッシュ）が必要');
  if (!isNonEmpty(raw.audioPath)) throw Error('audioPathが必要');
  if (typeof raw.durationSec !== 'number' || raw.durationSec <= 0) throw Error('durationSecは正の数値が必要');

  const profile = validateNarrationProfile(raw.profile);
  const evaluations = Array.isArray(raw.evaluations)
    ? raw.evaluations.map((e: any, i: number) => validateEvaluation(e, i))
    : [];

  return {
    schema: 1,
    planId: raw.planId,
    scriptHash: raw.scriptHash,
    audioPath: raw.audioPath,
    durationSec: raw.durationSec,
    profile,
    evaluations,
    ...(typeof raw.adopted === 'boolean' ? {adopted: raw.adopted} : {}),
  };
}

/**
 * 日本語テキストと音声尺（秒）から読上げ文字速度（文字/秒）を計算
 */
export function calculateSpeed(text: string, durationSec: number): number {
  if (durationSec <= 0) return 0;
  const chars = [...text.replace(/\s+/g, '')].length;
  return Number((chars / durationSec).toFixed(2));
}
