import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {validateNarrationMetadata, calculateSpeed} from '../src/narration.ts';

test('narration-evaluation: SKILL.md exists and has valid front matter', () => {
  const skillPath = join(process.cwd(), '.agents/skills/narration-evaluation/SKILL.md');
  assert.ok(existsSync(skillPath), 'SKILL.md must exist');
  const content = readFileSync(skillPath, 'utf8');
  assert.match(content, /^---\nname: narration-evaluation\n/);
  assert.match(content, /description: .+/);
  assert.match(content, /## 1\. ドキュメンタリー向け音響・声質要件/);
  assert.match(content, /## 2\. 音声品質チェックリスト/);
  assert.match(content, /## 3\. 比較試聴評価表/);
  assert.match(content, /## 4\. 成果物仕様/);
});

test('narration-evaluation: validates valid narration metadata fixture', () => {
  const fixturePath = join(process.cwd(), 'fixtures/narration-evaluation-superstar.json');
  assert.ok(existsSync(fixturePath), 'fixture must exist');
  const raw = JSON.parse(readFileSync(fixturePath, 'utf8'));
  const meta = validateNarrationMetadata(raw);

  assert.equal(meta.schema, 1);
  assert.equal(meta.planId, 'superstar-economics-demo');
  assert.equal(meta.profile.pitch, 'low');
  assert.equal(meta.profile.speedCharsPerSec, 5.4);
  assert.equal(meta.evaluations.length, 2);
  assert.equal(meta.evaluations[0].documentaryFit, 5);
  assert.equal(meta.adopted, true);
});

test('narration-evaluation: calculates speed correctly', () => {
  const sampleText = 'なぜ2位ではダメなのか？スーパースターの経済学。'; // 24文字
  const durationSec = 5.0;
  const speed = calculateSpeed(sampleText, durationSec);
  assert.equal(speed, 4.8);
});

test('narration-evaluation: rejects invalid rating or missing fields', () => {
  const invalidData = {
    schema: 1,
    planId: 'test-plan',
    scriptHash: 'abc',
    audioPath: 'test.wav',
    durationSec: 10,
    profile: {
      engine: 'mock',
      voiceId: 'v1',
      speedCharsPerSec: 5,
      pitch: 'low',
      pauseSec: {comma: 0.3, period: 0.5, paragraph: 1.0},
    },
    evaluations: [
      {
        voiceId: 'v1',
        naturalness: 6, // 1〜5外
        pronunciation: 4,
        documentaryFit: 5,
        clarity: 5,
        reviewer: 'rev',
        reviewedAt: '2026-10-12',
      },
    ],
  };

  assert.throws(() => validateNarrationMetadata(invalidData), /naturalnessは1〜5の整数評価が必要/);
});

test('narration-evaluation: markdown report covers profile and evaluation matrix', () => {
  const reportPath = join(process.cwd(), 'fixtures/narration-evaluation-superstar.md');
  assert.ok(existsSync(reportPath), 'markdown report must exist');
  const content = readFileSync(reportPath, 'utf8');

  assert.match(content, /音声プロファイル仕様/);
  assert.match(content, /Audio Evaluation Matrix/);
  assert.match(content, /calm-baritone-v1/);
  assert.match(content, /音声品質チェックリスト結果/);
  assert.match(content, /結論/);
});
