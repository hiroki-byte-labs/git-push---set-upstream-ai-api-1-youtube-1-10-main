// T174: 字幕（VTT）の文節・助詞境界に基づく自然な改行・cue分割最適化
import {LIMITS} from './plan.ts';

const chars = (s: string) => [...s].length;

// 複合助詞・接続助詞（優先度の高い順）
const COMPOUND_PARTICLES = [
  'については', 'に関しては', 'に対して', 'にとって', 'によって',
  'としては', 'として', 'とともに', 'だけでなく', 'ばかりか',
  'けれども', 'けれど', 'ものの', 'ながら', 'たら', 'なら',
  'には', 'では', 'とは', 'へは', 'からも', 'までも', 'よりは',
  'ので', 'のに', 'から', 'まで', 'より', 'ほど', 'くらい', 'ばかり', 'など',
];

// 単一助詞
const SINGLE_PARTICLES = ['は', 'が', 'を', 'に', 'で', 'と', 'へ', 'も', 'の', 'や', 'か'];

// 句読点・記号
const SENTENCE_END_PUNCTS = new Set(['。', '！', '!', '？', '?']);
const COMMA_PUNCTS = new Set(['、', '，', ',']);
const CLOSING_BRACKETS = new Set(['」', '』', '）', ')', '】', ']', '〉', '》']);

export type BreakPriority = 'sentence' | 'comma' | 'compound_particle' | 'particle' | 'word' | 'none';

export type TextChunk = {
  text: string;
  breakPriority: BreakPriority;
};

/**
 * 日本語テキストを文節・助詞境界でチャンク（語＋助詞・記号）に分割する。
 * 元のテキストの文字・空白はすべて保存され、chunks.map(c => c.text).join('') === text が保証される。
 */
export function tokenizeJapanesePhrases(text: string): TextChunk[] {
  if (!text) return [];

  const rawChars = [...text];

  const chunks: TextChunk[] = [];
  let startIndex = 0;
  let i = 0;

  while (i < rawChars.length) {
    const ch = rawChars[i];

    // 1. 句点（。！？）での区切り
    if (SENTENCE_END_PUNCTS.has(ch)) {
      // 連続する句点や閉じ括弧を吸着
      while (i + 1 < rawChars.length && (SENTENCE_END_PUNCTS.has(rawChars[i + 1]) || CLOSING_BRACKETS.has(rawChars[i + 1]))) {
        i++;
      }
      chunks.push({
        text: rawChars.slice(startIndex, i + 1).join(''),
        breakPriority: 'sentence',
      });
      startIndex = i + 1;
      i++;
      continue;
    }

    // 2. 読点（、，,）での区切り
    if (COMMA_PUNCTS.has(ch)) {
      while (i + 1 < rawChars.length && (COMMA_PUNCTS.has(rawChars[i + 1]) || CLOSING_BRACKETS.has(rawChars[i + 1]))) {
        i++;
      }
      chunks.push({
        text: rawChars.slice(startIndex, i + 1).join(''),
        breakPriority: 'comma',
      });
      startIndex = i + 1;
      i++;
      continue;
    }

    // 3. 閉じ括弧
    if (CLOSING_BRACKETS.has(ch)) {
      chunks.push({
        text: rawChars.slice(startIndex, i + 1).join(''),
        breakPriority: 'comma',
      });
      startIndex = i + 1;
      i++;
      continue;
    }

    // 4. 助詞の判定
    // 助詞は自立語（漢字、カタカナ、英数字、またはひらがなの語幹）の後に続く場合に助詞と判定
    const currentSub = rawChars.slice(startIndex, i + 1).join('');
    const remaining = rawChars.slice(i).join('');

    // 複合助詞
    let matchedCompound = '';
    for (const p of COMPOUND_PARTICLES) {
      if (remaining.startsWith(p)) {
        matchedCompound = p;
        break;
      }
    }

    if (matchedCompound && chars(currentSub) > 0) {
      const pLen = chars(matchedCompound);
      const afterParticleIdx = i + pLen;
      // 助詞の直後に句読点があればそこまで吸着
      let endIdx = afterParticleIdx;
      while (endIdx < rawChars.length && (CLOSING_BRACKETS.has(rawChars[endIdx]) || COMMA_PUNCTS.has(rawChars[endIdx]))) {
        endIdx++;
      }
      chunks.push({
        text: rawChars.slice(startIndex, endIdx).join(''),
        breakPriority: 'compound_particle',
      });
      startIndex = endIdx;
      i = endIdx;
      continue;
    }

    // 単一助詞
    let matchedSingle = '';
    for (const p of SINGLE_PARTICLES) {
      if (remaining.startsWith(p)) {
        // 直前が漢字・カタカナ・英数字・ひらがな（開始点から少なくとも1文字以上）
        if (i > startIndex) {
          matchedSingle = p;
        }
        break;
      }
    }

    if (matchedSingle) {
      const afterSingleIdx = i + 1;
      let endIdx = afterSingleIdx;
      while (endIdx < rawChars.length && (CLOSING_BRACKETS.has(rawChars[endIdx]) || COMMA_PUNCTS.has(rawChars[endIdx]))) {
        endIdx++;
      }
      chunks.push({
        text: rawChars.slice(startIndex, endIdx).join(''),
        breakPriority: 'particle',
      });
      startIndex = endIdx;
      i = endIdx;
      continue;
    }

    i++;
  }

  if (startIndex < rawChars.length) {
    chunks.push({
      text: rawChars.slice(startIndex).join(''),
      breakPriority: 'none',
    });
  }

  return chunks;
}

