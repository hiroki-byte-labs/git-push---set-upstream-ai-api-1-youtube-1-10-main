// 台本の安全検査（T042）。prompts/script.md の禁止事項を機械的に確かめる安全網。
// 意味の理解や法的な適合性の保証はしない。errorがあれば制作を止め、warningは記録だけする。
import type {Plan, Diagram} from './plan.ts';
import {chaptersOf, BEATS, thumbnailText} from './plan.ts';

export type Finding = {level: 'error' | 'warning'; rule: string; where: string; text: string; message: string};
export type LintResult = {ok: boolean; errors: number; warnings: number; findings: Finding[]};

// 禁止表現。正規表現は誤検出より見逃しを減らす方向で選び、該当時は人が文面を直す。
export const FORBIDDEN: {rule: string; pattern: RegExp; message: string}[] = [
  {rule: 'guarantee', pattern: /(必ず|絶対に?|確実に|間違いなく)(儲|もう|勝て|上が|増え|利益)/, message: '利益や値上がりを保証する表現'},
  {rule: 'guarantee', pattern: /元本(保証|割れ(し|は)ない)|損(は|を)?しない|リスク(は)?(ゼロ|なし|ありません)/, message: '損失がないと誤認させる表現'},
  {rule: 'recommendation', pattern: /(今すぐ|今が)(買|売)|(買う|売る|買い増す)べき|(おすすめ|推奨|注目)の?銘柄|この銘柄を?(買|仕込)/, message: '売買の推奨・勧誘'},
  {rule: 'specific-security', pattern: /(銘柄|証券)コード\s*[:：]?\s*\d{4}|\d{4}\s*[（(](株|銘柄)/, message: '個別銘柄の特定'},
  {rule: 'hype', pattern: /爆上げ|爆益|億り人|急騰確定|一攫千金|放置で稼|誰でも(稼|儲)/, message: '煽り表現'},
];

// 出典が必要な数値表現（割合・倍率・金額・利回り）。
export const NUMERIC_CLAIM = /\d[\d,.]*\s*(%|％|パーセント|倍|円|万円|億円|兆円|ドル)|年率|利回り/;

// 本番尺（3分以上）では構成ルールの違反をerror、それより短い試作ではwarningにする（T075〜）。
export const LONG_FORM_SECONDS = 180;
export const HOOK_WITHIN_SECONDS = 30;
// 章の長さの目安（E1: 視聴時間の中央値は最大約6分）。
export const CHAPTER_MAX_SECONDS = 360;
// 会話調の目安（T082）。一人称・二人称・勧誘の表現。
export const CONVERSATIONAL = /あなた|私たち|わたしたち|私|わたし|みなさん|皆さん|一緒に|ましょう|ませんか/;
export const STIFF_ENDING = /(である|だ|のだ)$/;
export const STIFF_RATIO = 0.3;
type Add = (level: Finding['level'], rule: string, where: string, text: string, message: string) => void;

function checkStructure(plan: Plan, add: Add) {
  const total = plan.scenes.reduce((n, s) => n + s.seconds, 0);
  const level: Finding['level'] = total >= LONG_FORM_SECONDS ? 'error' : 'warning';
  // 冒頭: 30秒以内に始まる場面に、問いを含むhookを置き、promise（得られること）を宣言する（T075）。
  if (!plan.promise) add(level, 'promise-missing', '台本', '', 'promise（この動画で得られること）が必要');
  let start = 0;
  const opening: number[] = [];
  plan.scenes.forEach((s, i) => {
    if (start < HOOK_WITHIN_SECONDS) opening.push(i);
    start += s.seconds;
  });
  const hooks = opening.filter(i => plan.scenes[i].role === 'hook');
  if (!hooks.length) add(level, 'hook-missing', `冒頭${HOOK_WITHIN_SECONDS}秒`, '', 'role=hookの場面を冒頭30秒以内に置く');
  else if (!hooks.some(i => /[？?]/.test(plan.scenes[i].narration))) add(level, 'hook-question', `場面${hooks[0] + 1}`, plan.scenes[hooks[0]].narration, 'hookのナレーションに視聴者への問い（？）を入れる');

  // 章（T080）: 本番尺は章立て必須。章は約6分以内。導入章以外は、まとめか問いの場面で区切る。
  const chapters = chaptersOf(plan);
  if (!chapters.length) add(level, 'chapter-missing', '台本', '', '章（chapter）で約6分以内に分割する');
  for (const c of chapters) {
    const where = `第${c.index}章「${c.title}」`;
    if (c.seconds > CHAPTER_MAX_SECONDS) add('warning', 'chapter-too-long', where, '', `${c.seconds}秒。約${CHAPTER_MAX_SECONDS / 60}分以内に分ける`);
    const roles = c.scenes.map(i => plan.scenes[i].role);
    if (chapters.length >= 2 && !roles.includes('hook') && !roles.some(r => r === 'recap' || r === 'question')) add('warning', 'chapter-recap', where, '', '章の中にまとめ（recap）か問い（question）の場面を入れる');
  }

  // 物語と具体例（T081）。具体例は「架空」か「出典つきの実例」かを必ず区別する（常にerror）。
  const stories = plan.scenes.map((s, i) => ({s, i})).filter(({s}) => s.role === 'example' || s.beat);
  if (!stories.length) add(level, 'story-missing', '台本', '', '具体例（role=example）か物語（beat）の場面を入れる');
  // 出来事を語る場面（具体例、状況、葛藤）だけが対象。気づき・学びは一般化なので対象外。
  for (const {s, i} of stories.filter(({s}) => s.role === 'example' || s.beat === 'situation' || s.beat === 'conflict')) {
    if (!s.fictional && !s.sources.length) add('error', 'example-label', `場面${i + 1}`, s.title, '具体例・物語はfictional: true（架空）か出典つきの実例にする');
  }
  plan.scenes.forEach((s, i) => {
    if (/例えば|たとえば/.test(s.narration) && s.role !== 'example' && !s.beat && !s.fictional && !s.sources.length) add('warning', 'example-unmarked', `場面${i + 1}`, s.narration, '「例えば」の場面はrole=exampleにして、架空か出典つきかを示す');
  });
  const beats = plan.scenes.map(s => s.beat).filter((b): b is NonNullable<typeof b> => Boolean(b));
  if (beats.length) {
    const order = beats.map(b => BEATS.indexOf(b));
    if (order.some((o, k) => k > 0 && o < order[k - 1])) add('warning', 'story-order', '台本', beats.join('→'), '物語は状況→葛藤→気づき→学びの順に置く');
    for (const need of ['situation', 'conflict', 'lesson'] as const) if (!beats.includes(need)) add('warning', 'story-incomplete', '台本', beats.join('→'), `物語に${need}がない`);
  }

  // 用語の先出し（T083、E15）。用語が初めて出る場面までに、glossaryの場面か「用語とは」で説明する。
  for (const g of plan.glossary ?? []) {
    const texts = plan.scenes.map(s => [s.title, s.narration, ...s.cues.map(c => c.text), ...diagramTexts(s.diagram)].join('\n'));
    const first = texts.findIndex(t => t.includes(g.term));
    if (first < 0) {
      add('warning', 'glossary-unused', `用語「${g.term}」`, '', 'どの場面にも出てこない');
      continue;
    }
    const explained = plan.scenes.slice(0, first + 1).some(s => (s.role === 'glossary' && s.narration.includes(g.term)) || s.narration.includes(`${g.term}とは`));
    if (!explained) add('warning', 'glossary-late', `用語「${g.term}」`, plan.scenes[first].title, `場面${first + 1}で初めて出るが、それまでに説明がない（role=glossaryの場面か「${g.term}とは」）`);
  }

  // キーワード強調（T078）: 強調語はその場面のナレーションに含まれる語にする（信号化。E12、E13）。
  plan.scenes.forEach((s, i) => {
    for (const w of s.emphasis ?? []) if (!s.narration.includes(w)) add('warning', 'emphasis-unused', `場面${i + 1}`, w, '強調語がナレーションに出てこない');
  });

  // 会話調（T082、E7）。自動判定は目安のためwarningのみ。
  const narration = plan.scenes.map(s => s.narration).join('\n');
  if (!CONVERSATIONAL.test(narration)) add('warning', 'conversational-missing', 'ナレーション', '', '視聴者への語りかけ（あなた、私たち、〜しましょう等）がない');
  const sentences = narration.split(/[。！？!?\n]/).map(x => x.trim()).filter(Boolean);
  const stiff = sentences.filter(x => STIFF_ENDING.test(x)).length;
  if (sentences.length && stiff / sentences.length > STIFF_RATIO) add('warning', 'stiff-style', 'ナレーション', `${stiff}/${sentences.length}文`, `「である・だ」調が${Math.round(STIFF_RATIO * 100)}%を超える。です・ます調の語りかけにする`);
}

// 免責の判定（T097）。意味の理解ではなく、検証できる狭い規則にする。
// 文（。！？で区切る）に「推奨」「保証」があれば、その文の述語（文末）が否定（ません・ない等）でなければならない。
// 文末が否定の文に出た語を「しない」と判定する（「推奨や利益の保証はしません」は両方）。
// 一文に否定と肯定が混ざる（「推奨はしませんが、保証します」）と文末が肯定になり、肯定として拒否する。
export const DISCLAIMER_TERMS = ['推奨', '保証'] as const;
const NEGATED_END = /(ません|ない|ないです)$/;
export function checkDisclaimer(text: string) {
  const sentences = text.split(/[。！？!?\n]/).map(s => s.trim().replace(/[」』）)]+$/, '')).filter(Boolean);
  const negated = new Set<string>();
  const affirmative: string[] = [];
  for (const s of sentences) {
    const terms = DISCLAIMER_TERMS.filter(t => s.includes(t));
    if (!terms.length) continue;
    if (NEGATED_END.test(s)) terms.forEach(t => negated.add(t));
    else affirmative.push(s);
  }
  return {affirmative, missing: DISCLAIMER_TERMS.filter(t => !negated.has(t))};
}

