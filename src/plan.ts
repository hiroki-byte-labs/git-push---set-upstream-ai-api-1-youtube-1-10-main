// 台本形式 v2（T041）。長尺・ナレーション・字幕cue・図解4種・出典を表現する。
// v1（fixtures/sample.json の形式、schema欄なし）は toV2() で自動変換する。
// v1の型と検証（M1のfixture形式。T041でproviders.tsから移設）。
import {validateTypography} from './thumbnail-typography.ts';
import type {ThumbnailTypography} from './thumbnail-typography.ts';
export type SceneV1={title:string;subtitle:string;nodes:string[];seconds:number};
export type PlanV1={id:string;title:string;version:number;scenes:SceneV1[]};
export function validateV1(p:PlanV1):PlanV1{
 if(!p||!/^[-a-z0-9]+$/.test(p.id)||typeof p.title!=='string'||!Number.isInteger(p.version)||p.version<1||!Array.isArray(p.scenes)||!p.scenes.length||p.scenes.length>20)throw Error('不正な企画');
 for(const s of p.scenes)if(!s||typeof s.title!=='string'||!s.title.length||s.title.length>30||typeof s.subtitle!=='string'||!s.subtitle.length||s.subtitle.length>55||!Array.isArray(s.nodes)||s.nodes.length!==3||s.nodes.some(n=>typeof n!=='string'||!n.length||n.length>14)||!Number.isInteger(s.seconds)||s.seconds<2||s.seconds>30)throw Error('不正な場面');
 return p;
}

// reveal（T106）: 段ごとの表示開始秒（場面の先頭から。先頭は0、昇順）。ナレーション・字幕の説明に合わせて段を出す。省略時は自動。
// motion（T106）: flowの'travel'は、前の段からの矢印が伸び切るのに合わせて次の段を出す（原因→結果・経緯）。
// meter（T106）: 品目ごとの変化の棒が順に伸び、最後に平均の棒が伸びる集計の図。valueは−1〜1の相対値で、数値は画面に出さない。
export type Bar = {label: string; value: number};
type Reveal = {reveal?: number[]};
// 場面の型（T150: 情景、対比、数量/データ、関係/因果、章の余韻）。説明の役割に応じて選択する。
export const SCENE_ARCHETYPES = ['scenery', 'contrast', 'data-quantity', 'causal-relation', 'resonance'] as const;
export type SceneArchetype = typeof SCENE_ARCHETYPES[number];

export const DIAGRAM_ILLUSTRATIONS = [
  'attention-concentration',
  'ranked-rewards',
  'digital-reach',
  'branching-tree',
  'lineage-convergence',
  'tolerance-boundary',
  'social-division',
] as const;
export type DiagramIllustration = typeof DIAGRAM_ILLUSTRATIONS[number];
type Illustration = {
  illustration?: DiagramIllustration;
  archetype?: SceneArchetype;
  focus?: string;
  motionPurpose?: string;
};
export type Diagram =
  | ({type: 'flow'; items: string[]; motion?: 'travel'} & Reveal & Illustration)
  | ({type: 'compare'; left: string; right: string; leftItems: string[]; rightItems: string[]} & Reveal & Illustration)
  | ({type: 'number'; value: string; label: string; note?: string} & Reveal & Illustration)
  | ({type: 'branch'; question: string; yes: string; no: string} & Reveal & Illustration)
  | ({type: 'meter'; bars: Bar[]; total: string} & Reveal & Illustration);
