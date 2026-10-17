// T178: authored chapter text -> deterministic Plan v2. This never calls an LLM
// or turns the caller's citation record into an independently verified fact.
import {createHash} from 'node:crypto';
import {LIMITS, REFLECTION_PLACEHOLDER, validatePlanV2, totalSeconds} from './plan.ts';
import type {Plan, Diagram, Source, Scene} from './plan.ts';
import {splitSmartCues} from './subtitle-optimizer.ts';
import {lintPlan} from './lint.ts';
import {validateClaim} from './fact-check.ts';
import type {ClaimRecord} from './fact-check.ts';

export const METAPHORS = ['Spotlight', 'MetricBar', 'CausalFlow', 'SilhouetteGroup', 'CollageScene'] as const;
export type Metaphor = typeof METAPHORS[number];
export type DocumentarySource = Source & {year: number; primary: true};
export type CheckedPassage = ClaimRecord & {id: string; textSha256: string; locator: string; checkedBy: string};
export type DocumentaryParagraph = {
  text: string; kind: 'claim' | 'inference' | 'fictional';
  checkId?: string; metaphor: Metaphor; purpose: string; diagram: Diagram;
};
export type DocumentaryChapter = {title: string; reflection?: boolean; paragraphs: DocumentaryParagraph[]};
export type DocumentaryInput = {
  schema: 1; id: string; title: string; promise: string; intro: {text: string; fictional: true} | {text: string; checkId: string};
  hooks: [string, string]; sources: DocumentarySource[]; checks: CheckedPassage[];
  chapters: DocumentaryChapter[]; charsPerSecond?: number;
};
export const textSha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const nonempty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

