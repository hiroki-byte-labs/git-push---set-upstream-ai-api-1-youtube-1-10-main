import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {validateCandidates, createProject} from '../src/production.ts';

test('topic-research: SKILL.md exists and has valid front matter', () => {
  const skillPath = join(process.cwd(), '.agents/skills/topic-research/SKILL.md');
  assert.ok(existsSync(skillPath), 'SKILL.md must exist');
  const content = readFileSync(skillPath, 'utf8');
  assert.match(content, /^---\nname: topic-research\n/);
  assert.match(content, /description: .+/);
  assert.match(content, /## 1\. 企画フレームワーク/);
  assert.match(content, /## 2\. 情報分類の原則/);
  assert.match(content, /## 3\. 成果物の形式仕様/);
  assert.match(content, /## 4\. 制作パイプラインへの受け渡し手順/);
});

test('topic-research: candidates-documentary.json passes validateCandidates', () => {
  const candidatesPath = join(process.cwd(), 'fixtures/candidates-documentary.json');
  assert.ok(existsSync(candidatesPath), 'candidates-documentary.json must exist');
  const raw = JSON.parse(readFileSync(candidatesPath, 'utf8'));
  const validated = validateCandidates(raw);

  assert.equal(validated.candidates.length, 3);
  const ids = validated.candidates.map(c => c.id);
  assert.deepEqual(ids, ['superstar-economics', 'surname-extinction', 'paradox-of-tolerance']);

  for (const c of validated.candidates) {
    assert.ok(c.title.length <= 60, `Title must be <= 60 chars: ${c.id}`);
    assert.ok(c.hook.length <= 200, `Hook must be <= 200 chars: ${c.id}`);
    assert.ok(c.concept.length <= 200, `Concept must be <= 200 chars: ${c.id}`);
    if (c.example) {
      assert.ok(c.example.length <= 200, `Example must be <= 200 chars: ${c.id}`);
    }
    assert.ok(c.sources && c.sources.length >= 1, `Candidate ${c.id} must have sources`);
    for (const s of c.sources!) {
      assert.ok(s.title.length <= 120, `Source title must be <= 120 chars: ${s.title}`);
      assert.match(s.url, /^https:\/\/\S+$/, `Source URL must be valid HTTPS: ${s.url}`);
    }
  }
});

test('topic-research: candidates-documentary.json can be used to create demo project', () => {
  const candidatesPath = join(process.cwd(), 'fixtures/candidates-documentary.json');
  const raw = JSON.parse(readFileSync(candidatesPath, 'utf8'));
  const testRoot = join(process.cwd(), 'work/test-topic-research-' + Date.now());

  const projId = createProject(testRoot, raw, {demo: true, by: 'test-agent'});
  assert.ok(projId.startsWith('production-demo-'));
  const proj = JSON.parse(readFileSync(join(testRoot, projId, 'job.json'), 'utf8'));
  assert.equal(proj.workflow.candidates.length, 3);
  assert.equal(proj.workflow.candidates[0].id, 'superstar-economics');
});

test('topic-research: research-report-documentary.md covers all candidates with Fact/Inference/Unverified', () => {
  const reportPath = join(process.cwd(), 'fixtures/research-report-documentary.md');
  assert.ok(existsSync(reportPath), 'research-report-documentary.md must exist');
  const content = readFileSync(reportPath, 'utf8');

  // Verify all candidates are described
  assert.match(content, /候補1: superstar-economics/);
  assert.match(content, /候補2: surname-extinction/);
  assert.match(content, /候補3: paradox-of-tolerance/);

  // Verify strict separation sections exist for all candidates
  const factMatches = content.match(/事実（Fact）/g);
  const inferenceMatches = content.match(/推論（Inference）/g);
  const unverifiedMatches = content.match(/未確認（Unverified）/g);

  assert.ok(factMatches && factMatches.length >= 3, 'Must have at least 3 Fact entries');
  assert.ok(inferenceMatches && inferenceMatches.length >= 3, 'Must have at least 3 Inference entries');
  assert.ok(unverifiedMatches && unverifiedMatches.length >= 3, 'Must have at least 3 Unverified entries');
});
