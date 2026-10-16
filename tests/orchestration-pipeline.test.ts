import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  createProject, selectTopic, addReflection, attachScript, reviewScript,
  readProject, projectState
} from '../src/production.ts';
import {
  getPipelineManifest, savePipelineManifest, assessStagePrerequisites,
  attachFactCheckReport, attachNarrationMetadata, advancePipelineStage
} from '../src/orchestration-pipeline.ts';

const candidates = () => JSON.parse(readFileSync('fixtures/topic-candidates-demo.json', 'utf8'));
const draft = () => JSON.parse(readFileSync('fixtures/draft-general-demo.json', 'utf8'));
const factCheckSuperstar = () => JSON.parse(readFileSync('fixtures/fact-check-superstar.json', 'utf8'));
const narrationSuperstar = () => JSON.parse(readFileSync('fixtures/narration-evaluation-superstar.json', 'utf8'));

const T = 'test-agent';
const H = 'テスト利用者';
const REFL = '値札の変化は目に入りやすいので、家計全体と分けて見るようにしたいと考えました。これは試験用の文です。';

function tmp(fn: (root: string) => Promise<void> | void) {
  return async () => {
    const root = mkdtempSync(join(tmpdir(), 'orch-test-'));
    try {
      await fn(root);
    } finally {
      rmSync(root, {recursive: true, force: true});
    }
  };
}

test('段階連携: 新規案件作成時のマニフェスト初期化と題材選択待ちの安全停止', tmp(async root => {
  const id = createProject(root, candidates(), {demo: true, by: T});
  const manifest = getPipelineManifest(root, id);
  assert.equal(manifest.projectId, id);
  assert.equal(manifest.mode, 'demo');

  const assess = assessStagePrerequisites(root, id);
  assert.equal(assess.canProceed, false);
  assert.equal(assess.currentStage, 'topic-selection');
  assert.equal(assess.waitingForHuman, true);
  assert.match(assess.nextAction, /題材候補を選択/);

  const res = await advancePipelineStage(root, id, {by: T});
  assert.equal(res.status, 'waiting_human');
  assert.equal(res.waitingForHuman, true);
  assert.match(res.message, /安全停止/);
}));

test('段階連携: 題材選択後の考察入力待ち安全停止', tmp(async root => {
  const id = createProject(root, candidates(), {demo: true, by: T});
  selectTopic(root, id, 'price-index', T);

  const assess = assessStagePrerequisites(root, id);
  assert.equal(assess.canProceed, false);
  assert.equal(assess.currentStage, 'reflection');
  assert.equal(assess.waitingForHuman, true);
  assert.match(assess.nextAction, /考察を入力/);
}));

test('段階連携: 考察入力後の台本作成可能判定と作成実行', tmp(async root => {
  const id = createProject(root, candidates(), {demo: true, by: T});
  selectTopic(root, id, 'price-index', T);
  addReflection(root, id, REFL, T);

  // 台本作成段階（エージェントが自律的に実行可能）
  const assess = assessStagePrerequisites(root, id);
  assert.equal(assess.canProceed, true);
  assert.equal(assess.currentStage, 'script');
  assert.equal(assess.waitingForHuman, false);

  const res = await advancePipelineStage(root, id, {by: T});
  assert.equal(res.status, 'running');

  // エージェントが台本を作成
  const s = attachScript(root, id, draft(), T, {draft: 'fixtures/draft-general-demo.json'});
  assert.ok(s.hash);

  // 台本作成後は「台本確認待ち」で安全停止
  const assessAfterScript = assessStagePrerequisites(root, id);
  assert.equal(assessAfterScript.canProceed, false);
  assert.equal(assessAfterScript.currentStage, 'script-review');
  assert.equal(assessAfterScript.waitingForHuman, true);
  assert.match(assessAfterScript.nextAction, /台本案.*承認/);
}));

test('段階連携: 事実・権利確認レポートの登録とエスカレーション時の停止', tmp(async root => {
  const id = createProject(root, candidates(), {demo: true, by: T});
  selectTopic(root, id, 'price-index', T);
  addReflection(root, id, REFL, T);
  const s = attachScript(root, id, draft(), T);

  // 正常な事実確認レポートの登録
  const validReport = attachFactCheckReport(root, id, factCheckSuperstar());
  assert.equal(validReport.ok, true);

  const manifest = getPipelineManifest(root, id);
  assert.equal(manifest.stages['fact-check'].status, 'completed');
  assert.ok(manifest.stages['fact-check'].outputVersion);

  // 未確認・エスカレーション項目を含むレポートは拒否される
  const badReportData = {
    ...factCheckSuperstar(),
    claims: [
      {
        claim: '未確認の主張',
        sourceId: 's1',
        citation: 'c1',
        url: 'https://example.com',
        status: 'unverified',
        checkedAt: '2026-10-13',
      },
    ],
  };
  assert.throws(
    () => attachFactCheckReport(root, id, badReportData),
    /エスカレーション/
  );
}));

test('段階連携: 音声メタデータ登録と台本ハッシュ整合性検証', tmp(async root => {
  const id = createProject(root, candidates(), {demo: true, by: T});
  selectTopic(root, id, 'price-index', T);
  addReflection(root, id, REFL, T);
  const s = attachScript(root, id, draft(), T);

  // 一致するメタデータ
  const validAudioData = {
    ...narrationSuperstar(),
    planId: id,
    scriptHash: s.hash,
  };
  const attached = attachNarrationMetadata(root, id, validAudioData);
  assert.equal(attached.planId, id);

  const manifest = getPipelineManifest(root, id);
  assert.equal(manifest.stages['audio-synthesis'].status, 'completed');

  // 台本ハッシュ不一致のメタデータは拒否される
  const invalidAudioData = {
    ...validAudioData,
    scriptHash: 'different-hash-12345',
  };
  assert.throws(
    () => attachNarrationMetadata(root, id, invalidAudioData),
    /整合性検証に失敗/
  );
}));

test('段階連携: 台本承認から制作可能判定への遷移', tmp(async root => {
  const id = createProject(root, candidates(), {demo: true, by: T});
  selectTopic(root, id, 'price-index', T);
  addReflection(root, id, REFL, T);
  const s = attachScript(root, id, draft(), T);

  // 承認前は拒否
  assert.equal(assessStagePrerequisites(root, id).canProceed, false);

  // 本人が承認
  reviewScript(root, id, 'approve', s.hash, '', T);

  // 承認後は制作可能（render）
  const assess = assessStagePrerequisites(root, id);
  assert.equal(assess.canProceed, true);
  assert.equal(assess.currentStage, 'render');
  assert.equal(assess.waitingForHuman, false);
  assert.match(assess.nextAction, /完成動画を制作/);
}));