// 図解を段階表示するときの段数。flowは要素ごと、compareは左右、branchは問い→答え、numberは一度に、meterは棒ごと＋まとめ。
export function diagramSteps(d: Diagram) {
  return d.type === 'flow' ? d.items.length : d.type === 'compare' ? 2 : d.type === 'branch' ? 2 : d.type === 'meter' ? d.bars.length + 1 : 1;
}
export type Cue = {text: string; seconds: number};
// 場面の役割（T075〜）。構成の検査（src/lint.ts）に使う。省略時は本編（body）扱い。
// reflection（T104）: 本人の考察の場面。下書きでは本文をREFLECTION_PLACEHOLDERにし、本人の考察を差し込む（src/production.ts）。
export const ROLES = ['hook', 'body', 'recap', 'question', 'example', 'glossary', 'reflection', 'action'] as const;
export const REFLECTION_PLACEHOLDER = '【本人の考察：未入力】';
// 物語の流れ（T081）。状況→葛藤→気づき→学びの順に置く。
export const BEATS = ['situation', 'conflict', 'insight', 'lesson'] as const;
export type Beat = typeof BEATS[number];
export type Role = typeof ROLES[number];
export type Scene = {title: string; narration: string; cues: Cue[]; diagram: Diagram; sources: string[]; seconds: number; role?: Role; chapter?: string; beat?: Beat; fictional?: boolean; emphasis?: string[]; practice?: string[]};
export type Source = {id: string; title: string; url: string; accessedAt: string};
// promise: この動画で視聴者が得られること（タイトル・冒頭で約束する内容。T075）。glossary: 先に説明する用語（T083）。
export type Term = {term: string; definition: string};
// thumbnail: サムネイルの見出し（T073）。省略時は台本の題名。keyword・contrastはT106の案a（問い型）・c（対比型）で使う。
export type Thumbnail = {headline: string; sub?: string; scene?: number; keyword?: string; contrast?: [string, string]; typography?: ThumbnailTypography};
// サムネイルに描く最終文言（T096）。見出しは省略時に題名、補足は省略時にpromise。
// 描画（buildThumbSpecs）と安全検査（lintPlan）はこの関数だけを使い、代替ルールを別に持たない。
export function thumbnailText(plan: Pick<Plan, 'title' | 'promise' | 'thumbnail'>) {
  return {
    headline: plan.thumbnail?.headline ?? plan.title,
    headlineFrom: plan.thumbnail?.headline !== undefined ? 'thumbnail.headline' : 'title',
    sub: plan.thumbnail?.sub ?? plan.promise ?? '',
    subFrom: plan.thumbnail?.sub !== undefined ? 'thumbnail.sub' : plan.promise !== undefined ? 'promise' : 'なし',
    // 明示したキーワード・対比の文言（T106）。図解から補う値は図解として検査済み。
    extras: [plan.thumbnail?.keyword, ...(plan.thumbnail?.contrast ?? [])].filter((x): x is string => typeof x === 'string'),
  };
}
// style.transitions=falseで段階表示のフェード・強調を止める（T079）。
export type Style = {transitions?: boolean};
// 題材の区分（T103）。general=日常に結び付く知識全般、investment=投資を扱う回。免責の条件がテーマで異なる（src/lint.ts）。
// theme未指定は旧形式（投資と心理の試作）なので投資テーマとして解釈し、投資の免責を求める（検査を回避させない）。
export const THEMES = ['general', 'investment'] as const;
export type Theme = typeof THEMES[number];
export const themeOf = (plan: Pick<Plan, 'theme'>): Theme => plan.theme ?? 'investment';
// 概要欄の先頭に置く導入文（T103）。具体的なニュースや事象から題材へつなぐ。
// 実在の出来事なら出典（sources）を、架空の場面ならfictional: trueを付ける（lintで検査）。
export type Intro = {text: string; sources: string[]; fictional?: boolean};
// production（T104）: 制作案件から作った台本の印。mode=demoなら考察は試験用で、画面にデモと表示する。
export type ProductionInfo = {mode: 'production' | 'demo'; project: string};

// AI利用と人の監修（T071、G20〜G22）。「AI生成」とだけ表示すると信頼が低下するため、AI利用範囲と人の監修を明示する。
export type AiDisclosure = {
  scopes: string[];       // AIを利用した範囲（例: ['台本構成案・図解配置の生成補助']）
  supervisor: string;     // 監修者名または役割（例: '制作監修者'）
  verified: string[];     // 人が確認・検証した項目（例: ['主張と出典の照合', '事実関係の確認', '台本・動画の最終確認']）
  realisticSyntheticMedia?: boolean; // 現実と誤認しうる合成（YouTube開示義務対象）を含むか（未指定時はfalse）
};

