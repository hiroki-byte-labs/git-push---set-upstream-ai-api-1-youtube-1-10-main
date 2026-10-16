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
  const isKanji = (c: string) => /[\u4e00-\u9fff\u3400-\u4dbf]/.test(c);
  const isKatakana = (c: string) => /[\u30a0-\u30ffー]/.test(c);
  const isAlnum = (c: string) => /[a-zA-Z0-9]/.test(c);
  const isPunct = (c: string) => /[、，,。．.！？!?」』）)】\]…;；:：\s]/.test(c);

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
 */
export function optimizeSubtitleLines(text: string, maxLineLength = 20): string {
  if (!text || chars(text) <= maxLineLength) return text;

  // すでに改行がある場合は各行ごとに最適化
  if (text.includes('\n')) {
    return text.split('\n').map(l => optimizeSubtitleLines(l, maxLineLength)).join('\n');
  }

  const chunks = tokenizeJapanesePhrases(text);
  if (chunks.length <= 1) return text;

  const lines: string[] = [];
  let currentLine = '';

  for (let idx = 0; idx < chunks.length; idx++) {
    const chunk = chunks[idx];
    const candidate = currentLine + chunk.text;
    const candLen = chars(candidate);

    if (candLen <= maxLineLength) {
      currentLine = candidate;
    } else {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = chunk.text;
      } else {
        lines.push(chunk.text);
        currentLine = '';
      }
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.join('\n');
}
