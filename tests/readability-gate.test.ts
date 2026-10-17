import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {checkReadability, MIN_CONTRAST_TEXT} from '../src/readability.ts';
import {checkLayout} from '../src/layout.ts';

test('T158: 遷移途中のレコードはreadabilitySample=falseとなりコントラスト判定から除外され、除外理由が残る', () => {
  const root = mkdtempSync(join(tmpdir(), 't158-readability-'));
  try {
    const report = [
      {
        file: 'frame-900.png',
        scene: 2,
        frame: 900,
        role: 'diagram',
        text: '祖先',
        pixelSize: 24,
        contrast: 1.01,
        opacity: 0.01,
        readabilitySample: false,
        exclusionReason: 'transition opacity 0.01 (< 0.90)',
      },
      {
        file: 'frame-450.png',
        scene: 1,
        frame: 450,
        role: 'diagram',
        text: '完全表示中の図解ラベル',
        pixelSize: 24,
        contrast: 7.50,
        opacity: 1.00,
        readabilitySample: true,
      },
    ];
    writeFileSync(join(root, 'render-report.json'), JSON.stringify(report));

    const result = checkReadability(root, 1);
    assert.equal(result.ok, true);
    assert.equal(result.issues.length, 0);
    assert.equal(result.minContrast, 7.50);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('T158: 完全表示中にコントラスト比4.5未満の文字があればreadability.ok=falseとなる', () => {
  const root = mkdtempSync(join(tmpdir(), 't158-low-contrast-'));
  try {
    const report = [
      {
        file: 'frame-450.png',
        scene: 1,
        frame: 450,
        role: 'diagram',
        text: '見えにくい文字',
        pixelSize: 24,
        contrast: 4.40,
        opacity: 1.00,
        readabilitySample: true,
      },
    ];
    writeFileSync(join(root, 'render-report.json'), JSON.stringify(report));

    const result = checkReadability(root, 1);
    assert.equal(result.ok, false);
    assert.equal(result.issues.length, 1);
    assert.match(result.issues[0], /コントラスト比4.5未満/);
    assert.equal(result.minContrast, 4.40);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('T158: SuperstarIllustrationのラベル描画は高コントラストな白文字とダーク縁取りを持つ', () => {
  const source = readFileSync('motion-lab/src/primitives/SuperstarIllustration.tsx', 'utf8');
  assert.match(source, /fill="#ffffff"/);
  assert.match(source, /stroke="#0f172a"/);
  assert.match(source, /paintOrder="stroke fill"/);
});

test('T158: 可読性検査または文字配置検査が不合格の場合、ジョブ完了・latest更新を阻止して安全停止する', () => {
  // sampleVideo内の安全停止契約の検証
  const sampleSource = readFileSync('src/commands/sample.ts', 'utf8');
  assert.match(sampleSource, /job\.readability = checkReadability/);
  assert.match(sampleSource, /if \(!job\.readability\.ok\) \{\s*throw Error\('可読性検査に不合格（安全停止）/);
  assert.match(sampleSource, /job\.layout = checkLayout/);
  assert.match(sampleSource, /if \(!job\.layout\.ok\) \{\s*throw Error\('文字配置検査に不合格（安全停止）/);
  // job.status = 'completed' と outputs/latest.json 更新は上記検査の後ろにある
  const readabilityPos = sampleSource.indexOf('job.readability = checkReadability');
  const layoutPos = sampleSource.indexOf('job.layout = checkLayout');
  const completedPos = sampleSource.indexOf("job.status = 'completed'");
  const latestPos = sampleSource.indexOf("writeFileSync('outputs/latest.json'");

  assert.ok(readabilityPos < completedPos, 'readability検査はcompleted設定より前に実行されること');
  assert.ok(layoutPos < completedPos, 'layout検査はcompleted設定より前に実行されること');
  assert.ok(completedPos < latestPos, 'completed設定はlatest.json更新より前であること');
});

// T158追加修正（T120再監査）: 測定の欠測を見やすさの合格にしない
test('checkReadability: 空の記録・判定用サンプルなし・測定値の欠測は不合格', () => {
  const d = mkdtempSync(join(tmpdir(), 'readability-missing-'));
  try {
    const good = {file: 'a.png', role: 'subtitle', text: '字幕', size: 30, pixelSize: 30, contrast: 12};
    const cases: [string, unknown[]][] = [
      ['空', []],
      ['判定用サンプルなし', [{...good, readabilitySample: false}]],
      ['pixelSize欠測', [{...good, pixelSize: undefined}]],
      ['contrast欠測', [{...good, contrast: null}]],
      ['NaN', [{...good, pixelSize: Number.NaN}]],
    ];
    for (const [name, recs] of cases) {
      writeFileSync(join(d, 'render-report.json'), JSON.stringify(recs));
      const r = checkReadability(d, 1);
      assert.equal(r.ok, false, name);
      assert.ok(r.issues.length > 0, name);
    }
    writeFileSync(join(d, 'render-report.json'), JSON.stringify([good]));
    assert.equal(checkReadability(d, 1).ok, true);
  } finally {
    rmSync(d, {recursive: true, force: true});
  }
});
