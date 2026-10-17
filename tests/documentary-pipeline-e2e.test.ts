import {reviewWithCheckedFactsForTest, checkedReportForTest} from './helpers/checked-facts.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {
  createProject, selectTopic, addReflection, attachScript, readProject, projectState, assertRenderable, linkRender, readScript
} from '../src/production.ts';
import {
  getPipelineManifest, assessStagePrerequisites, attachFactCheckReport,
  attachNarrationMetadata, advancePipelineStage
} from '../src/orchestration-pipeline.ts';
import {
  sliceScriptForNarration, synthesizeLongFormAudio, checkSubtitleSync,
  calculateBgmDucking, checkAudioLoudness
} from '../src/audio-pipeline.ts';
import {buildMetadata} from '../src/metadata.ts';
import {approvalOf, recordReview, publishReadiness, workflowStatus} from '../src/review.ts';
import {MockConnection, ConnError} from '../src/connections.ts';
import {Budget} from '../src/budget.ts';
import {lintPlan} from '../src/lint.ts';
import {buildSegments, buildRenderSpec, FPS} from '../src/timeline.ts';

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const candidates = () => JSON.parse(readFileSync('fixtures/candidates-documentary.json', 'utf8'));
const draft = () => JSON.parse(readFileSync('fixtures/draft-documentary-superstar.json', 'utf8'));
const factCheckSuperstar = () => JSON.parse(readFileSync('fixtures/fact-check-superstar.json', 'utf8'));
const narrationSuperstar = () => JSON.parse(readFileSync('fixtures/narration-evaluation-superstar.json', 'utf8'));

const T = 'test-agent';
const H = 'テスト利用者';
const REFL = 'スーパースターの存在は必然ですが、自分自身の独自の価値を見つけることの大切さを感じました。';

function tmp(fn: (root: string) => Promise<void> | void) {
  return async () => {
    const root = mkdtempSync(join(tmpdir(), 'pipeline-e2e-'));
    try {
      await fn(root);
    } finally {
      rmSync(root, {recursive: true, force: true});
    }
  };
}

// 制作ジョブ（隔離環境での模擬レンダリング）
function fakeRender(root: string, id: string, jobId: string) {
  const st = projectState(root, id);
  const d = join(root, jobId);
  mkdirSync(d, {recursive: true});
  const mp4 = Buffer.from('fake-mp4-' + jobId);
  writeFileSync(join(d, 'sample.mp4'), mp4);
  writeFileSync(join(d, 'subtitles.vtt'), 'WEBVTT\n\n00:00:00.000 --> 00:00:04.000\nテスト\n');
  writeFileSync(
    join(d, 'metadata.json'),
    JSON.stringify(buildMetadata(readScript(root, id, st.script!), {sources: '一次資料', stance: '学術的解説'}))
  );
  writeFileSync(
    join(d, 'thumbnail-a.png'),
    Buffer.from('thumb-a')
  );
  writeFileSync(
    join(d, 'job.json'),
    JSON.stringify({
      id: jobId,
      kind: 'production-job',
      status: 'completed',
      createdAt: new Date().toISOString(),
      inputHash: 'in-hash',
      outputHash: sha(mp4),
      mode: st.mode,
      project: id,
      scriptHash: st.script!.hash,
      scriptVersion: st.script!.version,
      thumbnails: [{file: 'thumbnail-a.png', ok: true, issues: [], sha256: sha(Buffer.from('thumb-a'))}],
      thumbnailQuality: {ok: true, canProceed: true, allPassed: true, selectedVariant: 'a', reasons: []},
      events: ['rendered'],
    })
  );
  linkRender(root, id, jobId, st.script!.hash, st.script!.version);
  return d;
}

