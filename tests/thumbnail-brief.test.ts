import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadPlan} from '../src/plan.ts';
import {
  THUMBNAIL_BRIEF_SCHEMA,
  THUMBNAIL_OBSERVATION_SCHEMA,
  validateObservationLedger,
  validateThumbnailBrief,
  assertNotObservationAsset,
  calculatePlanThumbnailInputHash,
  convertPlanThumbnailToBrief,
} from '../src/thumbnail-brief.ts';
import type {ThumbnailBrief} from '../src/thumbnail-brief.ts';

const samplePlan = () => loadPlan(JSON.parse(readFileSync('fixtures/sample-v2.json', 'utf8')));
const observationLedger = () => JSON.parse(readFileSync('logs/2026-10-16/013217-T159-debb3f3e/evidence/observations.json', 'utf8'));

test('観察台帳の契約照合（T160）: 既存12標本JSONが適合する', () => {
  const ledger = validateObservationLedger(observationLedger());
  assert.equal(ledger.schema, THUMBNAIL_OBSERVATION_SCHEMA);
  assert.equal(ledger.sampleCount, 12);
  assert.equal(ledger.samples.length, 12);
  assert.equal(ledger.samples[0].sampleId, 'S01');
  assert.equal(ledger.samples[11].sampleId, 'S12');
  for (const s of ledger.samples) {
    assert.match(s.sha256, /^[a-f0-9]{64}$/);
    assert.match(s.thumbnailUrl, /^https?:\/\//);
    assert.ok(s.bytes > 0);
  }
});

test('観察台帳の異常系（T160）: schema不一致・件数不一致・不正hash・重複idを拒否', () => {
  const raw = observationLedger();
  assert.throws(() => validateObservationLedger({...raw, schema: 'unknown'}), /schema/);
  assert.throws(() => validateObservationLedger({...raw, sampleCount: 11}), /一致しません/);
  
  const badHash = JSON.parse(JSON.stringify(raw));
  badHash.samples[0].sha256 = 'invalid-hash';
  assert.throws(() => validateObservationLedger(badHash), /sha256/);

  const dup = JSON.parse(JSON.stringify(raw));
  dup.samples[1].sampleId = 'S01';
  assert.throws(() => validateObservationLedger(dup), /重複/);
});

test('参考画像URLの制作素材への流用防止（T160）: URLや外部参照の混入を拒否する', () => {
  const raw = observationLedger();
  const sampleUrl = raw.samples[0].thumbnailUrl;

  // assertNotObservationAssetによる拒否
  assert.throws(() => assertNotObservationAsset(sampleUrl), /参考画像URL/);
  assert.throws(() => assertNotObservationAsset('https://example.com/asset.png'), /参考画像URL/);
  assert.throws(() => assertNotObservationAsset('https://i.ytimg.com/vi/xyz/default.jpg'), /参考画像URL/);
  assert.throws(() => assertNotObservationAsset('invalid space'), /不正なassetId形式/);

  // 正常な自作素材識別子は許可
  assert.doesNotThrow(() => assertNotObservationAsset('builtin:symbol-focus'));
  assert.doesNotThrow(() => assertNotObservationAsset('asset:crowd-silhouette_v1'));
  assert.doesNotThrow(() => assertNotObservationAsset('assets/thumbnail-originals/icon-1.svg'));
});

test('旧Plan.thumbnailからのBrief変換（T160）: 3候補・決定論的ハッシュ・互換動作', () => {
  const plan = samplePlan();
  const brief = convertPlanThumbnailToBrief(plan);

  assert.equal(brief.schema, THUMBNAIL_BRIEF_SCHEMA);
  assert.equal(brief.planId, plan.id);
  assert.equal(brief.candidates.length, 3);
  assert.deepEqual(brief.candidates.map(c => c.id), ['a', 'b', 'c']);
  assert.equal(brief.overallStatus, 'ready');

  // inputHashの検証
  assert.equal(brief.inputHash, calculatePlanThumbnailInputHash(plan));
  assert.match(brief.inputHash, /^[a-f0-9]{64}$/);

  // 決定論的: 同じPlanからは常に同じinputHash
  assert.equal(calculatePlanThumbnailInputHash(plan), calculatePlanThumbnailInputHash(plan));

  // 案a, b, cの構図と根拠
  assert.equal(brief.candidates[0].composition, 'symbol');
  assert.equal(brief.candidates[1].id, 'b');
  assert.equal(brief.candidates[2].composition, 'contrast');

  // 参考画像URLを含まない
  for (const c of brief.candidates) {
    for (const a of c.assets) {
      assertNotObservationAsset(a.assetId);
    }
  }
});

test('旧Plan.thumbnailの省略値・代替挙動の維持（T160）: title/promise/keyword/contrast', () => {
  const plan = samplePlan();
  delete plan.thumbnail;
  plan.title = 'テスト題名';
  plan.promise = 'テスト約束文';

  const brief1 = convertPlanThumbnailToBrief(plan);
  assert.equal(brief1.candidates[0].headline, 'テスト題名');
  assert.equal(brief1.candidates[0].sub, 'テスト約束文');

  // keyword & contrast の反映
  const plan2 = samplePlan();
  plan2.thumbnail = {
    headline: '独自見出し',
    sub: '独自補足',
    keyword: '重要語',
    contrast: ['左項目', '右項目'],
  };
  const brief2 = convertPlanThumbnailToBrief(plan2);
  assert.equal(brief2.candidates[0].headline, '独自見出し');
  assert.equal(brief2.candidates[0].sub, '独自補足');
  assert.deepEqual(brief2.candidates[0].motifs, ['重要語']);
  assert.deepEqual(brief2.candidates[2].motifs, ['左項目', '右項目']);
});

test('生成briefの検証と拒否（T160）: 不正hash・候補数不足・重複id・未知構図・過長文字・空見出し', () => {
  const plan = samplePlan();
  const validBrief = convertPlanThumbnailToBrief(plan);

  // 不正なhash
  assert.throws(
    () => validateThumbnailBrief({...validBrief, inputHash: 'abc'}, plan),
    /inputHash/
  );
  // Planの計算結果と合わないhash
  assert.throws(
    () => validateThumbnailBrief({...validBrief, inputHash: '0'.repeat(64)}, plan),
    /一致しません/
  );

  // 候補数が3以外
  assert.throws(
    () => validateThumbnailBrief({...validBrief, candidates: validBrief.candidates.slice(0, 2)}, plan),
    /ちょうど3候補/
  );

  // 重複候補ID
  const dupId = JSON.parse(JSON.stringify(validBrief));
  dupId.candidates[1].id = 'a';
  assert.throws(() => validateThumbnailBrief(dupId, plan), /重複/);

  // 未知構図
  const badComp = JSON.parse(JSON.stringify(validBrief));
  badComp.candidates[0].composition = 'unknown-style';
  assert.throws(() => validateThumbnailBrief(badComp, plan), /未知の構図/);

  // 空見出し
  const emptyHeadline = JSON.parse(JSON.stringify(validBrief));
  emptyHeadline.candidates[0].headline = '';
  assert.throws(() => validateThumbnailBrief(emptyHeadline, plan), /headlineは1〜20字/);

  // 過長見出し (21字)
  const longHeadline = JSON.parse(JSON.stringify(validBrief));
  longHeadline.candidates[0].headline = 'あ'.repeat(21);
  assert.throws(() => validateThumbnailBrief(longHeadline, plan), /headlineは1〜20字/);

  // 過長補足 (31字)
  const longSub = JSON.parse(JSON.stringify(validBrief));
  longSub.candidates[0].sub = 'あ'.repeat(31);
  assert.throws(() => validateThumbnailBrief(longSub, plan), /subは30字以内/);

  // 参照先欠落（存在しない場面番号）
  const badScene = JSON.parse(JSON.stringify(validBrief));
  badScene.candidates[0].grounding.sceneIndex = 999;
  assert.throws(() => validateThumbnailBrief(badScene, plan), /場面数.*を超えています/);

  // 参照先欠落（存在しない出典id）
  const badSource = JSON.parse(JSON.stringify(validBrief));
  badSource.candidates[0].grounding.sourceIds = ['non-existent-source'];
  assert.throws(() => validateThumbnailBrief(badSource, plan), /未定義の出典id/);

  // assetIdへの外部URL混入
  const urlAsset = JSON.parse(JSON.stringify(validBrief));
  urlAsset.candidates[0].assets = [{assetId: 'https://i.ytimg.com/vi/test.jpg', rightsBasis: 'fair-use'}];
  assert.throws(() => validateThumbnailBrief(urlAsset, plan), /参考画像URL/);
});

test('未確認事項の扱い（T160）: unknownを成功値にせずneeds-reviewを強制する', () => {
  const plan = samplePlan();
  const base = convertPlanThumbnailToBrief(plan);

  // 候補にunknownsがあるのにcandidate.statusが'ready'なら拒否
  const unk1 = JSON.parse(JSON.stringify(base));
  unk1.candidates[0].unknowns = ['文字の可読性が縮小時未確認'];
  unk1.candidates[0].status = 'ready';
  assert.throws(() => validateThumbnailBrief(unk1, plan), /未確認事項.*needs-review/);

  // 候補にunknownsがあるのにoverallStatusが'ready'なら拒否
  const unk2 = JSON.parse(JSON.stringify(base));
  unk2.candidates[0].unknowns = ['文字の可読性が縮小時未確認'];
  unk2.candidates[0].status = 'needs-review';
  unk2.overallStatus = 'ready';
  assert.throws(() => validateThumbnailBrief(unk2, plan), /未確認事項.*overallStatus.*needs-review/);

  // 正しくcandidateとoverallStatusを'needs-review'にした場合は受理される
  const validNeedsReview = JSON.parse(JSON.stringify(base));
  validNeedsReview.candidates[0].unknowns = ['文字の可読性が縮小時未確認'];
  validNeedsReview.candidates[0].status = 'needs-review';
  validNeedsReview.overallStatus = 'needs-review';
  const validated = validateThumbnailBrief(validNeedsReview, plan);
  assert.equal(validated.overallStatus, 'needs-review');
  assert.equal(validated.candidates[0].status, 'needs-review');
  assert.deepEqual(validated.candidates[0].unknowns, ['文字の可読性が縮小時未確認']);
});
