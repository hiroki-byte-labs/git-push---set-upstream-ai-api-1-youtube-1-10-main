import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  tokenizeJapanesePhrases,
  optimizeSubtitleLines,
  splitSmartCues,
} from '../src/subtitle-optimizer.ts';
import {splitCues} from '../src/production.ts';

const chars = (s: string) => [...s].length;

test('tokenizeJapanesePhrases preserves all characters and binds particles to words', () => {
  const sentence = '物価の上昇が続くと、私たちの生活には大きな影響が出ます。';
  const chunks = tokenizeJapanesePhrases(sentence);

  // 全文字が完全に保存されていること
  assert.equal(chunks.map(c => c.text).join(''), sentence);

  // 助詞が直前の語に吸着していること
  const texts = chunks.map(c => c.text);
  assert.ok(texts.includes('物価の'), '助詞「の」が「物価」に吸着');
  assert.ok(texts.includes('上昇が'), '助詞「が」が「上昇」に吸着');
  assert.ok(texts.includes('続くと、'), '助詞「と」および読点「、」が「続く」に吸着');
  assert.ok(texts.includes('生活には'), '複合助詞「には」が「生活」に吸着');
  assert.ok(texts.some(t => t.includes('影響が')), '助詞「が」が「影響」に吸着');
  assert.ok(texts.some(t => t.includes('出ます。')), '文末句点「。」が吸着');

  // 単独の助詞だけで始まるチャンクが存在しないこと（泣き別れ防止）
  for (const c of chunks) {
    assert.ok(!/^([はがをにへとでものや]|には|では|とは)$/.test(c.text), `孤立助詞チャンクではないこと: ${c.text}`);
  }
});

test('tokenizeJapanesePhrases handles alphanumeric units and compound particles', () => {
  const text = '過去20年間で100円の価値は3.5%下落したことについては議論がある。';
  const chunks = tokenizeJapanesePhrases(text);
  assert.equal(chunks.map(c => c.text).join(''), text);

  const texts = chunks.map(c => c.text);
  assert.ok(texts.some(t => t.includes('20年間で')), '数字＋単位＋助詞が一塊');
  assert.ok(texts.some(t => t.includes('100円の')), '数字＋円＋助詞が一塊');
  assert.ok(texts.some(t => t.includes('3.5%')), '小数＋%が一塊');
  assert.ok(texts.some(t => t.includes('については')), '複合助詞「については」が一塊');
});

test('optimizeSubtitleLines inserts natural breaks within 15-22 chars per line without word breakage', () => {
  const shortText = '今日は良い天気です。';
  assert.equal(optimizeSubtitleLines(shortText, 20), shortText, '短い文は改行なし');

  const longText = '物価の上昇が続くと私たちの生活には様々な影響が生じます。';
  const formatted = optimizeSubtitleLines(longText, 18);

  // 改行を除けば元の文と一致
  assert.equal(formatted.replace(/\n/g, ''), longText);

  // 適切な位置で改行が入っていること（2行になっている）
  const lines = formatted.split('\n');
  assert.equal(lines.length, 2, '2行に分割されること');
  assert.ok(lines.every(l => chars(l) <= 22), '各行が推奨文字数内に収まっていること');

  // 2行目の先頭が孤立助詞で始まっていないこと（助詞泣き別れ防止）
  assert.ok(!/^[はがをにへとでものや]/.test(lines[1]), `2行目の先頭が助詞ではないこと: "${lines[1]}"`);
});

test('splitSmartCues and splitCues split long text into natural cues <= 55 chars', () => {
  const long = '物価のニュースを見ても、自分の生活とのつながりが分からなかったので、まずよく買う品を三つ選んで値段を記録することから始めてみようと考えました。記録してみると、上がった品と変わらない品があることに気づきました。全体の指数と自分の買い物は同じではないと分かりました。';

  const cues = splitSmartCues(long);

  // 1. 全文が欠落なく復元されること
  assert.equal(cues.join(''), long);

  // 2. 3分割以上され、すべてのcueが上限55字以内であること
  assert.ok(cues.length >= 3);
  assert.ok(cues.every(c => chars(c) <= 55 && chars(c) > 0));

  // 3. 後続cueの先頭が孤立助詞で始まっていないこと
  for (let i = 1; i < cues.length; i++) {
    const nextCue = cues[i];
    assert.ok(!/^[はがをにへとでものや]/.test(nextCue), `cue先頭が孤立助詞ではないこと: "${nextCue}"`);
  }

  // splitCues (production.ts) との完全互換性
  const prodCues = splitCues(long);
  assert.deepEqual(prodCues, cues);
  assert.equal(prodCues.join(''), long);
});

test('splitSmartCues handles extreme edge cases safely', () => {
  assert.deepEqual(splitSmartCues(''), []);
  assert.deepEqual(splitSmartCues('短い文。'), ['短い文。']);

  // 読点のない超長文でも55文字以内で安全に分割されること
  const noPunctuation = 'あ'.repeat(120);
  const result = splitSmartCues(noPunctuation);
  assert.equal(result.join(''), noPunctuation);
  assert.ok(result.every(c => chars(c) <= 55));
  assert.ok(result.length >= 3);
});