test('E2E正常系: 題材候補選定から考察・台本作成・事実確認・音声・承認・動画承認まで一気通貫で完走する', tmp(async root => {
  // 1. 題材候補から新規案件作成（デモ）
  const id = createProject(root, candidates(), {demo: true, by: T});
  assert.equal(projectState(root, id).stage, 'topic-selection');

  // 2. 本人が題材を選択（superstar-economics）
  selectTopic(root, id, 'superstar-economics', T);
  assert.equal(projectState(root, id).stage, 'reflection');

  // 3. 本人が考察を入力
  addReflection(root, id, REFL, T);
  assert.equal(projectState(root, id).stage, 'script');

  // 4. エージェントが台本案を作成・考察注入
  const s = attachScript(root, id, draft(), T, {draft: 'fixtures/draft-documentary-superstar.json'});
  assert.ok(s.hash);
  const plan = readScript(root, id, s);
  assert.equal(lintPlan(plan).ok, true);

  // 5. 事実確認・素材権利レポートの登録と検証（T124）
  const factReport = attachFactCheckReport(root, id, checkedReportForTest(root, id));
  assert.equal(factReport.ok, true);
  assert.equal(factReport.escalations.length, 0);

  // 6. 音声スライス分割・合成・字幕同期・ダッキング・音量検査（T127）
  const slices = sliceScriptForNarration(plan);
  assert.ok(slices.length >= 10);

  // 音声スライスごとの長さに合わせた合成
  const mockAudioConn: any = {
    domain: 'audio',
    provider: 'mock-tts',
    model: 'mock-voice',
    mode: 'mock',
    call: async (input: any) => ({
      output: {audioPath: 'mock/path/audio.wav', durationSec: input.expectedDurationSec},
      usage: {
        domain: 'audio',
        provider: 'mock-tts',
        model: 'mock-voice',
        mode: 'mock',
        requestId: 'mock-req',
        inputUnits: 0,
        outputUnits: input.expectedDurationSec,
        costUsd: 0,
      },
    }),
  };
  const budget = new Budget(10.0);
  const audioRes = await synthesizeLongFormAudio(slices, mockAudioConn, budget, 0.001);
  assert.equal(audioRes.slices.length, slices.length);
  assert.ok(audioRes.totalDurationSec > 0);

  // 字幕同期確認
  const syncCheck = checkSubtitleSync(plan, audioRes.slices);
  assert.equal(syncCheck.ok, true);

  // BGMダッキング計算
  const ducking = calculateBgmDucking(audioRes.slices);
  assert.equal(ducking.bgmVolumeDb, -18);
  assert.equal(ducking.duckedVolumeDb, -28);

  // 音量基準適合性判定
  const loud = checkAudioLoudness(-14.0, -1.2);
  assert.equal(loud.passed, true);

  // 音声メタデータの登録
  const audioMetadata = {
    ...narrationSuperstar(),
    planId: id,
    scriptHash: s.hash,
  };
  attachNarrationMetadata(root, id, audioMetadata);

  // 7. 本人が台本を確認・承認（produce script-review）
  assert.equal(projectState(root, id).stage, 'script-review');
  reviewWithCheckedFactsForTest(root, id, 'approve', s.hash, '', T);
  assert.equal(projectState(root, id).stage, 'render');

  // 8. 制作ジョブの実行とリンク
  const jobId = 'prod-job-superstar-001';
  const renderDir = fakeRender(root, id, jobId);

  // 9. 完成動画の確認・承認（本人の工程）
  const app = approvalOf(renderDir);
  assert.equal(app.state, 'pending');
  assert.equal(workflowStatus(root, id).stage, 'video-review');

  recordReview(renderDir, 'approve', '', app.currentHash!, T);
  assert.equal(approvalOf(renderDir).state, 'approved');
  assert.equal(workflowStatus(root, id).stage, 'done');

  // マニフェストが追跡されていること
  const manifest = getPipelineManifest(root, id);
  assert.ok(manifest.stages['fact-check']);
  assert.ok(manifest.stages['audio-synthesis']);
}));

