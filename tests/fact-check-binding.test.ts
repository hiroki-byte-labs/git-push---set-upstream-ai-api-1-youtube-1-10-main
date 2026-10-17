import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createProject, selectTopic, addReflection, attachScript, reviewScript, assertRenderable} from '../src/production.ts';
import {produce} from '../src/commands/produce.ts';
import {checkScriptForTest, checkedReportForTest} from './helpers/checked-facts.ts';

function fixture(fn: (root: string, id: string, raw: any, script: ReturnType<typeof attachScript>) => Promise<void> | void) {
  return async () => {
    const root = mkdtempSync(join(tmpdir(), 'fact-binding-'));
    try {
      const id = createProject(root, JSON.parse(readFileSync('fixtures/candidates-documentary.json', 'utf8')), {demo: true, by: 'test-agent'});
      selectTopic(root, id, 'superstar-economics', 'test-agent'); addReflection(root, id, '模擬の考察です。本人の文章ではありません。', 'test-agent');
      const raw = JSON.parse(readFileSync('fixtures/draft-documentary-superstar.json', 'utf8'));
      await fn(root, id, raw, attachScript(root, id, raw, 'test-agent'));
    } finally {rmSync(root, {recursive: true, force: true});}
  };
}
test('T171 regression: automatic report never marks unchecked URLs verified', fixture(async (root, id, raw) => {
  for (const source of raw.sources) source.url = 'https://unverified.invalid/' + source.id;
  attachScript(root, id, raw, 'test-agent');
  await produce(['fact-check', id, '--by', 'test-agent'], root);
  const report = JSON.parse(readFileSync(join(root, id, 'fact-check.json'), 'utf8'));
  assert.equal(report.ok, false);
  assert.ok(report.claims.every((c: any) => c.status === 'unverified'));
}));

test('import rejects stale/other-project/other-plan reports without rebinding or overwriting evidence', fixture(async (root, id, raw) => {
  const old = checkScriptForTest(root, id);
  const before = readFileSync(join(root, id, 'fact-check.json'), 'utf8');
  const file = join(root, 'import.json');
  const other = structuredClone(old); other.binding.projectId = 'other-project';
  writeFileSync(file, JSON.stringify(other));
  await assert.rejects(produce(['fact-check', id, '--report', file], root), /結合/);
  assert.equal(readFileSync(join(root, id, 'fact-check.json'), 'utf8'), before);
  const plan = structuredClone(old); plan.planId = 'other-plan'; writeFileSync(file, JSON.stringify(plan));
  await assert.rejects(produce(['fact-check', id, '--report', file], root), /planId/);
  raw.scenes[1].narration = '版を変更した説明です。'; attachScript(root, id, raw, 'test-agent');
  writeFileSync(file, JSON.stringify(old));
  await assert.rejects(produce(['fact-check', id, '--report', file], root), /結合/);
}));

test('approval recomputes claimed-ok flags and checks source correspondence', fixture((root, id, raw, script) => {
  const unverified = checkedReportForTest(root, id); unverified.claims[0].status = 'unverified';
  writeFileSync(join(root, id, 'fact-check.json'), JSON.stringify(unverified));
  assert.throws(() => reviewScript(root, id, 'approve', script.hash, '', 'test-agent'), /エスカレーション/);
  const mismatch = checkedReportForTest(root, id); mismatch.claims[0].url = 'https://other.invalid/paper';
  writeFileSync(join(root, id, 'fact-check.json'), JSON.stringify(mismatch));
  assert.throws(() => reviewScript(root, id, 'approve', script.hash, '', 'test-agent'), /出典ID\/URL/);
}));
test('T171 regression: new script cannot reuse the previous script certificate', fixture(async (root, id, raw) => {
  checkScriptForTest(root, id);
  raw.scenes[1].narration = '照合後に変更した説明です。';
  const newer = attachScript(root, id, raw, 'test-agent');
  await assert.rejects(produce(['script-review', id, 'approve', '--hash', newer.hash, '--by', 'test-agent'], root), /版|hash|結合/);
}));
test('T171 regression: shared approval and HTTP path require a valid report', fixture((root, id, raw, script) => {
  assert.throws(() => reviewScript(root, id, 'approve', script.hash, '', 'test-agent', 'http'), /事実|確認/);
}));
test('T171 regression: malformed claimed-ok JSON cannot authorize approval', fixture(async (root, id, raw, script) => {
  writeFileSync(join(root, id, 'fact-check.json'), JSON.stringify({ok: true, escalations: []}));
  await assert.rejects(produce(['script-review', id, 'approve', '--hash', script.hash, '--by', 'test-agent'], root), /schema|結合|レポート/);
}));
test('valid certificate works, but changing its contents invalidates previous approval', fixture((root, id, raw, script) => {
  checkScriptForTest(root, id); reviewScript(root, id, 'approve', script.hash, '', 'test-agent');
  assert.equal(assertRenderable(root, id).state.scriptState, 'approved');
  const changed = checkedReportForTest(root, id); changed.claims[0].note += ' changed';
  writeFileSync(join(root, id, 'fact-check.json'), JSON.stringify(changed));
  assert.throws(() => assertRenderable(root, id), /事実|確認|承認/);
}));
