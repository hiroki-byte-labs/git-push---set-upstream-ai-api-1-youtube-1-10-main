import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {checkFactAndRights} from '../src/fact-check.ts';

test('fact-and-rights-check: SKILL.md exists and has valid front matter', () => {
  const skillPath = join(process.cwd(), '.agents/skills/fact-and-rights-check/SKILL.md');
  assert.ok(existsSync(skillPath), 'SKILL.md must exist');
  const content = readFileSync(skillPath, 'utf8');
  assert.match(content, /^---\nname: fact-and-rights-check\n/);
  assert.match(content, /description: .+/);
  assert.match(content, /## 1\. 事実・数値の照合手順/);
  assert.match(content, /## 2\. 素材利用権の確認手順/);
  assert.match(content, /## 3\. 人へのエスカレーション基準/);
  assert.match(content, /## 4\. 成果物仕様/);
});

test('fact-and-rights-check: validates valid superstar fixture', () => {
  const fixturePath = join(process.cwd(), 'fixtures/fact-check-superstar.json');
  assert.ok(existsSync(fixturePath), 'fixture must exist');
  const raw = JSON.parse(readFileSync(fixturePath, 'utf8'));
  const report = checkFactAndRights(raw);

  assert.equal(report.schema, 1);
  assert.equal(report.ok, true);
  assert.equal(report.escalations.length, 0);
  assert.equal(report.claims.length, 3);
  assert.equal(report.assets.length, 4);
  assert.equal(report.claims[0].status, 'verified');
  assert.equal(report.claims[2].status, 'inference');
});

test('fact-and-rights-check: unverified claim escalates and marks ok as false', () => {
  const badData = {
    schema: 1,
    planId: 'test-unverified',
    claims: [
      {
        claim: '西暦2531年に全員の名字が佐藤になる',
        value: '西暦2531年',
        sourceId: 'sato-news',
        citation: 'ネット記事の試算',
        url: 'https://example.com/sato',
        status: 'unverified',
        checkedAt: '2026-10-12',
      },
    ],
    assets: [
      {
        assetId: 'test-icon',
        type: 'svg',
        origin: 'original',
        license: 'MIT',
        attributionRequired: false,
        commercialUseAllowed: true,
        checkedAt: '2026-10-12',
      },
    ],
  };

  const report = checkFactAndRights(badData);
  assert.equal(report.ok, false);
  assert.equal(report.escalations.length, 1);
  assert.match(report.escalations[0], /未確認の主張.*西暦2531年/);
});

test('fact-and-rights-check: unknown or non-commercial asset escalates and marks ok as false', () => {
  const badAssetData = {
    schema: 1,
    planId: 'test-bad-asset',
    claims: [
      {
        claim: 'テストの主張',
        sourceId: 'src-1',
        citation: 'テスト論文',
        url: 'https://example.com/test',
        status: 'verified',
        checkedAt: '2026-10-12',
      },
    ],
    assets: [
      {
        assetId: 'scraped-image',
        type: 'image',
        origin: 'unknown',
        license: 'Unknown',
        attributionRequired: false,
        commercialUseAllowed: false,
        checkedAt: '2026-10-12',
      },
    ],
  };

  const report = checkFactAndRights(badAssetData);
  assert.equal(report.ok, false);
  assert.equal(report.escalations.length, 1);
  assert.match(report.escalations[0], /素材利用権の要確認.*scraped-image/);
});

test('fact-and-rights-check: markdown report covers claims and assets', () => {
  const reportPath = join(process.cwd(), 'fixtures/fact-check-superstar.md');
  assert.ok(existsSync(reportPath), 'markdown report must exist');
  const content = readFileSync(reportPath, 'utf8');

  assert.match(content, /Claim Matrix/);
  assert.match(content, /Rights Matrix/);
  assert.match(content, /rosen-1981/);
  assert.match(content, /silhouette-group-svg/);
  assert.match(content, /総合判定/);
});