/**
 * 日本語テキストを文節・助詞境界を尊重して1cueあたり最大max（既定55字）のcueに分割する。
 * cues.join('') === text が必ず成立する。
 */
export function splitSmartCues(
  text: string,
  max: number = LIMITS.cueText,
  targetChars = 32
): string[] {
  if (!text) return [];
  if (chars(text) <= max) return [text];

  const chunks = tokenizeJapanesePhrases(text);
  if (!chunks.length) return [text];

  const cues: string[] = [];
  let currentCue = '';

  for (let idx = 0; idx < chunks.length; idx++) {
    const chunk = chunks[idx];
    const candidate = currentCue + chunk.text;
    const candLen = chars(candidate);

    if (candLen <= max) {
      currentCue = candidate;

      // 目標文字数を超えており、かつ良い区切り（句点・読点・助詞）の場合に分割
      const shouldBreak =
        chunk.breakPriority === 'sentence' ||
        (candLen >= targetChars && (chunk.breakPriority === 'comma' || chunk.breakPriority === 'compound_particle')) ||
        (candLen >= targetChars + 6 && chunk.breakPriority === 'particle');

      // ただし残りの全チャンクが max 以下で収まるなら無理に分割せず続ける
      const remainingLen = chunks.slice(idx + 1).reduce((n, c) => n + chars(c.text), 0);
      if (shouldBreak && remainingLen > 0 && !(candLen + remainingLen <= max)) {
        cues.push(currentCue);
        currentCue = '';
      }
    } else {
      // candidate が max を超えたため手前で区切る
      if (currentCue) {
        cues.push(currentCue);
        currentCue = chunk.text;
      } else {
        // 単一チャンクが max を超える場合（滅多にないが上限強制）
        let rem = chunk.text;
        while (chars(rem) > max) {
          cues.push([...rem].slice(0, max).join(''));
          rem = [...rem].slice(max).join('');
        }
        currentCue = rem;
      }
    }
  }

  if (currentCue) {
    cues.push(currentCue);
  }

  // 短すぎるcue（末尾が5字未満）が直前と合算して max 以下なら統合
  if (cues.length >= 2) {
    const last = cues[cues.length - 1];
    const prev = cues[cues.length - 2];
    if (chars(last) <= 6 && chars(prev + last) <= max) {
      cues.pop();
      cues[cues.length - 1] = prev + last;
    }
  }

  return cues;
}

/**
 * 1行あたり maxLineLength（既定20字、15〜22字程度）に収まるよう、文節・助詞境界で自然に改行（\n）を入れる。
 * 単語の途中で泣き別れ（助詞の直前や熟語の途中での分断）を防ぐ。
 * T187: 貪欲に詰めると「ふり返りや／すく」のように、tokenizeの助詞判定が語中のひらがなで切った境界で改行していた。
 * 行数を最小にしたうえで、境界の質（句読点の後 < 次が漢字・カタカナ・英数字で始まる < 次がひらがなで始まる）と行の長さのそろい具合で選ぶ。
 * cue分割（splitSmartCues）が使うtokenizeJapanesePhrasesは変えない。
 */