test('安全停止: 本人の必須承認（台本承認・動画承認）をスキップした進行を厳格に拒否する', tmp(async root => {
  const id = createProject(root, candidates(), {demo: true, by: T});
  selectTopic(root, id, 'superstar-economics', T);
  addReflection(root, id, REFL, T);
  const s = attachScript(root, id, draft(), T);

  // 台本未承認のまま制作（assertRenderable）を試みると拒否される
  assert.throws(
    () => assertRenderable(root, id),
    /台本が未承認/
  );

  const assess = assessStagePrerequisites(root, id);
  assert.equal(assess.canProceed, false);
  assert.equal(assess.waitingForHuman, true);
  assert.match(assess.nextAction, /本人が台本案.*承認/);

  // advancePipelineStage も安全停止する
  const adv = await advancePipelineStage(root, id, {by: T});
  assert.equal(adv.status, 'waiting_human');
  assert.match(adv.message, /安全停止/);
}));

test('安全停止: 事実確認での未確認項目または権利不明素材の混入時にブロックする', tmp(async root => {
  const id = createProject(root, candidates(), {demo: true, by: T});
  selectTopic(root, id, 'superstar-economics', T);
  addReflection(root, id, REFL, T);
  attachScript(root, id, draft(), T);

  // 未確認主張が含まれるレポート
  const badFactReport = {
    ...checkedReportForTest(root, id),
    claims: [
      {
        claim: '西暦3000年には全人類がAIになる',
        sourceId: 'unverified-source',
        citation: '根拠なしの推測',
        url: 'https://example.com/ai',
        status: 'unverified',
        checkedAt: '2026-10-13',
      },
    ],
  };

  assert.throws(
    () => attachFactCheckReport(root, id, badFactReport),
    /エスカレーション項目があるため台本承認へ進めません/
  );
}));

test('安全停止: 音声合成時の予算超過・失敗が安全に停止し既存成果物を保護する', tmp(async root => {
  const id = createProject(root, candidates(), {demo: true, by: T});
  selectTopic(root, id, 'superstar-economics', T);
  addReflection(root, id, REFL, T);
  const s = attachScript(root, id, draft(), T);
  const plan = readScript(root, id, s);
  const slices = sliceScriptForNarration(plan);

  // 予算上限が低すぎる場合（0.001 USD 上限で0.01見積り）
  const mockConn = new MockConnection<any, {audioPath: string; durationSec: number}>(
    'audio',
    'mock-tts',
    'mock-voice',
    {audioPath: 'mock/path/audio.wav', durationSec: 10}
  );
  const tightBudget = new Budget(0.001);

  await assert.rejects(
    async () => {
      await synthesizeLongFormAudio(slices, mockConn, tightBudget, 0.01);
    },
    /上限/
  );

  // 台本ファイル等の既存成果物は破壊されずに残る
  assert.ok(existsSync(join(root, id, s.file)));
}));

test('承認失効: 台本承認後に考察や題材が変更された場合、台本承認および旧動画承認が失効する', tmp(async root => {
  const id = createProject(root, candidates(), {demo: true, by: T});
  selectTopic(root, id, 'superstar-economics', T);
  addReflection(root, id, REFL, T);
  const s = attachScript(root, id, draft(), T);
  reviewWithCheckedFactsForTest(root, id, 'approve', s.hash, '', T);

  const jobId = 'prod-job-superstar-002';
  const renderDir = fakeRender(root, id, jobId);
  recordReview(renderDir, 'approve', '', approvalOf(renderDir).currentHash!, T);

  assert.equal(approvalOf(renderDir).state, 'approved');

  // 考察を後から更新（v2）
  addReflection(root, id, REFL + 'さらに追記した新しい考察です。', T);

  // 台本状態が stale になり、動画の承認も失効する
  const stAfter = projectState(root, id);
  assert.equal(stAfter.scriptState, 'stale');
  assert.throws(() => assertRenderable(root, id), /考察が更新/);

  const appAfter = approvalOf(renderDir);
  assert.equal(appAfter.state, 'expired');
  assert.match(appAfter.reason, /台本の作成後に考察が更新された|台本が変わった/);
}));