export const DEFAULT_AI_DISCLOSURE: AiDisclosure = {
  scopes: ['台本構成案・図解配置の生成補助'],
  supervisor: '制作監修者',
  verified: ['主張と出典の照合', '事実関係の確認', '台本・動画の最終確認'],
  realisticSyntheticMedia: false,
};

export type Plan = {schema: 2; id: string; title: string; version: number; scenes: Scene[]; sources: Source[]; promise?: string; glossary?: Term[]; thumbnail?: Thumbnail; style?: Style; theme?: Theme; intro?: Intro; note?: string; production?: ProductionInfo; aiDisclosure?: AiDisclosure};

// 上限値。描画（scripts/render.swift）の枠と、10〜20分の長尺（余裕を見て25分）に合わせる。
export const LIMITS = {
  scenes: 200,
  totalSeconds: 25 * 60,
  sceneSeconds: [2, 120],
  title: 30,
  cueText: 55,
  narrationCharsPerSecond: 9,
  flowItems: [2, 4],
  flowItem: 14,
  compareLabel: 14,
  compareItems: [1, 3],
  compareItem: 16,
  numberValue: 8,
  numberLabel: 20,
  numberNote: 40,
  branchQuestion: 24,
  branchAnswer: 20,
  promise: 40,
  chapter: 24,
  term: 12,
  definition: 40,
  glossary: 30,
  thumbHeadline: 20,
  emphasisItems: [1, 3],
  emphasisItem: 12,
  thumbSub: 30,
  intro: 300,
  meterBars: [2, 5],
  meterLabel: 10,
  meterTotal: 14,
  thumbKeyword: 6,
  thumbContrast: 10,
  aiScopes: 5,
  aiScope: 40,
  aiSupervisor: 40,
  aiVerified: 5,
  aiVerifiedItem: 40,
  practiceItem: 80,
  practiceItems: 12,
} as const;

const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && [...v].length <= max;
const isTextList = (v: unknown, [min, max]: readonly number[], itemMax: number) =>
  Array.isArray(v) && v.length >= min && v.length <= max && v.every(x => isText(x, itemMax));

function checkDiagram(d: any, where: string) {
  const ok =
    d?.type === 'flow' ? isTextList(d.items, LIMITS.flowItems, LIMITS.flowItem) :
    d?.type === 'compare' ? isText(d.left, LIMITS.compareLabel) && isText(d.right, LIMITS.compareLabel) &&
      isTextList(d.leftItems, LIMITS.compareItems, LIMITS.compareItem) && isTextList(d.rightItems, LIMITS.compareItems, LIMITS.compareItem) :
    d?.type === 'number' ? isText(d.value, LIMITS.numberValue) && isText(d.label, LIMITS.numberLabel) && (d.note === undefined || isText(d.note, LIMITS.numberNote)) :
    d?.type === 'branch' ? isText(d.question, LIMITS.branchQuestion) && isText(d.yes, LIMITS.branchAnswer) && isText(d.no, LIMITS.branchAnswer) :
    d?.type === 'meter' ? Array.isArray(d.bars) && d.bars.length >= LIMITS.meterBars[0] && d.bars.length <= LIMITS.meterBars[1] &&
      d.bars.every((b: any) => isText(b?.label, LIMITS.meterLabel) && typeof b.value === 'number' && Number.isFinite(b.value) && b.value >= -1 && b.value <= 1) && isText(d.total, LIMITS.meterTotal) :
    false;
  if (!ok) throw Error(`${where}: 図解が不正（type=${d?.type}）`);
  if (d.illustration !== undefined && !(DIAGRAM_ILLUSTRATIONS as readonly string[]).includes(d.illustration)) throw Error(`${where}: 未対応の図解イラスト（illustration=${d.illustration}）`);
  if (d.archetype !== undefined && !(SCENE_ARCHETYPES as readonly string[]).includes(d.archetype)) throw Error(`${where}: 未対応の場面型（archetype=${d.archetype}）`);
  if (d.focus !== undefined && !isText(d.focus, 30)) throw Error(`${where}: focusは30字以内の文字列`);
  if (d.motionPurpose !== undefined && !isText(d.motionPurpose, 40)) throw Error(`${where}: motionPurposeは40字以内の文字列`);
  if (d.motion !== undefined && !(d.type === 'flow' && d.motion === 'travel')) throw Error(`${where}: motionはflowの'travel'だけ`);
}