export function compileDocumentary(input: DocumentaryInput) {
  if (!input || input.schema !== 1) throw Error('documentary schema 1が必要');
  const rate = input.charsPerSecond ?? 5.5;
  if (!Number.isFinite(rate) || rate < 5.2 || rate > 5.8) throw Error('話速は5.2〜5.8字/秒');
  if (!Array.isArray(input.hooks) || input.hooks.length !== 2 || input.hooks.some(h => !nonempty(h)) || input.hooks[0] === input.hooks[1]) throw Error('異なる学術フックが2件必要');
  if (!Array.isArray(input.chapters) || input.chapters.length < 6 || input.chapters.length > 8) throw Error('章数は6〜8');
  if (new Set(input.chapters.map(c => c.title)).size !== input.chapters.length) throw Error('章題の重複');
  if (input.chapters.filter(c => c.reflection === true).length !== 1) throw Error('本人考察の章が1つ必要');
  if (input.chapters[0].reflection || input.chapters.at(-1)!.reflection) throw Error('本人考察は導入と結びの間');
  if (!Array.isArray(input.sources) || input.sources.length < 2) throw Error('一次資料が2件以上必要');
  for (const source of input.sources) {
    if (source.primary !== true || !Number.isInteger(source.year) || source.year < 1000 || source.year > 9999) throw Error('一次資料と発表年が必要');
  }
  const sources = new Map(input.sources.map(s => [s.id, s]));
  const checks = new Map<string, CheckedPassage>();
  if (!Array.isArray(input.checks)) throw Error('checksが必要');
  for (const check of input.checks) {
    validateClaim(check, checks.size);
    const source = sources.get(check.sourceId);
    if (!nonempty(check.id) || checks.has(check.id)) throw Error('照合IDの欠落・重複');
    if (!source || check.url !== source.url) throw Error('照合URLと一次資料が不一致');
    if (!nonempty(check.locator) || !nonempty(check.checkedBy)) throw Error('照合箇所・確認者が必要');
    if (check.status === 'unverified' || check.textSha256 !== textSha256(check.claim)) throw Error('未確認または照合本文のhash不一致');
    checks.set(check.id, check);
  }
  const scenes: Scene[] = [];
  const directives: {scene: number; metaphor: Metaphor; purpose: string; checkId?: string}[] = [];
  const usedChecks = new Set<string>();
  let introSources: string[] = [];
  if (!input.intro || !nonempty(input.intro.text)) throw Error('導入文が必要');
  if (!('fictional' in input.intro && input.intro.fictional === true)) {
    const check = checks.get('checkId' in input.intro ? input.intro.checkId : '');
    if (!check || check.claim !== input.intro.text) throw Error('導入文の照合記録が不一致');
    introSources = [check.sourceId]; usedChecks.add(check.id);
  }
  let chars = 0;
  for (const chapter of input.chapters) {
    if (!Array.isArray(chapter.paragraphs)) throw Error('paragraphsが必要');
    if (chapter.reflection) {
      if (chapter.paragraphs.length) throw Error('本人考察をエージェントが執筆しない');
      scenes.push({title: '本人の考察', chapter: chapter.title, role: 'reflection', narration: REFLECTION_PLACEHOLDER,
        cues: [{text: REFLECTION_PLACEHOLDER, seconds: 10}], seconds: 10, sources: [],
        diagram: {type: 'flow', items: ['問い', '調べたこと', '自分の考え']}});
      continue;
    }
    if (!chapter.paragraphs.length) throw Error('考察以外の章には本文が必要');
    for (const paragraph of chapter.paragraphs) {
      if (!nonempty(paragraph.text) || !nonempty(paragraph.purpose) || !(METAPHORS as readonly string[]).includes(paragraph.metaphor)) throw Error('本文・視覚指示・目的が必要');
      if (!['claim', 'inference', 'fictional'].includes(paragraph.kind)) throw Error('主張/推論/架空を区別する');
      const sourceIds: string[] = [];
      if (paragraph.kind !== 'fictional') {
        const check = checks.get(paragraph.checkId ?? '');
        if (!check || check.claim !== paragraph.text || check.textSha256 !== textSha256(paragraph.text)) throw Error('段落本文と照合記録が不一致');
        if (paragraph.kind === 'claim' && check.status !== 'verified') throw Error('主張にはverifiedの照合記録が必要');
        if (paragraph.kind === 'inference' && (check.status !== 'inference' || !nonempty(check.note))) throw Error('推論には根拠と推論である旨の記録が必要');
        sourceIds.push(check.sourceId); usedChecks.add(check.id);
      } else if (paragraph.checkId) throw Error('架空例を一次資料照合済みにしない');
      chars += [...paragraph.text].length;
      // Split before allocating scene time; cue contents are preserved exactly.
      const parts = splitSmartCues(paragraph.text, 120);
      for (const part of parts) {
        const seconds = Math.max(2, Math.ceil([...part].length / rate));
        const cueTexts = splitSmartCues(part, LIMITS.cueText);
        const length = [...part].length;
        let allocated = 0;
        const cues = cueTexts.map((text, i) => {
          const duration = i === cueTexts.length - 1 ? seconds - allocated : Math.max(0.5, seconds * [...text].length / length);
          allocated += duration; return {text, seconds: duration};
        });
        scenes.push({title: chapter.title, chapter: chapter.title, narration: part, cues, seconds,
          role: scenes.length === 0 ? 'hook' : paragraph.kind === 'fictional' ? 'example' : 'body',
          fictional: paragraph.kind === 'fictional', sources: sourceIds, diagram: structuredClone(paragraph.diagram)});
        directives.push({scene: scenes.length, metaphor: paragraph.metaphor, purpose: paragraph.purpose, ...(paragraph.checkId ? {checkId: paragraph.checkId} : {})});
      }
    }
  }
  if (chars < 5000 || chars > 8000) throw Error(`本文${chars}字: 5000〜8000字が必要（考察未入力分を除く）`);
  const duration = totalSeconds({scenes});
  if (duration < 600 || duration > 1200) throw Error(`総尺${duration}秒: 10〜20分に収める（字数または話速を調整）`);
  const plan = validatePlanV2({schema: 2, id: input.id, title: input.title, version: 1, theme: 'general',
    promise: input.promise, intro: {text: input.intro.text, fictional: 'fictional' in input.intro, sources: introSources}, sources: input.sources,
    note: '長尺台本の下書き。本人考察・本番題材選択・承認は未完了。視覚メタファーは指示であり新しい描画機能を意味しない。', scenes,
    documentary: {schema: 1, hooks: input.hooks, directives, checks: [...usedChecks].map(id => checks.get(id)),
      draftChars: chars, draftSeconds: duration, charsPerSecond: rate}});
  const lint = lintPlan(plan);
  const otherErrors = lint.findings.filter(f => f.level === 'error' && f.rule !== 'reflection-missing');
  if (otherErrors.length) throw Error('台本lint失敗: ' + otherErrors.map(f => `${f.rule}: ${f.message}`).join('\n'));
  return {plan, report: {draft: true, chars, seconds: duration, chapters: input.chapters.length,
    checksUsed: usedChecks.size, lint, readyForProduction: false as const}};
}
