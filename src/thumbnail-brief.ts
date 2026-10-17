// サムネイル観察台帳と生成briefの契約定義（T160）
// 公開画像の観察結果と自作サムネイルの制作指示を分離し、後続の生成・描画・検査が同一契約で動作する。
import {createHash} from 'node:crypto';
import {LIMITS, thumbnailText} from './plan.ts';
import type {Plan} from './plan.ts';
import {validateTypography} from './thumbnail-typography.ts';
import type {ThumbnailTypography} from './thumbnail-typography.ts';

// スキーマ識別子
export const THUMBNAIL_BRIEF_SCHEMA = 'thumbnail-brief@1' as const;
export const THUMBNAIL_OBSERVATION_SCHEMA = 'thumbnail-observation@1' as const;

// 構図種別（T159分析書およびT162/T163の合意構図）
// contrast: 左右・二者の対比
// symbol: 単一の象徴的図像
// scene: 題材固有の情景・状況
// relationship: 因果・分岐・集約などの関係図
export const THUMBNAIL_COMPOSITIONS = ['contrast', 'symbol', 'scene', 'relationship'] as const;
export type ThumbnailComposition = typeof THUMBNAIL_COMPOSITIONS[number];

// 候補識別子（通常は3候補 'a', 'b', 'c'）
export const THUMBNAIL_VARIANTS = ['a', 'b', 'c'] as const;
export type ThumbnailVariant = typeof THUMBNAIL_VARIANTS[number];

// 制作素材の参照契約（自作・ライセンス素材のみ。参考画像のURLは不可）
export type ThumbnailAssetRef = {
  assetId: string;              // 素材識別子（例: 'pictogram:person-single'）。URL形式は禁止
  rightsBasis: string;          // 権利根拠（例: 'self-made', 'public-domain', 'commercial-licensed'）
  license?: string;             // ライセンス名
  sourceReference?: string;     // 自作元ファイルパス等
};

// 場面・出典の根拠
export type ThumbnailGrounding = {
  sceneIndex?: number;          // 1始まりの場面番号
  sceneTitle?: string;          // 場面の見出し
  sourceIds?: string[];         // 参照する出典idリスト
};

// サムネイル候補
export type ThumbnailCandidate = {
  typography?: ThumbnailTypography;
  id: string;                   // 候補id（通常 'a' | 'b' | 'c'）
  headline: string;             // 主見出し（1〜20字）
  sub?: string;                 // 補足見出し（最大30字）
  composition: ThumbnailComposition; // 構図
  motifs: string[];             // モチーフ識別子（例: ['person-single', 'crowd']）
  grounding: ThumbnailGrounding;// 場面・出典根拠
  assets: ThumbnailAssetRef[];  // 制作素材一覧（外部参考URL禁止）
  reason: string;               // 構図・文言の選択理由
  unknowns?: string[];          // 未確認事項
  status?: 'ready' | 'needs-review'; // 候補の状態
  tone?: 'dark' | 'light';      // 背景の明暗（既定dark）。見出しの語句から推測しない（T163追加修正）
};

// サムネイル生成brief契約
export type ThumbnailBrief = {
  schema: typeof THUMBNAIL_BRIEF_SCHEMA;
  planId: string;               // 対象Planのid
  inputHash: string;            // 入力のSHA-256ハッシュ（64桁hex）
  candidates: ThumbnailCandidate[]; // 3候補
  overallStatus: 'ready' | 'needs-review'; // 全体判定
  unknowns?: string[];          // 全体の未確認事項
  createdAt?: string;           // 作成日時 (ISO-8601)
};

// 観察台帳（公開サムネイルの調査記録。制作素材とは明確に分離）
export type ObservationSample = {
  sampleId: string;
  videoId: string;
  videoUrl: string;
  topic: string;
  mainTextObserved: string;
  mainTextCharacters: number;
  observation: string;
  familyInterpretation: string;
  backgroundClassification: string;
  confidence: string;
  thumbnailUrl: string;
  sha256: string;
  bytes: number;
  contentType: string;
};

