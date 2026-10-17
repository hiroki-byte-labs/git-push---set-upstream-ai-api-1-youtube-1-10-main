// 台本の意味に対応するサムネイル3候補の自動構成（T161）
// 問い（question/symbol）、対比（contrast）、メカニズム・関係（relationship/scene）の3案を決定的に構成する。
import type {Plan, Scene} from './plan.ts';
import type {ThumbnailTypography} from './thumbnail-typography.ts';
import {LIMITS} from './plan.ts';
import {FORBIDDEN, NUMERIC_CLAIM} from './lint.ts';
import {
  calculatePlanThumbnailInputHash,
  validateThumbnailBrief,
  THUMBNAIL_BRIEF_SCHEMA,
} from './thumbnail-brief.ts';
import type {
  ThumbnailBrief,
  ThumbnailCandidate,
  ThumbnailComposition,
} from './thumbnail-brief.ts';

// 禁止表現検査（FORBIDDEN）
function containsForbiddenText(text: string): boolean {
  return FORBIDDEN.some(f => f.pattern.test(text));
}

// 意味を壊さない短縮処理（20文字以内）
// 単純な末尾切り捨て（slice）ではなく、読点・助詞・句の境界で区切る
function shortenMeaningfully(text: string, maxLen: number): string {
  const chars = [...text.trim()];
  if (chars.length <= maxLen) return text.trim();

  // 1. 読点やコロン、区切り文字での分割
  const delims = ['｜', '|', '：', ':', '、', '——', '—', ' '];
  for (const d of delims) {
    const idx = text.indexOf(d);
    if (idx > 0 && idx <= maxLen) {
      const part = text.slice(0, idx).trim();
      if ([...part].length >= 3 && [...part].length <= maxLen) return part;
    }
  }

  // 2. 「なぜ〜か」「なぜ〜？」などの問い句の抽出
  const whyMatch = text.match(/なぜ[^？?。！!\n]+[？?]?/);
  if (whyMatch && [...whyMatch[0]].length <= maxLen) {
    return whyMatch[0].trim();
  }

  // 3. 助詞（の、は、を、が、で、と、に）の直後で切れるか確認
  const particleMatch = text.slice(0, maxLen).match(/^(.*?[のはをがでとに])(?:[^\sのはをがでとに]*)$/);
  if (particleMatch && [...particleMatch[1]].length >= 4 && [...particleMatch[1]].length <= maxLen) {
    return particleMatch[1].trim();
  }

  // 短縮不能な場合はそのまま返し、文字数超過としてバリデーション側で検知させる
  return text.trim();
}

// 2つの文言が実質同一（文末記号違いなど）かを判定
function areHeadlinesEffectivelyIdentical(a: string, b: string): boolean {
  const normA = a.replace(/[？?！!。、\s]/g, '');
  const normB = b.replace(/[？?！!。、\s]/g, '');
  return normA === normB;
}

export type CandidateGenerationOptions = {
  typography?: ThumbnailTypography;
  allowNeedsReview?: boolean;
};

