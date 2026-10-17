import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compileDocumentary, textSha256} from '../src/documentary.ts';
import {documentaryStructureDemo} from '../fixtures/documentary-structure-demo.ts';
import {validatePlanV2, REFLECTION_PLACEHOLDER} from '../src/plan.ts';
import {injectReflection} from '../src/production.ts';
import {lintPlan} from '../src/lint.ts';

test('deterministic 5000+ character / 6 chapter draft preserves all text, directions, and human gate', () => {
  const input = documentaryStructureDemo();
  const a = compileDocumentary(input), b = compileDocumentary(input);
  assert.deepEqual(a, b);
  assert.ok(a.report.chars >= 5000 && a.report.chars <= 8000);
  assert.ok(a.report.seconds >= 600 && a.report.seconds <= 1200);
  assert.equal(a.report.chapters, 6);
  assert.equal(a.report.readyForProduction, false);
  assert.deepEqual(a.report.lint.findings.filter(f => f.level === 'error').map(f => f.rule), ['reflection-missing']);
  assert.equal(a.plan.scenes.filter(s => s.role === 'reflection')[0].narration, REFLECTION_PLACEHOLDER);
  for (const chapter of input.chapters.filter(c => !c.reflection)) {
    const scenes = a.plan.scenes.filter(s => s.chapter === chapter.title);
    assert.equal(scenes.map(s => s.narration).join(''), chapter.paragraphs.map(p => p.text).join(''));
    for (const s of scenes) assert.equal(s.cues.map(c => c.text).join(''), s.narration);
  }
  const injected = validatePlanV2(injectReflection(a.plan, 'テスト用の模擬考察です。問いと説明の対応を確認します。'));
  assert.equal(lintPlan(injected).ok, true);
});

test('citation gate binds exact paragraph text, source URL and status; never invents verification', () => {
  const input = documentaryStructureDemo();
  const paragraph = input.chapters[1].paragraphs[0];
  // A synthetic test record: not a claim that this repeated passage was checked.
  paragraph.kind = 'claim'; paragraph.checkId = 'test-record';
  input.checks = [{id: 'test-record', claim: paragraph.text, textSha256: textSha256(paragraph.text),
    sourceId: input.sources[0].id, citation: 'TEST FIXTURE ONLY', locator: 'test', checkedBy: 'test-agent',
    url: input.sources[0].url, checkedAt: '2026-10-16', status: 'unverified'}];
  assert.throws(() => compileDocumentary(input), /未確認/);
  input.checks[0].status = 'verified';
  assert.equal(compileDocumentary(input).report.checksUsed, 1);
  paragraph.text += '改変';
  assert.throws(() => compileDocumentary(input), /不一致/);
  paragraph.text = input.checks[0].claim;
  input.checks[0].url = input.sources[1].url;
  assert.throws(() => compileDocumentary(input), /URL/);
});

test('rejects absent checks, fabricated reflection, bad visual intent, long or short scripts', () => {
  const input = documentaryStructureDemo();
  input.chapters[1].paragraphs[0].kind = 'claim';
  assert.throws(() => compileDocumentary(input), /照合記録/);
  const reflection = documentaryStructureDemo();
  reflection.chapters[4].paragraphs = [reflection.chapters[0].paragraphs[0]];
  assert.throws(() => compileDocumentary(reflection), /執筆/);
  const bad = documentaryStructureDemo();
  bad.chapters[0].paragraphs[0].purpose = '';
  assert.throws(() => compileDocumentary(bad), /視覚指示/);
  const short = documentaryStructureDemo(); short.chapters[0].paragraphs[0].text = '短い問い？';
  assert.throws(() => compileDocumentary(short), /5000/);
  const long = documentaryStructureDemo(); long.chapters[0].paragraphs[0].text += '長い説明です。'.repeat(500);
  assert.throws(() => compileDocumentary(long), /8000/);
});

test('intro source gate, inference notes, duplicate checks and invalid timing fail closed', () => {
  const input = documentaryStructureDemo(); input.intro = {text: '未確認の説明です。', checkId: 'missing'};
  assert.throws(() => compileDocumentary(input), /導入文の照合/);
  const rate = documentaryStructureDemo(); rate.charsPerSecond = NaN;
  assert.throws(() => compileDocumentary(rate), /話速/);
  const hooks = documentaryStructureDemo(); hooks.hooks[1] = hooks.hooks[0];
  assert.throws(() => compileDocumentary(hooks), /フック/);
});