export function optimizeSubtitleLines(text: string, maxLineLength = 20): string {
  if (!text || chars(text) <= maxLineLength) return text;

  // すでに改行がある場合は各行ごとに最適化
  if (text.includes('\n')) {
    return text.split('\n').map(l => optimizeSubtitleLines(l, maxLineLength)).join('\n');
  }

  const chunks = tokenizeJapanesePhrases(text).map(c => c.text);
  if (chunks.length <= 1) return text;

  // 境界 i（chunks[i-1] と chunks[i] の間）の改行の悪さ。
  const breakCost = (i: number) => {
    const prev = [...chunks[i - 1]].at(-1)!, next = [...chunks[i]][0];
    if (SENTENCE_END_PUNCTS.has(prev) || COMMA_PUNCTS.has(prev) || CLOSING_BRACKETS.has(prev)) return 0;
    return /[\u3041-\u309f]/.test(next) ? 4 : 1;
  };
  const lengths = chunks.map(chars);
  const span = (a: number, b: number) => lengths.slice(a, b).reduce((n, x) => n + x, 0);
  // 1つの塊が上限を超える場合だけ、その塊単独の行は上限超えを許す（語の途中では切らない）。
  const fits = (a: number, b: number) => b - a === 1 || span(a, b) <= maxLineLength;

  // 行数の最小値（上限内で詰めた場合の行数）。
  let lines = 0;
  for (let a = 0; a < chunks.length; lines++) {
    let b = a + 1;
    while (b < chunks.length && fits(a, b + 1)) b++;
    a = b;
  }

  // 行数をその最小値に固定し、境界の悪さ＋行の長さの偏りが最小の分け方を選ぶ。
  const total = chars(text), mean = total / lines;
  const memo = new Map<string, {cost: number; cuts: number[]} | null>();
  const best = (a: number, left: number): {cost: number; cuts: number[]} | null => {
    const key = `${a},${left}`;
    if (memo.has(key)) return memo.get(key)!;
    let result: {cost: number; cuts: number[]} | null = null;
    if (left === 1) {
      if (fits(a, chunks.length)) result = {cost: (span(a, chunks.length) - mean) ** 2 / total / 2, cuts: []};
    } else {
      for (let b = a + 1; b < chunks.length && fits(a, b); b++) {
        const rest = best(b, left - 1);
        if (!rest) continue;
        const cost = breakCost(b) + (span(a, b) - mean) ** 2 / total / 2 + rest.cost;
        if (!result || cost < result.cost) result = {cost, cuts: [b, ...rest.cuts]};
      }
    }
    memo.set(key, result);
    return result;
  };
  const cuts = best(0, lines)!.cuts;
  return [0, ...cuts].map((a, i) => chunks.slice(a, i < cuts.length ? cuts[i] : chunks.length).join('')).join('\n');
}

// T187: 焼き込み字幕の表示用改行。native（scripts/render.swift）とRemotion（BurnInSubtitle）の両方がこの結果の改行だけで行を分ける。
// 1行20字を優先し、2行に収まらないcueだけ1字ずつ広げる。上限36字は描画側の1行の容量（native 30pt×36=1080pt < 幅1140pt、
// Remotion 34px×1.04×36≈1273px < 最大幅1536px）で、cue上限55字が文節境界で2行に入る余地を残す（T187以前は描画側が約38字で折り返していた）。
// それでも3行以上なら、そのまま渡して文字配置検査（行数上限2）で失敗させる。1行が描画幅を超えた場合も行分割の不一致・はみ出しとして失敗する。
// 台本・cue・VTTの本文には改行を入れない（VTTはプレーヤー側の折り返しに任せる）。cueに元からある改行はVTTと同じく行ごとにtrimして残す。
export const SUBTITLE_LINE_CHARS = 20;
export const SUBTITLE_MAX_LINE_CHARS = 36;
export const SUBTITLE_MAX_LINES = 2;
export function subtitleDisplayText(text: string): string {
  const normalized = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).join('\n');
  let first = '';
  for (let n = SUBTITLE_LINE_CHARS; n <= SUBTITLE_MAX_LINE_CHARS; n++) {
    const out = optimizeSubtitleLines(normalized, n);
    if (out.split('\n').length <= SUBTITLE_MAX_LINES) return out;
    first ||= out;
  }
  return first;
}
