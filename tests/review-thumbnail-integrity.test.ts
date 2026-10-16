import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {reviewBundle, bundleHash, approvalOf, recordReview, publishReadiness} from '../src/review.ts';
import {reviseThumbnail} from '../src/metadata.ts';

import {createHash} from 'node:crypto';

const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

function createMockJobDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'review-thumb-'));
  const videoContent = 'mock video content';
  const videoHash = sha256(videoContent);
  const job = {
    id: 'test-job-1',
    kind: 'production-job',
    mode: 'demo',
    status: 'completed',
    outputHash: videoHash,
    inputHash: 'hash-input-1',
    thumbnails: [
      {file: 'thumbnail-a.png', ok: true, issues: []},
      {file: 'thumbnail-b.png', ok: true, issues: []},
      {file: 'thumbnail-c.png', ok: false, issues: ['コントラスト不足']},
    ],
    thumbnailQuality: {
      ok: true,
      canProceed: true,
      allPassed: false,
      selectedVariant: 'a',
      reasons: [],
    },
  };
  writeFileSync(join(d, 'job.json'), JSON.stringify(job, null, 2));
  writeFileSync(join(d, 'sample.mp4'), 'mock video content');
  writeFileSync(join(d, 'subtitles.vtt'), 'WEBVTT\n');
  writeFileSync(join(d, 'thumbnail-a.png'), 'image a');
  writeFileSync(join(d, 'thumbnail-b.png'), 'image b');
  writeFileSync(join(d, 'thumbnail-c.png'), 'image c');
  writeFileSync(join(d, 'thumbnail-brief.json'), JSON.stringify({schema: 'thumbnail-brief@1', planId: 'p1'}));
  const metadata = {
    selectedTitle: 'タイトル1',
    description: '概要欄1',
    tags: ['タグ1'],
    chapters: [{time: '00:00', title: '導入'}],
    selectedThumbnail: 'thumbnail-a.png',
  };
  writeFileSync(join(d, 'metadata.json'), JSON.stringify(metadata, null, 2));
  return d;
}

test('採用a→bの変更で承認が失効し旧bundleHashを拒否（T166）', () => {
  const d = createMockJobDir();
  try {
    const bundleBefore = reviewBundle(d);
    const hashBefore = bundleHash(bundleBefore);

    // 最初は a を承認
    recordReview(d, 'approve', '初版承認', hashBefore, 'human-reviewer');
    const appBefore = approvalOf(d);
    assert.equal(appBefore.state, 'approved');

    // 採用サムネイルを a から b に変更
    reviseThumbnail(d, 'thumbnail-b.png', 'より良い構図のため変更', 'human-reviewer');

    // bundleHash が変化していること
    const bundleAfter = reviewBundle(d);
    const hashAfter = bundleHash(bundleAfter);
    assert.notEqual(hashBefore, hashAfter, '採用サムネイルの変更でbundleHashが変わるべき');

    // 事前の承認が失効（expired）していること
    const appAfter = approvalOf(d);
    assert.equal(appAfter.state, 'expired');
    assert.ok(appAfter.reason.includes('失効') || appAfter.reason.includes('確認対象'));

    // 古い hashBefore での承認は拒否されること
    assert.throws(() => {
      recordReview(d, 'approve', '古い版での承認試行', hashBefore, 'human-reviewer');
    }, /表示していた版と現在の版が異なる/);

    // 新しい hashAfter であれば承認できること
    recordReview(d, 'approve', 'b版承認', hashAfter, 'human-reviewer');
    assert.equal(approvalOf(d).state, 'approved');
  } finally {
    rmSync(d, {recursive: true, force: true});
  }
});

test('brief変更や画像差替えでbundleHashが変わり失効（T166）', () => {
  const d = createMockJobDir();
  try {
    const bundle1 = reviewBundle(d);
    const hash1 = bundleHash(bundle1);
    recordReview(d, 'approve', '承認', hash1, 'human-reviewer');

    // 1. thumbnail-brief.json を変更
    writeFileSync(join(d, 'thumbnail-brief.json'), JSON.stringify({schema: 'thumbnail-brief@1', planId: 'p1', updated: true}));
    const bundle2 = reviewBundle(d);
    const hash2 = bundleHash(bundle2);
    assert.notEqual(hash1, hash2, 'brief変更でbundleHashが変わるべき');
    assert.equal(approvalOf(d).state, 'expired');

    // 承認し直す
    recordReview(d, 'approve', 'brief更新後承認', hash2, 'human-reviewer');
    assert.equal(approvalOf(d).state, 'approved');

    // 2. thumbnail-a.png 画像本体を差替え
    writeFileSync(join(d, 'thumbnail-a.png'), 'new image content a');
    const bundle3 = reviewBundle(d);
    const hash3 = bundleHash(bundle3);
    assert.notEqual(hash2, hash3, '画像本体の差替えでbundleHashが変わるべき');
    assert.equal(approvalOf(d).state, 'expired');
  } finally {
    rmSync(d, {recursive: true, force: true});
  }
});

test('不合格・未検査・欠落のサムネイル候補の承認拒否（T166）', () => {
  const d = createMockJobDir();
  try {
    // 不合格の c を採用に変更
    reviseThumbnail(d, 'thumbnail-c.png', '不合格候補を採用', 'human-reviewer');
    const bundle = reviewBundle(d);
    const hash = bundleHash(bundle);

    // 不合格候補（thumbnail-c.pngはissuesあり）が採用されている場合は承認を拒否
    assert.throws(() => {
      recordReview(d, 'approve', '不合格案を承認しようとする', hash, 'human-reviewer');
    }, /品質検査/);

    // 未検査（thumbnailQualityなし）の場合も承認を拒否
    const job = JSON.parse(readFileSync(join(d, 'job.json'), 'utf8'));
    delete job.thumbnailQuality;
    delete job.thumbnails;
    writeFileSync(join(d, 'job.json'), JSON.stringify(job, null, 2));

    reviseThumbnail(d, 'thumbnail-a.png', '戻す', 'human-reviewer');
    const bundle2 = reviewBundle(d);
    const hash2 = bundleHash(bundle2);

    assert.throws(() => {
      recordReview(d, 'approve', '未検査ジョブを承認しようとする', hash2, 'human-reviewer');
    }, /未検査/);
  } finally {
    rmSync(d, {recursive: true, force: true});
  }
});

test('公開前判定（publishReadiness）で不合格・未検査サムネイルを拒否（T166）', () => {
  const d = createMockJobDir();
  try {
    // 1. 不合格の c を採用している場合
    reviseThumbnail(d, 'thumbnail-c.png', '不合格を採用', 'human-reviewer');
    const ready1 = publishReadiness(d);
    assert.equal(ready1.ok, false);
    assert.ok(ready1.reasons.some(r => r.includes('品質検査に不合格')));

    // 2. 未検査（品質検査記録なし）の場合
    const job = JSON.parse(readFileSync(join(d, 'job.json'), 'utf8'));
    delete job.thumbnailQuality;
    delete job.thumbnails;
    writeFileSync(join(d, 'job.json'), JSON.stringify(job, null, 2));
    reviseThumbnail(d, 'thumbnail-a.png', '戻す', 'human-reviewer');

    const ready2 = publishReadiness(d);
    assert.equal(ready2.ok, false);
    assert.ok(ready2.reasons.some(r => r.includes('未検査')));
  } finally {
    rmSync(d, {recursive: true, force: true});
  }
});
