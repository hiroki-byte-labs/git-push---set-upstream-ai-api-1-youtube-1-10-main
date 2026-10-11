// T108の想定費用の計算（2026-10-10、Claude Code）。単価は公式ページを2026-10-10に確認した値（docs/T108-SERVICE-COMPARISON.md）。
// アプリの見積り関数（src/budget.ts）をそのまま使う。外部呼出なし。実行: node logs/.../evidence/cost-calc.ts（リポジトリのルートで）
import {estimateText, estimateTtsChars, estimateTtsAudio, estimateVideo} from '../../../../src/budget.ts';
const C = '2026-10-10';
const p = {currency: 'USD', items: {
  'gemini-3.8-flash:text': {confirmedAt: C, inputPerMTok: 0.75, outputPerMTok: 3.75},
  'gemini-3.8-flash:text@2027': {confirmedAt: C, inputPerMTok: 1.50, outputPerMTok: 7.50},
  'gemini-3.5-flash-lite:text': {confirmedAt: C, inputPerMTok: 0.30, outputPerMTok: 2.50},
  'gemini-3.8-flash-tts': {confirmedAt: C, inputPerMTok: 0.50, audioOutputPerMTok: 9.00, audioTokensPerSecond: 25},
  'gemini-3.8-flash-tts@32': {confirmedAt: C, inputPerMTok: 0.50, audioOutputPerMTok: 9.00, audioTokensPerSecond: 32},
  'gemini-3.8-flash-tts@2027': {confirmedAt: C, inputPerMTok: 1.00, audioOutputPerMTok: 18.00, audioTokensPerSecond: 25},
  'gemini-3.8-flash-lite-tts': {confirmedAt: C, inputPerMTok: 0.50, audioOutputPerMTok: 6.00, audioTokensPerSecond: 25},
  'elevenlabs-multilingual-v2': {confirmedAt: C, perThousandChars: 0.08},
  'elevenlabs-v4@discount': {confirmedAt: C, perThousandChars: 0.022},
  'elevenlabs-v4@list': {confirmedAt: C, perThousandChars: 0.08},
  'runway-gen4.5': {confirmedAt: C, creditsPerSecond: 12, usdPerCredit: 0.01},
  'runway-veo3.1_fast-noaudio': {confirmedAt: C, creditsPerSecond: 10, usdPerCredit: 0.01},
  'gemini-veo-3.1-lite-720p': {confirmedAt: C, creditsPerSecond: 5, usdPerCredit: 0.01},
  'gemini-veo-3.1-fast-720p': {confirmedAt: C, creditsPerSecond: 10, usdPerCredit: 0.01},
}};
// 前提（すべて仮定。docs/T108-SERVICE-COMPARISON.md 4章）
const A = {
  charsPerMinute: 300,        // ゆっくりした語り（5字/秒）
  scriptInputTokens: 30000,   // 方針・出典の抜粋・題材・本人の考察・下書き
  scriptOutputPerChar: 3,     // ナレーション＋字幕＋構造で本文の約3倍（日本語は1字=1トークンと保守的に仮定）
  thinkingMultiplier: 2,      // 思考トークンを出力と同量と仮定
  scriptRuns: 3,              // 作り直しを含む台本生成の回数
  ttsPasses: 3,               // 全文の読み上げ回数（初回＋撮り直し2回相当）
  videoSecondsUsed: 30,       // 部分映像の使用秒数（5秒×6場面）
  videoTakes: 3,              // 1場面あたりの生成回数
  elevenStarterUsdPerMonth: 6, // 商用に必要な有料プランの最低額（Starter）。月の動画本数で割らず月額で示す
  jpyPerUsd: 158.10,          // 日本銀行 外国為替市況 2026-10-09 ドル円 中心相場
  jpyBuffer: 1.05,            // カード会社の換算・為替変動の余裕 5%
};
const rows: string[] = [];
const yen = (usd: number) => `${Math.round(usd * A.jpyPerUsd)}円（余裕込み${Math.round(usd * A.jpyPerUsd * A.jpyBuffer)}円）`;
for (const minutes of [10, 20]) {
  const chars = minutes * A.charsPerMinute, seconds = minutes * 60;
  const outTok = chars * A.scriptOutputPerChar * A.thinkingMultiplier;
  const script = (id: string) => A.scriptRuns * estimateText(p as any, id, A.scriptInputTokens, outTok);
  const ttsG = (id: string) => A.ttsPasses * estimateTtsAudio(p as any, id, chars, seconds);
  const ttsE = (id: string) => A.ttsPasses * estimateTtsChars(p as any, id, chars);
  const video = (id: string) => estimateVideo(p as any, id, A.videoSecondsUsed * A.videoTakes);
  rows.push(`## ${minutes}分（ナレーション${chars}字、音声${seconds}秒）`);
  const parts: [string, number][] = [
    ['台本 gemini-3.8-flash（2026年中）', script('gemini-3.8-flash:text')],
    ['台本 gemini-3.8-flash（2027-01-01以降の単価）', script('gemini-3.8-flash:text@2027')],
    ['台本 gemini-3.5-flash-lite', script('gemini-3.5-flash-lite:text')],
    ['音声 gemini-3.8-flash-tts（25トークン/秒）', ttsG('gemini-3.8-flash-tts')],
    ['音声 gemini-3.8-flash-tts（32トークン/秒で計算した場合）', ttsG('gemini-3.8-flash-tts@32')],
    ['音声 gemini-3.8-flash-tts（2027-01-01以降の単価）', ttsG('gemini-3.8-flash-tts@2027')],
    ['音声 gemini-3.8-flash-lite-tts', ttsG('gemini-3.8-flash-lite-tts')],
    ['音声 ElevenLabs multilingual_v2（従量$0.08/千字）', ttsE('elevenlabs-multilingual-v2')],
    ['音声 ElevenLabs v4（10/12までの割引$0.022/千字）', ttsE('elevenlabs-v4@discount')],
    ['音声 ElevenLabs v4（割引前の表示$0.08/千字）', ttsE('elevenlabs-v4@list')],
    ['部分映像 Runway gen4.5（12cr/秒）', video('runway-gen4.5')],
    ['部分映像 Runway veo3.1_fast 音声なし（10cr/秒）', video('runway-veo3.1_fast-noaudio')],
    ['部分映像 Gemini API veo-3.1-lite 720p（$0.05/秒）', video('gemini-veo-3.1-lite-720p')],
    ['部分映像 Gemini API veo-3.1-fast 720p（$0.10/秒）', video('gemini-veo-3.1-fast-720p')],
  ];
  for (const [k, v] of parts) rows.push(`- ${k}: $${v.toFixed(3)} = ${yen(v)}`);
  const s = script('gemini-3.8-flash:text');
  const combos: [string, number][] = [
    ['映像なし: Gemini台本＋Gemini TTS', s + ttsG('gemini-3.8-flash-tts')],
    ['映像なし: Gemini台本＋ElevenLabs v2（従量。別途Starter月額$6）', s + ttsE('elevenlabs-multilingual-v2')],
    ['部分映像あり: Gemini台本＋Gemini TTS＋Runway gen4.5', s + ttsG('gemini-3.8-flash-tts') + video('runway-gen4.5')],
    ['部分映像あり: Gemini台本＋ElevenLabs v2＋Runway gen4.5（別途Starter月額$6）', s + ttsE('elevenlabs-multilingual-v2') + video('runway-gen4.5')],
    ['部分映像あり（2027単価）: Gemini台本＋Gemini TTS＋Gemini veo-3.1-fast', script('gemini-3.8-flash:text@2027') + ttsG('gemini-3.8-flash-tts@2027') + video('gemini-veo-3.1-fast-720p')],
  ];
  rows.push('組み合わせ（1本あたりの従量。月額の固定費は含めない）:');
  for (const [k, v] of combos) rows.push(`- ${k}: $${v.toFixed(2)} = ${yen(v)}`);
  rows.push('');
}
rows.push(`前提: ${JSON.stringify(A)}`);
rows.push(`ElevenLabs商用の月額固定（Starter $${A.elevenStarterUsdPerMonth}）: ${yen(A.elevenStarterUsdPerMonth)}/月`);
console.log(rows.join('\n'));