export type ThumbnailObservationLedger = {
  schema: typeof THUMBNAIL_OBSERVATION_SCHEMA;
  observedDate: string;
  timezone: string;
  channelUrl: string;
  selection: string;
  sampleCount: number;
  method: string;
  limits: string[];
  samples: ObservationSample[];
};

// 文字列判定補助
const isNonEmptyText = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.trim().length > 0 && [...v].length <= max;

// URL混入の防止: 参考画像URLを制作assetIdとして使用することを禁止する
export function assertNotObservationAsset(assetId: string): void {
  if (!assetId || typeof assetId !== 'string') {
    throw Error('assetIdは空でない文字列である必要があります');
  }
  if (/^https?:\/\//i.test(assetId) || assetId.includes('ytimg.com') || assetId.includes('youtube.com')) {
    throw Error(`参考画像URL（${assetId}）を制作assetIdとして使用することはできません。制作素材には自作または商用利用権のある素材idを指定してください。`);
  }
  if (!/^[a-zA-Z0-9_:\-./]+$/.test(assetId)) {
    throw Error(`不正なassetId形式（${assetId}）: 英数字、コロン、ハイフン、アンダースコア、スラッシュ、ドットのみ使用できます`);
  }
}

// Planからサムネイル生成に必要な入力の決定的なSHA-256ハッシュを計算する
export function calculatePlanThumbnailInputHash(plan: Plan): string {
  const norm = {
    planId: plan.id,
    title: plan.title,
    promise: plan.promise ?? '',
    thumbnail: plan.thumbnail ? {
      headline: plan.thumbnail.headline,
      sub: plan.thumbnail.sub ?? '',
      scene: plan.thumbnail.scene ?? null,
      keyword: plan.thumbnail.keyword ?? '',
      contrast: plan.thumbnail.contrast ?? null,
      ...(plan.thumbnail.typography ? {typography: plan.thumbnail.typography} : {}),
    } : null,
    scenes: plan.scenes.map((s, idx) => ({
      index: idx + 1,
      title: s.title,
      role: s.role ?? 'body',
      diagramType: s.diagram.type,
      sources: [...s.sources].sort(),
    })),
    sources: [...plan.sources].map(s => ({id: s.id, title: s.title})).sort((a, b) => a.id.localeCompare(b.id)),
  };
  return createHash('sha256').update(JSON.stringify(norm)).digest('hex');
}