const diagramTexts = (d: Diagram): string[] =>
  d.type === 'flow' ? d.items :
  d.type === 'compare' ? [d.left, d.right, ...d.leftItems, ...d.rightItems] :
  d.type === 'number' ? [d.value, d.label, d.note ?? ''] :
  [d.question, d.yes, d.no];

export function lintPlan(plan: Plan): LintResult {
  const findings: Finding[] = [];
  const add = (level: Finding['level'], rule: string, where: string, text: string, message: string) => findings.push({level, rule, where, text, message});

  plan.scenes.forEach((s, i) => {
    const texts: [string, string][] = [
      ['見出し', s.title], ['ナレーション', s.narration],
      ...s.cues.map((c, k): [string, string] => [`字幕${k + 1}`, c.text]),
      ...diagramTexts(s.diagram).map((t): [string, string] => ['図解', t]),
    ];
    for (const [part, text] of texts) {
      const where = `場面${i + 1}/${part}`;
      for (const f of FORBIDDEN) if (f.pattern.test(text)) add('error', f.rule, where, text, f.message);
      if (NUMERIC_CLAIM.test(text) && !s.sources.length) add('error', 'unsourced-number', where, text, '数値表現には出典（scene.sources）が必要');
    }
  });

  checkStructure(plan, add);

  // サムネイルの文言も禁止表現の対象（T073）。中身と一致しない煽りを防ぐ。
  // 描画と同じ最終文言を検査する。省略時に代替される題名・promiseも対象（T096）。
  const thumb = thumbnailText(plan);
  for (const [t, from] of [[thumb.headline, thumb.headlineFrom], [thumb.sub, thumb.subFrom]]) if (t) for (const f of FORBIDDEN) if (f.pattern.test(t)) add('error', f.rule, 'サムネイル', t, `${f.message}（描画する文言。${from}から）`);

  // 最終場面に免責（推奨しない・保証しない）を含める（T042、T097）。ナレーション（聞く人）と字幕（見る人）の両方に必要。
  const last = plan.scenes.at(-1)!;
  const where = `場面${plan.scenes.length}`;
  for (const [part, text] of [['ナレーション', last.narration], ['字幕', last.cues.map(c => c.text).join('')]] as const) {
    const d = checkDisclaimer(text);
    for (const s of d.affirmative) add('error', 'disclaimer-affirmative', `${where}/${part}`, s, '最終場面で推奨・保証を肯定している。免責は「推奨しません」「保証しません」のように否定文で書く');
    if (d.missing.length) add('error', 'disclaimer', `${where}/${part}`, '', `最終場面の${part}に「${d.missing.join('・')}しない」旨の免責が必要（否定文）`);
  }

  // 定義したのに使っていない出典は、記載漏れか不要な出典の可能性がある。
  const used = new Set(plan.scenes.flatMap(s => s.sources));
  for (const src of plan.sources) if (!used.has(src.id)) add('warning', 'unused-source', `出典${src.id}`, src.title, 'どの場面からも参照されていない');

  const errors = findings.filter(f => f.level === 'error').length;
  return {ok: errors === 0, errors, warnings: findings.length - errors, findings};
}

// 台本以外の文言（タイトル・概要欄）にも禁止表現の規則を当てる（T074）。
export function lintText(text: string): Finding[] {
  return FORBIDDEN.filter(f => f.pattern.test(text)).map(f => ({level: 'error' as const, rule: f.rule, where: 'テキスト', text, message: f.message}));
}

export function formatLint(r: LintResult) {
  const lines = r.findings.map(f => `${f.level === 'error' ? 'ERROR' : 'WARN '} [${f.rule}] ${f.where}: ${f.message}${f.text ? ` 「${f.text}」` : ''}`);
  lines.push(`安全検査: error ${r.errors} / warning ${r.warnings}`);
  return lines.join('\n');
}