// 段の表示開始秒（T106）。段数と同じ長さ、先頭は0、昇順、場面の秒数未満。
function checkReveal(d: any, seconds: number, where: string) {
  if (d.reveal === undefined) return;
  const r = d.reveal;
  if (!Array.isArray(r) || r.length !== diagramSteps(d) || r[0] !== 0 || r.some((t: unknown, k: number) => typeof t !== 'number' || !Number.isFinite(t) || t >= seconds || (k > 0 && t <= r[k - 1]))) throw Error(`${where}: revealは段数（${diagramSteps(d)}）と同じ長さで、0から始まる昇順・場面の秒数未満`);
}

export function validatePlanV2(p: any): Plan {
  if (!p || p.schema !== 2) throw Error('schema 2 ではありません');
  if (!/^[-a-z0-9]+$/.test(p.id) || !isText(p.title, 60) || !Number.isInteger(p.version) || p.version < 1) throw Error('不正な企画（id/title/version）');
  if (!Array.isArray(p.sources)) throw Error('sourcesが必要');
  if (p.promise !== undefined && !isText(p.promise, LIMITS.promise)) throw Error(`promiseは${LIMITS.promise}字以内`);
  if (p.style !== undefined && (typeof p.style !== 'object' || (p.style.transitions !== undefined && typeof p.style.transitions !== 'boolean'))) throw Error('style.transitionsは真偽値');
  if (p.thumbnail !== undefined) {
    const t = p.thumbnail;
    if (!isText(t?.headline, LIMITS.thumbHeadline) || (t.sub !== undefined && !isText(t.sub, LIMITS.thumbSub))) throw Error(`thumbnailの見出しは${LIMITS.thumbHeadline}字、補足は${LIMITS.thumbSub}字以内`);
    if (t.typography !== undefined) validateTypography(t.typography, t.headline);
    if (t.scene !== undefined && (!Number.isInteger(t.scene) || t.scene < 1 || t.scene > p.scenes.length)) throw Error('thumbnail.sceneは場面番号（1始まり）');
    if (t.keyword !== undefined && !isText(t.keyword, LIMITS.thumbKeyword)) throw Error(`thumbnail.keywordは${LIMITS.thumbKeyword}字以内`);
    if (t.contrast !== undefined && !(Array.isArray(t.contrast) && t.contrast.length === 2 && t.contrast.every((x: unknown) => isText(x, LIMITS.thumbContrast)))) throw Error(`thumbnail.contrastは2つの文言（各${LIMITS.thumbContrast}字以内）`);
  }
  if (p.glossary !== undefined) {
    if (!Array.isArray(p.glossary) || p.glossary.length > LIMITS.glossary) throw Error(`glossaryは${LIMITS.glossary}語まで`);
    const terms = new Set<string>();
    for (const g of p.glossary) {
      if (!isText(g?.term, LIMITS.term) || !isText(g?.definition, LIMITS.definition) || terms.has(g.term)) throw Error(`不正な用語: ${g?.term}`);
      terms.add(g.term);
    }
  }
  if (p.theme !== undefined && !(THEMES as readonly string[]).includes(p.theme)) throw Error(`不明なtheme（${p.theme}）。${THEMES.join('/')}のいずれか`);
  if (p.note !== undefined && typeof p.note !== 'string') throw Error('noteは文字列');
  if (p.production !== undefined && (!['production', 'demo'].includes(p.production?.mode) || typeof p.production.project !== 'string')) throw Error('productionは{mode: production|demo, project}');
  const ids = new Set<string>();
  for (const s of p.sources) {
    if (!/^[a-z0-9-]+$/.test(s?.id) || ids.has(s.id) || !isText(s.title, 120) || !/^https:\/\/\S+$/.test(s.url) || !/^\d{4}-\d{2}-\d{2}$/.test(s.accessedAt)) throw Error(`不正な出典: ${s?.id}`);
    ids.add(s.id);
  }
  if (p.intro !== undefined) {
    const t = p.intro;
    if (!isText(t?.text, LIMITS.intro)) throw Error(`introの本文は1〜${LIMITS.intro}字`);
    if (!Array.isArray(t.sources) || t.sources.some((id: unknown) => typeof id !== 'string' || !ids.has(id))) throw Error('introのsourcesは定義済みの出典id');
    if (t.fictional !== undefined && typeof t.fictional !== 'boolean') throw Error('intro.fictionalは真偽値');
  }
  if (p.aiDisclosure !== undefined) {
    const d = p.aiDisclosure;
    if (!isTextList(d?.scopes, [1, LIMITS.aiScopes], LIMITS.aiScope)) throw Error(`aiDisclosure.scopesは1〜${LIMITS.aiScopes}項目、各${LIMITS.aiScope}字以内`);
    if (!isText(d?.supervisor, LIMITS.aiSupervisor)) throw Error(`aiDisclosure.supervisorは${LIMITS.aiSupervisor}字以内`);
    if (!isTextList(d?.verified, [1, LIMITS.aiVerified], LIMITS.aiVerifiedItem)) throw Error(`aiDisclosure.verifiedは1〜${LIMITS.aiVerified}項目、各${LIMITS.aiVerifiedItem}字以内`);
    if (d?.realisticSyntheticMedia !== undefined && typeof d.realisticSyntheticMedia !== 'boolean') throw Error('aiDisclosure.realisticSyntheticMediaは真偽値');
  }
  if (!Array.isArray(p.scenes) || !p.scenes.length || p.scenes.length > LIMITS.scenes) throw Error(`場面数は1〜${LIMITS.scenes}`);
  let total = 0;
  p.scenes.forEach((s: any, i: number) => {
    const where = `場面${i + 1}`;
    const [minS, maxS] = LIMITS.sceneSeconds;
    if (!Number.isInteger(s?.seconds) || s.seconds < minS || s.seconds > maxS) throw Error(`${where}: 秒数は${minS}〜${maxS}の整数`);
    if (!isText(s.title, LIMITS.title)) throw Error(`${where}: 見出しが不正`);
    if (!isText(s.narration, s.seconds * LIMITS.narrationCharsPerSecond)) throw Error(`${where}: ナレーションが空か、${s.seconds}秒に対して長すぎる`);
    if (!Array.isArray(s.cues) || !s.cues.length) throw Error(`${where}: 字幕cueが必要`);
    let cueTotal = 0;
    for (const c of s.cues) {
      if (!isText(c?.text, LIMITS.cueText) || typeof c.seconds !== 'number' || !(c.seconds >= 0.5)) throw Error(`${where}: 字幕cueが不正`);
      cueTotal += c.seconds;
    }
    if (Math.abs(cueTotal - s.seconds) > 1e-6) throw Error(`${where}: 字幕cueの合計${cueTotal}秒が場面の${s.seconds}秒と一致しない`);
    checkDiagram(s.diagram, where);
    checkReveal(s.diagram, s.seconds, where);
    if (s.role !== undefined && !(ROLES as readonly string[]).includes(s.role)) throw Error(`${where}: 不明なrole（${s.role}）`);
    if (s.beat !== undefined && !(BEATS as readonly string[]).includes(s.beat)) throw Error(`${where}: 不明なbeat（${s.beat}）`);
    if (s.fictional !== undefined && typeof s.fictional !== 'boolean') throw Error(`${where}: fictionalは真偽値`);
    if (s.emphasis !== undefined && !isTextList(s.emphasis, LIMITS.emphasisItems, LIMITS.emphasisItem)) throw Error(`${where}: emphasisは1〜3語、各${LIMITS.emphasisItem}字以内`);
    if (!Array.isArray(s.sources) || s.sources.some((id: unknown) => typeof id !== 'string' || !ids.has(id))) throw Error(`${where}: 存在しない出典を参照`);
    if (s.practice !== undefined) {
      if (!isTextList(s.practice, [1, LIMITS.practiceItems], LIMITS.practiceItem)) throw Error(`${where}: practiceは1〜12項目、各80字以内`);
      const sentences = s.narration.match(/[^。！？!?\n]+[。！？!?]?/g)?.map((t: string) => t.trim()) ?? [];
      if (s.practice.some((t: string) => /[<>\x00-\x1f\x7f]/.test(t) || t !== t.trim() || !sentences.includes(t))) throw Error(`${where}: practiceはナレーションの原文の一文（制御文字・<>不可）`);
      if (!s.sources.length && s.fictional !== true) throw Error(`${where}: practiceには出典かfictional: trueが必要`);
    }
    total += s.seconds;
  });
  if (total > LIMITS.totalSeconds) throw Error(`総尺${total}秒が上限${LIMITS.totalSeconds}秒を超える`);
  if (p.scenes.reduce((n: number, s: Scene) => n + (s.practice?.length ?? 0), 0) > LIMITS.practiceItems) throw Error('practiceは台本全体で12項目まで');
  const actions = p.scenes.filter((s: Scene) => s.role === 'action');
  if (actions.length > 1) throw Error('actionは末尾に1場面まで');
  if (actions.length) {
    const index = p.scenes.indexOf(actions[0]);
    if (index < p.scenes.length - 2 || !p.scenes.some((s: Scene) => s.practice?.length) || !actions[0].narration.includes('チェックリスト') || !actions[0].cues.some((c: Cue) => c.text.includes('チェックリスト'))) throw Error('actionは末尾2場面以内で、practiceとナレーション・字幕のチェックリスト案内が必要');
  }
  // 章（T080）: 使うなら全場面に付け、同じ章は連続させる。
  const named = p.scenes.filter((s: any) => s.chapter !== undefined).length;
  if (named && named !== p.scenes.length) throw Error('chapterは全場面に付ける（一部だけは不可）');
  if (named) {
    const seen = new Set<string>();
    p.scenes.forEach((s: any, i: number) => {
      if (!isText(s.chapter, LIMITS.chapter)) throw Error(`場面${i + 1}: chapterは${LIMITS.chapter}字以内`);
      if (i > 0 && s.chapter !== p.scenes[i - 1].chapter && seen.has(s.chapter)) throw Error(`場面${i + 1}: 章「${s.chapter}」が連続していない`);
      seen.add(s.chapter);
    });
  }
  return p as Plan;
}