// 観察台帳（observations.json）の検証
export function validateObservationLedger(raw: unknown): ThumbnailObservationLedger {
  const l = raw as any;
  if (!l || l.schema !== THUMBNAIL_OBSERVATION_SCHEMA) {
    throw Error(`schemaは ${THUMBNAIL_OBSERVATION_SCHEMA} である必要があります`);
  }
  if (!isNonEmptyText(l.observedDate, 20) || !/^\d{4}-\d{2}-\d{2}$/.test(l.observedDate)) {
    throw Error('observedDateはYYYY-MM-DD形式である必要があります');
  }
  if (!isNonEmptyText(l.timezone, 50)) throw Error('timezoneが必要です');
  if (!isNonEmptyText(l.channelUrl, 200) || !/^https?:\/\//.test(l.channelUrl)) throw Error('channelUrlが必要です');
  if (!isNonEmptyText(l.selection, 500)) throw Error('selectionが必要です');
  if (!Number.isInteger(l.sampleCount) || l.sampleCount < 0) throw Error('sampleCountは0以上の整数である必要があります');
  if (!isNonEmptyText(l.method, 500)) throw Error('methodが必要です');
  if (!Array.isArray(l.limits) || !l.limits.length) throw Error('limitsは1件以上の配列である必要があります');
  if (!Array.isArray(l.samples)) throw Error('samplesは配列である必要があります');
  if (l.samples.length !== l.sampleCount) {
    throw Error(`sampleCount(${l.sampleCount})とsamples.length(${l.samples.length})が一致しません`);
  }

  const seenIds = new Set<string>();
  for (const s of l.samples) {
    if (!isNonEmptyText(s?.sampleId, 20) || seenIds.has(s.sampleId)) {
      throw Error(`不正または重複したsampleId: ${s?.sampleId}`);
    }
    seenIds.add(s.sampleId);
    if (!isNonEmptyText(s.videoId, 50)) throw Error(`${s.sampleId}: videoIdが必要です`);
    if (!isNonEmptyText(s.videoUrl, 200) || !/^https?:\/\//.test(s.videoUrl)) throw Error(`${s.sampleId}: videoUrlが不正です`);
    if (!isNonEmptyText(s.topic, 100)) throw Error(`${s.sampleId}: topicが必要です`);
    if (typeof s.mainTextObserved !== 'string') throw Error(`${s.sampleId}: mainTextObservedが必要です`);
    if (!Number.isInteger(s.mainTextCharacters) || s.mainTextCharacters < 0) throw Error(`${s.sampleId}: mainTextCharactersが不正です`);
    if (!isNonEmptyText(s.observation, 500)) throw Error(`${s.sampleId}: observationが必要です`);
    if (!isNonEmptyText(s.familyInterpretation, 50)) throw Error(`${s.sampleId}: familyInterpretationが必要です`);
    if (!isNonEmptyText(s.backgroundClassification, 50)) throw Error(`${s.sampleId}: backgroundClassificationが必要です`);
    if (!isNonEmptyText(s.thumbnailUrl, 500) || !/^https?:\/\//.test(s.thumbnailUrl)) throw Error(`${s.sampleId}: thumbnailUrlが不正です`);
    if (!isNonEmptyText(s.sha256, 64) || !/^[a-f0-9]{64}$/.test(s.sha256)) throw Error(`${s.sampleId}: sha256は64桁の16進数である必要があります`);
    if (!Number.isInteger(s.bytes) || s.bytes <= 0) throw Error(`${s.sampleId}: bytesは正の整数である必要があります`);
  }

  return l as ThumbnailObservationLedger;
}

// サムネイルbriefの検証
export function validateThumbnailBrief(raw: unknown, plan?: Plan): ThumbnailBrief {
  const b = raw as any;
  if (!b || b.schema !== THUMBNAIL_BRIEF_SCHEMA) {
    throw Error(`schemaは ${THUMBNAIL_BRIEF_SCHEMA} である必要があります`);
  }
  if (!isNonEmptyText(b.planId, 100)) throw Error('planIdが必要です');
  if (!isNonEmptyText(b.inputHash, 64) || !/^[a-f0-9]{64}$/.test(b.inputHash)) {
    throw Error('inputHashは64文字の16進数ハッシュ（SHA-256）である必要があります');
  }

  if (plan) {
    if (plan.id !== b.planId) {
      throw Error(`briefのplanId(${b.planId})が渡されたPlan.id(${plan.id})と一致しません`);
    }
    const expectedHash = calculatePlanThumbnailInputHash(plan);
    if (b.inputHash !== expectedHash) {
      throw Error(`inputHashがPlanの計算結果と一致しません。期待値: ${expectedHash}, 実際: ${b.inputHash}`);
    }
  }

  if (!Array.isArray(b.candidates) || b.candidates.length !== 3) {
    throw Error('candidatesはちょうど3候補である必要があります');
  }

  const seenVariants = new Set<string>();
  let hasNeedsReview = false;
  const planSourceIds = plan ? new Set(plan.sources.map(s => s.id)) : null;

  for (let i = 0; i < b.candidates.length; i++) {
    const c = b.candidates[i];
    const where = `candidate[${i}](${c?.id ?? '不明'})`;

    if (!isNonEmptyText(c?.id, 20)) throw Error(`${where}: idが必要です`);
    if (seenVariants.has(c.id)) throw Error(`${where}: 候補id「${c.id}」が重複しています`);
    seenVariants.add(c.id);

    // 見出し文字数検査（LIMITS.thumbHeadline = 20）
    if (!isNonEmptyText(c.headline, LIMITS.thumbHeadline)) {
      throw Error(`${where}: headlineは1〜${LIMITS.thumbHeadline}字である必要があります（実際: ${typeof c.headline === 'string' ? [...c.headline].length : '不正値'}字）`);
    }
    if (c.typography !== undefined) validateTypography(c.typography, c.headline);

    // 補足文字数検査（LIMITS.thumbSub = 30）
    if (c.sub !== undefined && c.sub !== '' && !isNonEmptyText(c.sub, LIMITS.thumbSub)) {
      throw Error(`${where}: subは${LIMITS.thumbSub}字以内である必要があります`);
    }

    // 背景の明暗（任意）
    if (c.tone !== undefined && c.tone !== 'dark' && c.tone !== 'light') {
      throw Error(`${where}: toneはdarkかlightである必要があります（実際: ${String(c.tone)}）`);
    }

    // 構図種別検査
    if (!(THUMBNAIL_COMPOSITIONS as readonly string[]).includes(c.composition)) {
      throw Error(`${where}: 未知の構図（${c.composition}）。利用可能な構図: ${THUMBNAIL_COMPOSITIONS.join(', ')}`);
    }

    // モチーフ検査
    if (!Array.isArray(c.motifs) || !c.motifs.length) {
      throw Error(`${where}: motifsは1件以上の配列である必要があります`);
    }
    for (const m of c.motifs) {
      if (!isNonEmptyText(m, 50)) throw Error(`${where}: 不正なモチーフ識別子（${m}）`);
    }

    // 場面・出典の根拠検査
    if (!c.grounding || typeof c.grounding !== 'object') {
      throw Error(`${where}: groundingが必要です`);
    }
    if (c.grounding.sceneIndex !== undefined) {
      if (!Number.isInteger(c.grounding.sceneIndex) || c.grounding.sceneIndex < 1) {
        throw Error(`${where}: grounding.sceneIndexは1以上の整数である必要があります`);
      }
      if (plan && c.grounding.sceneIndex > plan.scenes.length) {
        throw Error(`${where}: grounding.sceneIndex(${c.grounding.sceneIndex})が台本の場面数(${plan.scenes.length})を超えています`);
      }
    }
    if (c.grounding.sourceIds !== undefined) {
      if (!Array.isArray(c.grounding.sourceIds)) {
        throw Error(`${where}: grounding.sourceIdsは配列である必要があります`);
      }
      if (planSourceIds) {
        for (const sid of c.grounding.sourceIds) {
          if (!planSourceIds.has(sid)) {
            throw Error(`${where}: grounding.sourceIdsに未定義の出典id「${sid}」が含まれています`);
          }
        }
      }
    }

    // 制作素材の参照検査（参考画像URLの混入を厳格に拒否）
    if (!Array.isArray(c.assets)) {
      throw Error(`${where}: assetsは配列である必要があります`);
    }
    for (const a of c.assets) {
      assertNotObservationAsset(a?.assetId);
      if (!isNonEmptyText(a.rightsBasis, 100)) {
        throw Error(`${where}: asset(${a?.assetId})のrightsBasisが必要です`);
      }
    }

    // 理由検査
    if (!isNonEmptyText(c.reason, 300)) {
      throw Error(`${where}: reason（採用・選択理由）が必要です`);
    }

    // 未確認事項およびstatus検査
    const candUnknowns = Array.isArray(c.unknowns) ? c.unknowns.filter((u: unknown) => typeof u === 'string' && (u as string).trim().length > 0) : [];
    if (candUnknowns.length > 0) {
      hasNeedsReview = true;
      if (c.status === 'ready') {
        throw Error(`${where}: 未確認事項（unknowns）が存在する場合、candidate.statusを'ready'にすることはできません。'needs-review'を指定してください`);
      }
    }
    if (c.status !== undefined && c.status !== 'ready' && c.status !== 'needs-review') {
      throw Error(`${where}: statusは'ready'または'needs-review'である必要があります`);
    }
    if (c.status === 'needs-review') {
      hasNeedsReview = true;
    }
  }

  // brief全体の未確認事項検査
  const overallUnknowns = Array.isArray(b.unknowns) ? b.unknowns.filter((u: unknown) => typeof u === 'string' && (u as string).trim().length > 0) : [];
  if (overallUnknowns.length > 0) {
    hasNeedsReview = true;
  }

  if (b.overallStatus !== 'ready' && b.overallStatus !== 'needs-review') {
    throw Error('overallStatusは\'ready\'または\'needs-review\'である必要があります');
  }

  // 未確認事項があるのに overallStatus が 'ready' になっているものは拒否
  if (hasNeedsReview && b.overallStatus === 'ready') {
    throw Error('未確認事項（unknowns）またはneeds-reviewの候補が存在する場合、overallStatusを\'ready\'にすることはできません。\'needs-review\'を指定してください');
  }

  return b as ThumbnailBrief;
}

// 旧Plan.thumbnailおよび省略時のtitle/promise代替、keyword/contrastからThumbnailBriefを生成する
// T073/T096/T106の挙動を維持し、新契約の仕様へ適応させる
export function convertPlanThumbnailToBrief(plan: Plan): ThumbnailBrief {
  const resolved = thumbnailText(plan);
  const inputHash = calculatePlanThumbnailInputHash(plan);

  // 既定の場面番号（hook以外の最初の場面、または指定scene）
  const hookSceneIdx = plan.scenes.findIndex(s => s.role !== 'hook');
  const defaultSceneIdx = hookSceneIdx >= 0 ? hookSceneIdx + 1 : 1;
  const targetSceneIdx = plan.thumbnail?.scene ?? defaultSceneIdx;

  const targetScene = plan.scenes[targetSceneIdx - 1];
  const sourceIds = targetScene ? [...targetScene.sources] : [];

  // 案a: 見出し中心（問い型・象徴型）
  const candidateA: ThumbnailCandidate = {
    id: 'a',
    headline: resolved.headline,
    sub: resolved.sub || undefined,
    composition: 'symbol',
    motifs: plan.thumbnail?.keyword ? [plan.thumbnail.keyword] : ['central-symbol'],
    grounding: {
      sceneIndex: 1,
      sceneTitle: plan.scenes[0]?.title,
      sourceIds: plan.scenes[0] ? [...plan.scenes[0].sources] : [],
    },
    assets: [
      {
        assetId: 'builtin:symbol-focus',
        rightsBasis: 'self-made',
      },
    ],
    reason: plan.thumbnail?.keyword
      ? `キーワード「${plan.thumbnail.keyword}」と見出しによる象徴構成`
      : '主見出しと象徴図像を中心とした構成',
    status: 'ready',
  };

  // 案b: 本文図解連動（情景・関係型）
  const candidateB: ThumbnailCandidate = {
    id: 'b',
    headline: resolved.headline,
    sub: resolved.sub || undefined,
    composition: targetScene?.diagram.type === 'flow' || targetScene?.diagram.type === 'branch' ? 'relationship' : 'scene',
    motifs: targetScene?.diagram.illustration ? [targetScene.diagram.illustration] : ['diagram-scene'],
    grounding: {
      sceneIndex: targetSceneIdx,
      sceneTitle: targetScene?.title,
      sourceIds,
    },
    assets: [
      {
        assetId: `builtin:diagram-${targetScene?.diagram.type ?? 'generic'}`,
        rightsBasis: 'self-made',
      },
    ],
    reason: `場面${targetSceneIdx}「${targetScene?.title ?? ''}」の図解と連動した構成`,
    status: 'ready',
  };

  // 案c: 対比型（contrast指定がある場合は対比、なければ反転配色）
  const contrastMotifs = plan.thumbnail?.contrast ? [...plan.thumbnail.contrast] : ['contrast-pair'];
  const candidateC: ThumbnailCandidate = {
    id: 'c',
    headline: resolved.headline,
    sub: resolved.sub || undefined,
    composition: 'contrast',
    motifs: contrastMotifs,
    grounding: {
      sceneIndex: targetSceneIdx,
      sceneTitle: targetScene?.title,
      sourceIds,
    },
    assets: [
      {
        assetId: 'builtin:contrast-split',
        rightsBasis: 'self-made',
      },
    ],
    reason: plan.thumbnail?.contrast
      ? `対比項目（${plan.thumbnail.contrast.join(' vs ')}）を強調した構成`
      : '高コントラスト・二者対比を意識した配色構成',
    status: 'ready',
  };

  const brief: ThumbnailBrief = {
    schema: THUMBNAIL_BRIEF_SCHEMA,
    planId: plan.id,
    inputHash,
    candidates: [candidateA, candidateB, candidateC],
    overallStatus: 'ready',
    createdAt: new Date().toISOString(),
  };

  return validateThumbnailBrief(brief, plan);
}
