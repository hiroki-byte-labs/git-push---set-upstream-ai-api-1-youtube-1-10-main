import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {loadPlan, REFLECTION_PLACEHOLDER} from '../src/plan.ts';
import {lintPlan} from '../src/lint.ts';
import {
  createProject, selectTopic, addReflection, attachScript, reviewScript,
  readProject, projectState, injectReflection
} from '../src/production.ts';

test('script-drafting: SKILL.md exists and has valid front matter', () => {
  const skillPath = join(process.cwd(), '.agents/skills/script-drafting/SKILL.md');
  assert.ok(existsSync(skillPath), 'SKILL.md must exist');
  const content = readFileSync(skillPath, 'utf8');
  assert.match(content, /^---\nname: script-drafting\n/);
  assert.match(content, /description: .+/);
  assert.match(content, /## 1\. 台本下書きの基本構造/);
  assert.match(content, /## 2\. 5大章立て・シーン構成指針/);
  assert.match(content, /## 3\. 文体・字幕・演出ルール/);
  assert.match(content, /## 4\. 制作パイプラインへの受け渡しと修正手順/);
});

test('script-drafting: draft-documentary-superstar.json has valid structure', () => {
  const draftPath = join(process.cwd(), 'fixtures/draft-documentary-superstar.json');
  assert.ok(existsSync(draftPath), 'draft fixture must exist');
  const raw = JSON.parse(readFileSync(draftPath, 'utf8'));

  assert.equal(raw.schema, 2);
  assert.equal(raw.theme, 'general');
  assert.ok(raw.title.includes('スーパースター経済学'));
  assert.ok(raw.sources.length >= 2);

  // Check reflection scene exists and contains placeholder
  const reflectionScene = raw.scenes.find((s: any) => s.role === 'reflection');
  assert.ok(reflectionScene, 'Must have a reflection scene');
  assert.equal(reflectionScene.narration, REFLECTION_PLACEHOLDER);
  assert.equal(reflectionScene.cues[0].text, REFLECTION_PLACEHOLDER);

  // Check un-injected draft fails lint with reflection-missing
  const planBefore = loadPlan(raw);
  const lintBefore = lintPlan(planBefore);
  assert.equal(lintBefore.ok, false);
  assert.ok(lintBefore.findings.some(f => f.rule === 'reflection-missing'));
});

test('script-drafting: injectReflection replaces placeholder and passes lint with 0 errors', () => {
  const draftPath = join(process.cwd(), 'fixtures/draft-documentary-superstar.json');
  const raw = JSON.parse(readFileSync(draftPath, 'utf8'));

  const humanReflectionText = 'スーパースターの存在は必然ですが、自分自身の独自の価値を見つけることの大切さを感じました。';
  const injected = injectReflection(raw, humanReflectionText);

  const plan = loadPlan(injected);
  const lint = lintPlan(plan);

  assert.equal(lint.errors, 0, `Lint errors: ${lint.findings.filter(f => f.level === 'error').map(f => f.message).join(', ')}`);
  assert.equal(lint.ok, true);

  const reflectionScene = plan.scenes.find(s => s.role === 'reflection');
  assert.ok(reflectionScene);
  assert.equal(reflectionScene.narration, humanReflectionText);
});

test('script-drafting: works end-to-end with produce workflow', () => {
  const candidatesPath = join(process.cwd(), 'fixtures/candidates-documentary.json');
  const draftPath = join(process.cwd(), 'fixtures/draft-documentary-superstar.json');
  const testRoot = join(process.cwd(), 'work/test-script-drafting-' + Date.now());

  const candidatesRaw = JSON.parse(readFileSync(candidatesPath, 'utf8'));
  const draftRaw = JSON.parse(readFileSync(draftPath, 'utf8'));

  // 1. New project
  const projectId = createProject(testRoot, candidatesRaw, {demo: true, by: 'test-agent'});

  // 2. Select topic
  selectTopic(testRoot, projectId, 'superstar-economics', 'test-human');

  // 3. Add human reflection
  addReflection(testRoot, projectId, '実力差がわずかでも注目が集まる構造を理解し、自分の得意分野の組み合わせを考えたい。', 'test-human');

  // 4. Attach script draft
  const scriptVer = attachScript(testRoot, projectId, draftRaw, 'test-agent', {draft: draftPath});
  assert.equal(scriptVer.version, 1);
  assert.equal(scriptVer.candidateId, 'superstar-economics');

  // Verify project state is pending script review
  const st1 = projectState(testRoot, projectId);
  assert.equal(st1.scriptState, 'pending');

  // 5. Human approves script
  reviewScript(testRoot, projectId, 'approve', scriptVer.hash, '台本の内容を確認し承認します', 'test-human');

  // Verify project state is now approved and ready for render
  const st2 = projectState(testRoot, projectId);
  assert.equal(st2.scriptState, 'approved');
  assert.equal(st2.stage, 'render');
});
