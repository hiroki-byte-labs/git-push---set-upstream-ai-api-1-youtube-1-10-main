// 台本形式 v2（T041）。長尺・ナレーション・字幕cue・図解4種・出典を表現する。
// v1（fixtures/sample.json の形式、schema欄なし）は toV2() で自動変換する。
// v1の型と検証（M1のfixture形式。T041でproviders.tsから移設）。
export type SceneV1={title:string;subtitle:string;nodes:string[];seconds:number};
export type PlanV1={id:string;title:string;version:number;scenes:SceneV1[]};
export function validateV1(p:PlanV1):PlanV1{
 if(!p||!/^[-a-z0-9]+$/.test(p.id)||typeof p.title!=='string'||!Number.isInteger(p.version)||p.version<1||!Array.isArray(p.scenes)||!p.scenes.length||p.scenes.length>20)throw Error('不正な企画');
 for(const s of p.scenes)if(!s||typeof s.title!=='string'||!s.title.length||s.title.length>30||typeof s.subtitle!=='string'||!s.subtitle.length||s.subtitle.length>55||!Array.isArray(s.nodes)||s.nodes.length!==3||s.nodes.some(n=>typeof n!=='string'||!n.length||n.length>14)||!Number.isInteger(s.seconds)||s.seconds<2||s.seconds>30)throw Error('不正な場面');
 return p;
}

export type Diagram =
  | {type: 'flow'; items: string[]}
  | {type: 'compare'; left: string; right: string; leftItems: string[]; rightItems: string[]}
  | {type: 'number'; value: string; label: string; note?: string}
  | {type: 'branch'; question: string; yes: string; no: string};
export type Cue = {text: string; seconds: number};
// 場面の役割（T075〜）。構成の検査（src/lint.ts）に使う。省略時は本編（body）扱い。
export const ROLES = ['hook', 'body', 'recap', 'question', 'example', 'glossary'] as const;
// 物語の流れ（T081）。状況→葛藤→気づき→学びの順に置く。
export const BEATS = ['situation', 'conflict', 'insight', 'lesson'] as const;
export type Beat = typeof BEATS[number];
export type Role = typeof ROLES[number];
export type Scene = {title: string; narration: string; cues: Cue[]; diagram: Diagram; sources: string[]; seconds: number; role?: Role; chapter?: string; beat?: Beat; fictional?: boolean; emphasis?: string[]};
export type Source = {id: string; title: string; url: string; accessedAt: string};
// promise: この動画で視聴者が得られること（タイトル・冒頭で約束する内容。T075）。glossary: 先に説明する用語（T083）。
export type Term = {term: string; definition: string};
// thumbnail: サムネイルの見出し（T073）。省略時は台本の題名。
export type Thumbnail = {headline: string; sub?: string; scene?: number};
// サムネイルに描く最終文言（T096）。見出しは省略時に題名、補足は省略時にpromise。
// 描画（buildThumbSpecs）と安全検査（lintPlan）はこの関数だけを使い、代替ルールを別に持たない。
export function thumbnailText(plan: Pick<Plan, 'title' | 'promise' | 'thumbnail'>) {
  return {
    headline: plan.thumbnail?.headline ?? plan.title,
    headlineFrom: plan.thumbnail?.headline !== undefined ? 'thumbnail.headline' : 'title',
    sub: plan.thumbnail?.sub ?? plan.promise ?? '',
    subFrom: plan.thumbnail?.sub !== undefined ? 'thumbnail.sub' : plan.promise !== undefined ? 'promise' : 'なし',
  };
}
// style.transitions=falseで段階表示のフェード・強調を止める（T079）。
export type Style = {transitions?: boolean};
export type Plan = {schema: 2; id: string; title: string; version: number; scenes: Scene[]; sources: Source[]; promise?: string; glossary?: Term[]; thumbnail?: Thumbnail; style?: Style};

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
    false;
  if (!ok) throw Error(`${where}: 図解が不正（type=${d?.type}）`);
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
    if (t.scene !== undefined && (!Number.isInteger(t.scene) || t.scene < 1 || t.scene > p.scenes.length)) throw Error('thumbnail.sceneは場面番号（1始まり）');
  }
  if (p.glossary !== undefined) {
    if (!Array.isArray(p.glossary) || p.glossary.length > LIMITS.glossary) throw Error(`glossaryは${LIMITS.glossary}語まで`);
    const terms = new Set<string>();
    for (const g of p.glossary) {
      if (!isText(g?.term, LIMITS.term) || !isText(g?.definition, LIMITS.definition) || terms.has(g.term)) throw Error(`不正な用語: ${g?.term}`);
      terms.add(g.term);
    }
  }
  const ids = new Set<string>();
  for (const s of p.sources) {
    if (!/^[a-z0-9-]+$/.test(s?.id) || ids.has(s.id) || !isText(s.title, 120) || !/^https:\/\/\S+$/.test(s.url) || !/^\d{4}-\d{2}-\d{2}$/.test(s.accessedAt)) throw Error(`不正な出典: ${s?.id}`);
    ids.add(s.id);
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
    if (s.role !== undefined && !(ROLES as readonly string[]).includes(s.role)) throw Error(`${where}: 不明なrole（${s.role}）`);
    if (s.beat !== undefined && !(BEATS as readonly string[]).includes(s.beat)) throw Error(`${where}: 不明なbeat（${s.beat}）`);
    if (s.fictional !== undefined && typeof s.fictional !== 'boolean') throw Error(`${where}: fictionalは真偽値`);
    if (s.emphasis !== undefined && !isTextList(s.emphasis, LIMITS.emphasisItems, LIMITS.emphasisItem)) throw Error(`${where}: emphasisは1〜3語、各${LIMITS.emphasisItem}字以内`);
    if (!Array.isArray(s.sources) || s.sources.some((id: unknown) => typeof id !== 'string' || !ids.has(id))) throw Error(`${where}: 存在しない出典を参照`);
    total += s.seconds;
  });
  if (total > LIMITS.totalSeconds) throw Error(`総尺${total}秒が上限${LIMITS.totalSeconds}秒を超える`);
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