export function toV2(v1: PlanV1): Plan {
  return {
    schema: 2, id: v1.id, title: v1.title, version: v1.version, sources: [],
    scenes: v1.scenes.map(s => ({
      title: s.title, narration: s.subtitle, cues: [{text: s.subtitle, seconds: s.seconds}],
      diagram: {type: 'flow', items: s.nodes}, sources: [], seconds: s.seconds,
    })),
  };
}

// v1/v2のどちらでも受け取り、検証済みのv2を返す。
export function loadPlan(raw: unknown): Plan {
  const p = raw as any;
  return p?.schema === 2 ? validatePlanV2(p) : validatePlanV2(toV2(validateV1(p)));
}

export const totalSeconds = (p: {scenes: {seconds: number}[]}) => p.scenes.reduce((n, s) => n + s.seconds, 0);

// 章の一覧（T080）。chapterがない台本は空配列。T074のチャプター（タイムスタンプ）にも使う。
export type Chapter = {index: number; title: string; startSeconds: number; seconds: number; scenes: number[]};
export function chaptersOf(plan: Plan): Chapter[] {
  const out: Chapter[] = [];
  let start = 0;
  plan.scenes.forEach((s, i) => {
    if (s.chapter === undefined) return;
    const last = out.at(-1);
    if (last && last.title === s.chapter) {
      last.seconds += s.seconds;
      last.scenes.push(i);
    } else {
      out.push({index: out.length + 1, title: s.chapter, startSeconds: start, seconds: s.seconds, scenes: [i]});
    }
    start += s.seconds;
  });
  return out;
}

// 字幕最適化（T174）
export {tokenizeJapanesePhrases, optimizeSubtitleLines, splitSmartCues} from './subtitle-optimizer.ts';
