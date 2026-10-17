// 制作CLI（produce）への事実・権利確認パイプラインの統合と台本承認ブロックのテスト（T171）
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {produce} from '../src/commands/produce.ts';
import {createProject, selectTopic, addReflection, attachScript, projectState} from '../src/production.ts';
import {getPipelineManifest} from '../src/orchestration-pipeline.ts';
import {checkedReportForTest} from './helpers/checked-facts.ts';

const T = 'test-agent';
const candidates = () => JSON.parse(readFileSync('fixtures/candidates-documentary.json', 'utf8'));
const draft = () => JSON.parse(readFileSync('fixtures/draft-documentary-superstar.json', 'utf8'));

function fixture(fn: (root: string) => Promise<void> | void) {
  return async () => {
    const root = mkdtempSync(join(tmpdir(), 'produce-fact-check-'));
    try {
      await fn(root);
    } finally {
      rmSync(root, {recursive: true, force: true});
    }
  };
}

test('produce fact-check: 事実確認レポート生成、エスカレーション時の承認ブロック、正常時の承認とマニフェスト更新', fixture(async root => {
  // 1. プロジェクト作成 → 題材選択 → 考察入力 → 台本作成
  const id = createProject(root, candidates(), {demo: true, by: T});
  selectTopic(root, id, 'superstar-economics', T);
  addReflection(root, id, 'テスト用の考察本文です。スーパースター現象について。', T);
  const s = attachScript(root, id, draft(), T, {draft: 'fixtures/draft-documentary-superstar.json'});
  assert.ok(s.hash);

  // 2. 事実確認未実施の状態で台本承認（approve）を試行 -> 拒否されること
  await assert.rejects(
    async () => {
      await produce(['script-review', id, 'approve', '--hash', s.hash, '--by', T], root);
    },
    /事実・権利確認レポート（fact-check\.json）がありません/
  );

  // 差戻し（reject）は事実確認未実施でも可能
  await assert.doesNotReject(async () => {
    await produce(['script-review', id, 'reject', '--hash', s.hash, '--by', T, '--note', '修正検討'], root);
  });

  // 3. エスカレーション（未確認主張）を含むレポートファイルを指定して produce fact-check を実行
  const invalidReport = {
    ...checkedReportForTest(root, id),
    claims: [
      {
        claim: '未確認の重大な経済的主張',
        sourceId: 'unknown-src',
        citation: '未確認文献',
        url: 'https://example.com/unverified',
        status: 'unverified',
        checkedAt: '2026-10-15',
      },
    ],
    assets: [
      {
        assetId: 'unknown-icon',
        type: 'svg',
        origin: 'unknown',
        license: 'Unknown License',
        attributionRequired: true,
        commercialUseAllowed: false,
        checkedAt: '2026-10-15',
      },
    ],
  };
  const invalidReportPath = join(root, 'invalid-report.json');
  writeFileSync(invalidReportPath, JSON.stringify(invalidReport, null, 2));

  await produce(['fact-check', id, '--report', invalidReportPath, '--by', T], root);

  // fact-check.json が生成されていること
  const factJsonPath = join(root, id, 'fact-check.json');
  assert.ok(existsSync(factJsonPath));
  const savedInvalid = JSON.parse(readFileSync(factJsonPath, 'utf8'));
  assert.equal(savedInvalid.ok, false);
  assert.ok(savedInvalid.escalations.length >= 2);

  // マニフェストの fact-check ステージが failed であること
  const m1 = getPipelineManifest(root, id);
  assert.equal(m1.stages['fact-check']?.status, 'failed');

  // 4. エスカレーションが存在する状態での承認試行 -> 拒否されること
  await assert.rejects(
    async () => {
      await produce(['script-review', id, 'approve', '--hash', s.hash, '--by', T], root);
    },
    /事実・権利確認にエスカレーション項目.*があるため承認できません/
  );

  // 5. Explicit synthetic certificate scoped to this test script.
  const validPath = join(root, 'checked-test-report.json');
  writeFileSync(validPath, JSON.stringify(checkedReportForTest(root, id)));
  await produce(['fact-check', id, '--report', validPath, '--by', T], root);

  const savedValid = JSON.parse(readFileSync(factJsonPath, 'utf8'));
  assert.equal(savedValid.ok, true);
  assert.equal(savedValid.escalations.length, 0);

  const m2 = getPipelineManifest(root, id);
  assert.equal(m2.stages['fact-check']?.status, 'completed');

  // 6. 正常なレポートの状態で台本承認（approve）を実行 -> 承認成功
  await produce(['script-review', id, 'approve', '--hash', s.hash, '--by', T], root);

  const st = projectState(root, id);
  assert.equal(st.scriptState, 'approved');

  // マニフェストの script-review ステージが completed であること
  const m3 = getPipelineManifest(root, id);
  assert.equal(m3.stages['script-review']?.status, 'completed');

  // 7. --report なしで台本から自動構成する produce fact-check の検証
  // 新規プロジェクト作成
  const id2 = createProject(root, candidates(), {demo: true, by: T});
  selectTopic(root, id2, 'superstar-economics', T);
  addReflection(root, id2, '考察', T);
  const s2 = attachScript(root, id2, draft(), T, {draft: 'fixtures/draft-documentary-superstar.json'});

  await produce(['fact-check', id2, '--by', T], root);
  const factAuto = JSON.parse(readFileSync(join(root, id2, 'fact-check.json'), 'utf8'));
  assert.equal(factAuto.schema, 1);
  assert.ok(factAuto.claims.length > 0);
  assert.ok(factAuto.assets.length > 0);
  assert.equal(factAuto.ok, false);
  assert.ok(factAuto.claims.every((c: any) => c.status === 'unverified'));
}));