// 承認済みPlanから異なる3候補のサムネイルBriefを自動構成する
export function buildThumbnailCandidates(plan: Plan, options: CandidateGenerationOptions = {}): ThumbnailBrief {
  const inputHash = calculatePlanThumbnailInputHash(plan);
  const unknowns: string[] = [];
  const candidates: ThumbnailCandidate[] = [];

  // 場面と役割の探索
  const hookScene = plan.scenes.find(s => s.role === 'hook') ?? plan.scenes[0];
  const compareScene = plan.scenes.find(s => s.diagram.type === 'compare');
  const recapScene = plan.scenes.find(s => s.role === 'recap' || s.role === 'action') ?? plan.scenes[plan.scenes.length - 1];

  // ----------------------------------------------------
  // 候補a: 問い型（象徴 / 単一モチーフ）
  // ----------------------------------------------------
  let headlineA = '';
  if (plan.thumbnail?.headline) {
    headlineA = plan.thumbnail.headline;
  } else if (plan.title.includes('なぜ') || plan.title.includes('？') || plan.title.includes('?')) {
    headlineA = shortenMeaningfully(plan.title, LIMITS.thumbHeadline);
  } else {
    headlineA = shortenMeaningfully(`なぜ${plan.title}？`, LIMITS.thumbHeadline);
  }

  // hook場面のタイトルや補足からsubを決定
  const subA = plan.promise ? shortenMeaningfully(plan.promise, LIMITS.thumbSub) : (hookScene?.title ?? '');
  const motifA = plan.thumbnail?.keyword ?? (hookScene?.diagram.illustration ?? 'question-symbol');
  const sourceIdsA = hookScene ? [...hookScene.sources] : [];
  const assetIdA = hookScene?.diagram.illustration ? `builtin:motif-${hookScene.diagram.illustration}` : 'builtin:motif-symbol-focus';

  const candidateA: ThumbnailCandidate = {
    id: 'a',
    headline: headlineA,
    sub: subA || undefined,
    composition: 'symbol',
    motifs: [motifA],
    grounding: {
      sceneIndex: hookScene ? plan.scenes.indexOf(hookScene) + 1 : 1,
      sceneTitle: hookScene?.title,
      sourceIds: sourceIdsA,
    },
    assets: [
      {
        assetId: assetIdA,
        rightsBasis: 'self-made',
      },
    ],
    reason: `hook場面（場面${hookScene ? plan.scenes.indexOf(hookScene) + 1 : 1}）の提起する問いに焦点を当てた象徴構成`,
    status: 'ready',
  };

  // ----------------------------------------------------
  // 候補b: 対比型（左右比較 / 二者の差）
  // ----------------------------------------------------
  let headlineB = '';
  let subB = '';
  let targetSceneB: Scene | undefined;
  let motifsB: string[] = [];

  if (plan.thumbnail?.contrast) {
    headlineB = `${plan.thumbnail.contrast[0]}と${plan.thumbnail.contrast[1]}`;
    motifsB = [...plan.thumbnail.contrast];
    targetSceneB = compareScene ?? plan.scenes[1] ?? plan.scenes[0];
    subB = targetSceneB?.title ?? '';
  } else if (compareScene && compareScene.diagram.type === 'compare') {
    headlineB = `${compareScene.diagram.left}と${compareScene.diagram.right}`;
    motifsB = [compareScene.diagram.left, compareScene.diagram.right];
    targetSceneB = compareScene;
    subB = compareScene.title;
  } else {
    // 対比図解がない場合、第1場面と第2場面の対比、または台本全体の対立軸
    targetSceneB = plan.scenes[1] ?? plan.scenes[0];
    headlineB = shortenMeaningfully(`${targetSceneB.title}の対比`, LIMITS.thumbHeadline);
    motifsB = ['contrast-left', 'contrast-right'];
    subB = targetSceneB.narration.slice(0, LIMITS.thumbSub);
  }

  headlineB = shortenMeaningfully(headlineB, LIMITS.thumbHeadline);
  subB = shortenMeaningfully(subB, LIMITS.thumbSub);

  const candidateB: ThumbnailCandidate = {
    id: 'b',
    headline: headlineB,
    sub: subB || undefined,
    composition: 'contrast',
    motifs: motifsB.length ? motifsB : ['contrast-pair'],
    grounding: {
      sceneIndex: targetSceneB ? plan.scenes.indexOf(targetSceneB) + 1 : 1,
      sceneTitle: targetSceneB?.title,
      sourceIds: targetSceneB ? [...targetSceneB.sources] : [],
    },
    assets: [
      {
        assetId: 'builtin:contrast-layout',
        rightsBasis: 'self-made',
      },
    ],
    reason: `場面${targetSceneB ? plan.scenes.indexOf(targetSceneB) + 1 : 1}の対比構造（${headlineB}）を強調した左右構成`,
    status: 'ready',
  };

  // ----------------------------------------------------
  // 候補c: メカニズム・関係・帰結型（Relationship / Scene）
  // ----------------------------------------------------
  // 因果図解（flow, branch, branching-tree等）がある場面を優先
  const relationScene = plan.scenes.find(s =>
    s.diagram.type === 'flow' ||
    s.diagram.type === 'branch' ||
    s.diagram.illustration === 'branching-tree' ||
    s.diagram.illustration === 'lineage-convergence' ||
    s.diagram.illustration === 'attention-concentration'
  ) ?? recapScene ?? plan.scenes[0];

  const compC: ThumbnailComposition = relationScene.diagram.type === 'flow' || relationScene.diagram.type === 'branch'
    ? 'relationship'
    : 'scene';

  let headlineC = '';
  // 章（chapter）がある場合は章見出し、または関係場面・まとめ場面のタイトルを活用
  if (relationScene.chapter && relationScene.chapter !== hookScene?.chapter) {
    headlineC = shortenMeaningfully(relationScene.chapter, LIMITS.thumbHeadline);
  } else if (recapScene && recapScene.title && recapScene !== hookScene) {
    headlineC = shortenMeaningfully(recapScene.title, LIMITS.thumbHeadline);
  } else {
    headlineC = shortenMeaningfully(relationScene.title, LIMITS.thumbHeadline);
  }

  // 候補aやbと重複する場合は、台本内の別の場面タイトルを探索
  if (areHeadlinesEffectivelyIdentical(headlineC, headlineA) || areHeadlinesEffectivelyIdentical(headlineC, headlineB)) {
    const altScene = plan.scenes.find(s =>
      s !== hookScene &&
      s !== relationScene &&
      !areHeadlinesEffectivelyIdentical(s.title, headlineA) &&
      !areHeadlinesEffectivelyIdentical(s.title, headlineB)
    );
    if (altScene) {
      headlineC = shortenMeaningfully(altScene.title, LIMITS.thumbHeadline);
    }
  }

  const subC = plan.promise ? shortenMeaningfully(plan.promise, LIMITS.thumbSub) : relationScene.title;
  const motifC = relationScene.diagram.illustration ?? 'mechanism-flow';

  const candidateC: ThumbnailCandidate = {
    id: 'c',
    headline: headlineC,
    sub: subC || undefined,
    composition: compC,
    motifs: [motifC],
    grounding: {
      sceneIndex: plan.scenes.indexOf(relationScene) + 1,
      sceneTitle: relationScene.title,
      sourceIds: [...relationScene.sources],
    },
    assets: [
      {
        assetId: `builtin:motif-${motifC}`,
        rightsBasis: 'self-made',
      },
    ],
    reason: `場面${plan.scenes.indexOf(relationScene) + 1}「${relationScene.title}」の因果・メカニズムを視覚化した${compC}構成`,
    status: 'ready',
  };

  candidates.push(candidateA, candidateB, candidateC);
  const typography = options.typography ?? plan.thumbnail?.typography;
  if (typography) for (const c of candidates) c.typography = {...structuredClone(typography),
    emphasis: typography.emphasis?.filter(word => c.headline.includes(word))};

  // ----------------------------------------------------
  // 安全性検査・重複排除・禁止表現検査
  // ----------------------------------------------------
  for (const c of candidates) {
    // 文字数検査
    if ([...c.headline].length > LIMITS.thumbHeadline) {
      c.status = 'needs-review';
      c.unknowns = [...(c.unknowns ?? []), `見出し文字数(${[...c.headline].length}字)が上限(${LIMITS.thumbHeadline}字)を超過`];
    }
    if (c.sub && [...c.sub].length > LIMITS.thumbSub) {
      c.status = 'needs-review';
      c.unknowns = [...(c.unknowns ?? []), `補足文字数(${[...c.sub].length}字)が上限(${LIMITS.thumbSub}字)を超過`];
    }

    // 禁止表現検査
    if (containsForbiddenText(c.headline)) {
      c.status = 'needs-review';
      c.unknowns = [...(c.unknowns ?? []), `見出し「${c.headline}」に禁止表現が含まれます`];
    }
    if (c.sub && containsForbiddenText(c.sub)) {
      c.status = 'needs-review';
      c.unknowns = [...(c.unknowns ?? []), `補足「${c.sub}」に禁止表現が含まれます`];
    }

    // 根拠のない数値表現の検査（台本にない数値が勝手に入っていないか）
    if (NUMERIC_CLAIM.test(c.headline) && !plan.title.includes(c.headline) && !plan.scenes.some(s => s.narration.includes(c.headline) || s.title.includes(c.headline))) {
      c.status = 'needs-review';
      c.unknowns = [...(c.unknowns ?? []), `見出し「${c.headline}」に出典根拠のない数値表現の疑いがあります`];
    }
  }

  // 重複検査（文末記号違いのみの重複も拒否）
  if (areHeadlinesEffectivelyIdentical(candidates[0].headline, candidates[1].headline)) {
    candidates[1].status = 'needs-review';
    candidates[1].unknowns = [...(candidates[1].unknowns ?? []), '候補aと候補bの見出しが実質同一です'];
  }
  if (areHeadlinesEffectivelyIdentical(candidates[0].headline, candidates[2].headline)) {
    candidates[2].status = 'needs-review';
    candidates[2].unknowns = [...(candidates[2].unknowns ?? []), '候補aと候補cの見出しが実質同一です'];
  }
  if (areHeadlinesEffectivelyIdentical(candidates[1].headline, candidates[2].headline)) {
    candidates[2].status = 'needs-review';
    candidates[2].unknowns = [...(candidates[2].unknowns ?? []), '候補bと候補cの見出しが実質同一です'];
  }

  // 構図がすべて同一の3重出力も拒否
  if (candidates[0].composition === candidates[1].composition && candidates[1].composition === candidates[2].composition) {
    candidates[2].status = 'needs-review';
    candidates[2].unknowns = [...(candidates[2].unknowns ?? []), '3候補の構図がすべて同一です。多様な訴求構図が必要です'];
  }

  const hasNeedsReview = candidates.some(c => c.status === 'needs-review' || (c.unknowns && c.unknowns.length > 0)) || unknowns.length > 0;
  const overallStatus = hasNeedsReview ? 'needs-review' : 'ready';

  const brief: ThumbnailBrief = {
    schema: THUMBNAIL_BRIEF_SCHEMA,
    planId: plan.id,
    inputHash,
    candidates,
    overallStatus,
    unknowns: unknowns.length ? unknowns : undefined,
  };

  return validateThumbnailBrief(brief, plan);
}
