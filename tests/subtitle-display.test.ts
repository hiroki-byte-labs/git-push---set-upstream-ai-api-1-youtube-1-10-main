// T187: 焼き込み字幕の表示用改行（subtitleDisplayText）をnative/Remotionの両経路へ同じ値で渡し、
// 2行に収まらない・描画側が別の位置で折り返した場合は文字配置検査で失敗させる。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {optimizeSubtitleLines, subtitleDisplayText, SUBTITLE_LINE_CHARS, SUBTITLE_MAX_LINE_CHARS, SUBTITLE_MAX_LINES} from '../src/subtitle-optimizer.ts';
import {buildSegments, buildRenderSpec} from '../src/timeline.ts';
import {toRemotionPlanProps} from '../motion-lab/src/remotion-plan.ts';
import {checkLayoutRecords} from '../src/layout.ts';
import {loadPlan, validatePlanV2} from '../src/plan.ts';
import {buildVtt} from '../src/commands/sample.ts';

const chars = (s: string) => [...s].length;
const plans = [
  loadPlan(JSON.parse(readFileSync('fixtures/sample-v2.json', 'utf8'))),
  validatePlanV2(JSON.parse(readFileSync('fixtures/remotion-layout-stress.json', 'utf8'))),
];

test('表示用改行は1行20字のoptimizeSubtitleLinesを優先し、2行に収まらないcueだけ広げる', () => {
  const normal = '物価の上昇が続くと私たちの生活には様々な影響が生じます。';
  assert.equal(subtitleDisplayText(normal), optimizeSubtitleLines(normal, SUBTITLE_LINE_CHARS));
  assert.equal(subtitleDisplayText('短い字幕です。'), '短い字幕です。');
  const long = '後半の長い字幕も全ての文字の位置と大きさを実測します。これは架空の検査です。結果を保証するものではありません。';
  const out = subtitleDisplayText(long);
  assert.equal(out.replace(/\n/g, ''), long, '文字は増減しない');
  const lines = out.split('\n');
  assert.equal(lines.length, SUBTITLE_MAX_LINES);
  assert.ok(lines.every(l => chars(l) <= SUBTITLE_MAX_LINE_CHARS));
  // 元からある改行（VTTと同じく行ごとにtrim・空行除去）は残す。
  assert.equal(subtitleDisplayText(' 一行目 \n\n 二行目 '), '一行目\n二行目');
});

test('文節境界で2行に収まらないcueは3行以上のまま返し、切り捨てない', () => {
  // cue上限55字以内でも、隣り合う文節の合計が1行の上限（36字）を超えれば2行にできない（10字・30字・15字）。
  const k = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホ';
  const text = `${k.slice(0, 9)}、${k.slice(0, 29)}、${k.slice(0, 14)}。`;
  assert.equal(chars(text), 55);
  const out = subtitleDisplayText(text);
  assert.equal(out.replace(/\n/g, ''), text);
  assert.equal(out.split('\n').length, 3);
});

test('native（render-spec）とRemotion（props）の字幕は同じ表示文字列・同じ行分割になる', () => {
  for (const plan of plans) {
    const spec = buildRenderSpec(plan, buildSegments(plan), 'burn');
    const props = toRemotionPlanProps(plan, 24, 1280, 720);
    let checked = 0;
    for (const f of spec.frames) {
      assert.notEqual(f.cue, null);
      const cue = plan.scenes[f.scene].cues[f.cue!];
      const remotion = props.scenes[f.scene].cues[f.cue!];
      assert.equal(remotion.text, cue.text, 'Remotionのcue本文は変えない');
      assert.equal(f.subtitle, subtitleDisplayText(cue.text));
      assert.equal(remotion.display, f.subtitle);
      checked++;
    }
    assert.ok(checked > 0);
    assert.ok(buildRenderSpec(plan, buildSegments(plan), 'none').frames.every(f => f.cue === null && f.subtitle === undefined));
  }
  // 少なくとも1つは改行が入る（接続されていることの確認）。
  assert.ok(plans.some(p => buildRenderSpec(p, buildSegments(p)).frames.some(f => f.subtitle!.includes('\n'))));
});

test('台本・cue・VTTの本文には表示用の改行を入れない', () => {
  for (const plan of plans) {
    const before = JSON.stringify(plan);
    buildRenderSpec(plan, buildSegments(plan));
    toRemotionPlanProps(plan);
    assert.equal(JSON.stringify(plan), before);
    const vtt = buildVtt(plan);
    for (const s of plan.scenes) for (const c of s.cues) assert.ok(vtt.includes(`\n${c.text}\n`), `VTTはcue本文のまま: ${c.text}`);
  }
});

// 字幕の測定記録。native（scripts/render.swift）はlineTextsも持ち、RemotionはDOM Rangeの行矩形だけを持つ。
const sub = {file: 's1-1-c1.png', role: '字幕', text: '一行目の字幕\n二行目の字幕', zone: 'subtitle', align: 'center',
  box: [70, 102, 1140, 108], drawn: [500, 120, 300, 72], maxLines: 2, expectedLines: ['一行目の字幕', '二行目の字幕'],
  lines: [[500, 156, 300, 36], [500, 120, 300, 36]], lineTexts: ['一行目の字幕', '二行目の字幕']};

test('文字配置検査: 渡した改行どおりの2行は合格、3行・別位置の折り返しは失敗', () => {
  assert.deepEqual(checkLayoutRecords([sub]).issues, []);
  const three = {...sub, text: 'a\nb\nc', expectedLines: ['a', 'b', 'c'], lineTexts: ['a', 'b', 'c'], lines: [[500, 156, 30, 30], [500, 138, 30, 30], [500, 120, 30, 30]]};
  assert.match(checkLayoutRecords([three]).issues.join('\n'), /行数上限を超える/);
  // native: 描画側が1行目をさらに折り返した（行の文字が改行と一致しない）。
  const rewrapped = {...sub, lineTexts: ['一行目の', '字幕', '二行目の字幕'], lines: [[500, 170, 300, 30], [500, 145, 300, 30], [500, 120, 300, 30]]};
  assert.match(checkLayoutRecords([rewrapped]).issues.join('\n'), /行分割が字幕の改行/);
  const sameCountDifferentBreak = {...sub, lineTexts: ['一行目の字幕二', '行目の字幕']};
  assert.match(checkLayoutRecords([sameCountDifferentBreak]).issues.join('\n'), /行分割が字幕の改行と一致しない/);
  // Remotion: 行矩形の行数が改行の数と違う。
  const {lineTexts: _omit, ...dom} = sub;
  assert.deepEqual(checkLayoutRecords([dom]).issues, []);
  assert.match(checkLayoutRecords([{...dom, lines: [[500, 120, 300, 36]]}]).issues.join('\n'), /行分割が字幕の改行（2行）と一致しない（描画1行）/);
});

test('行の選び方: 語中のひらがな境界より句読点・語頭の境界を優先する（貪欲詰めの「ふり返りや／すく」を防ぐ）', () => {
  assert.equal(optimizeSubtitleLines('分けておくと、後からふり返りやすくなります。', 20), '分けておくと、\n後からふり返りやすくなります。');
  assert.equal(optimizeSubtitleLines('検査用の架空の台本で、結果を保証するものではありません。', 20), '検査用の架空の台本で、\n結果を保証するものではありません。');
  assert.equal(optimizeSubtitleLines('数字の図では、大きな文字と補足が重ならないかを確かめます。', 20), '数字の図では、大きな文字と\n補足が重ならないかを確かめます。');
});
