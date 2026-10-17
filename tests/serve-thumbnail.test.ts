// Web UI確認画面（serve）での採用サムネイル切り替えUIと操作エンドポイントのテスト（T169）
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {approvalOf, recordReview} from '../src/review.ts';
import {buildMetadata} from '../src/metadata.ts';
import {loadPlan} from '../src/plan.ts';
import {createHandler} from '../src/commands/serve.ts';

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const R = 'test-agent';

function fixture(fn: (dir: string, root: string) => Promise<void> | void) {
  return async () => {
    const root = mkdtempSync(join(tmpdir(), 'serve-thumb-'));
    try {
      const id = 'demo-12345678';
      const d = join(root, id);
      mkdirSync(d, {recursive: true});
      const mp4 = Buffer.from('fake-mp4');
      writeFileSync(join(d, 'sample.mp4'), mp4);
      writeFileSync(join(d, 'subtitles.vtt'), 'WEBVTT\n\n00:00.000 --> 00:02.000\n字幕\n');
      const plan = loadPlan(JSON.parse(readFileSync('fixtures/sample-v2.json', 'utf8')));
      writeFileSync(join(d, 'plan.json'), JSON.stringify(plan));
      writeFileSync(join(d, 'metadata.json'), JSON.stringify(buildMetadata(plan, {sources: '出典: なし', stance: '免責'}), null, 2));
      const thumbs = ['a', 'b', 'c'].map(v => {
        writeFileSync(join(d, `thumbnail-${v}.png`), 'png-' + v);
        return {file: `thumbnail-${v}.png`, ok: true, issues: [], sha256: sha('png-' + v)};
      });
      writeFileSync(join(d, 'job.json'), JSON.stringify({id, status: 'completed', createdAt: new Date().toISOString(), inputHash: 'in', outputHash: sha(mp4), thumbnails: thumbs}));
      await fn(d, root);
    } finally {
      rmSync(root, {recursive: true, force: true});
    }
  };
}

test('Web UIでサムネイル切り替えフォームが表示され、サムネイル変更で新版ハッシュ計算・旧承認失効・新承認が可能', fixture(async (d, root) => {
  // 1. まず初期状態で承認
  recordReview(d, 'approve', '初期承認', approvalOf(d).currentHash!, R);
  assert.equal(approvalOf(d).state, 'approved');
  const initialHash = approvalOf(d).currentHash;

  const handler = createHandler(root);
  const srv = createServer((req, res) => {
    if (req.headers['x-test-evil-host']) {
      req.headers.host = 'evil.com';
    } else {
      req.headers.host = '127.0.0.1:4173';
    }
    handler(req, res);
  });
  await new Promise<void>(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;

  try {
    // 2. 詳細画面取得: フォームとラジオボタンの存在確認
    const page1 = await (await fetch(base + '/job/demo-12345678')).text();
    assert.match(page1, /action="\/job\/demo-12345678\/revise-thumbnail"/);
    assert.match(page1, /name="thumbnail" value="thumbnail-a\.png" checked/);
    assert.match(page1, /name="thumbnail" value="thumbnail-b\.png"/);
    assert.match(page1, /name="thumbnail" value="thumbnail-c\.png"/);
    assert.match(page1, /name="reason"/);

    // 3. CSRF保護のテスト: 不正なHostヘッダーで403
    const badHostRes = await fetch(base + '/job/demo-12345678/revise-thumbnail', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-test-evil-host': '1',
      },
      body: new URLSearchParams({
        thumbnail: 'thumbnail-b.png',
        reason: '視認性の向上',
      }).toString(),
    });
    assert.equal(badHostRes.status, 403);

    // 不正なOriginヘッダーでも403
    const badOriginRes = await fetch(base + '/job/demo-12345678/revise-thumbnail', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        origin: 'http://evil.com',
      },
      body: new URLSearchParams({
        thumbnail: 'thumbnail-b.png',
        reason: '視認性の向上',
      }).toString(),
    });
    assert.equal(badOriginRes.status, 403);

    // 4. 不正な理由（空）で送信 -> 409エラー
    const emptyReasonRes = await fetch(base + '/job/demo-12345678/revise-thumbnail', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        thumbnail: 'thumbnail-b.png',
        reason: '   ',
      }).toString(),
      redirect: 'manual',
    });
    assert.equal(emptyReasonRes.status, 409);
    const errText = await emptyReasonRes.text();
    assert.match(errText, /見直しの理由/);

    // 5. 不正なサムネイルファイル名で送信 -> 409エラー
    const invalidThumbRes = await fetch(base + '/job/demo-12345678/revise-thumbnail', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        thumbnail: 'thumbnail-x.png',
        reason: '無効なサムネイル',
      }).toString(),
      redirect: 'manual',
    });
    assert.equal(invalidThumbRes.status, 409);

    // 6. 正常なサムネイル切り替え送信 (thumbnail-a.png -> thumbnail-b.png)
    const successRes = await fetch(base + '/job/demo-12345678/revise-thumbnail', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        thumbnail: 'thumbnail-b.png',
        reason: '縮小表示での視認性向上のため',
        by: 'web-operator',
      }).toString(),
      redirect: 'manual',
    });
    assert.equal(successRes.status, 303);
    assert.equal(successRes.headers.get('Location'), '/job/demo-12345678');

    // 7. 切り替え後の確認: metadata.jsonが更新され、旧承認が失効、ハッシュが更新されている
    const metaJson = JSON.parse(readFileSync(join(d, 'metadata.json'), 'utf8'));
    assert.equal(metaJson.selectedThumbnail, 'thumbnail-b.png');

    const appAfter = approvalOf(d);
    assert.equal(appAfter.state, 'expired');
    assert.notEqual(appAfter.currentHash, initialHash);

    // 8. 再描画された詳細画面でthumbnail-b.pngが採用中になり、新版での承認フォームが提供される
    const page2 = await (await fetch(base + '/job/demo-12345678')).text();
    assert.match(page2, /name="thumbnail" value="thumbnail-b\.png" checked/);
    const newBundleHash = page2.match(/name="bundleHash" value="([a-f0-9]{64})"/)?.[1];
    assert.equal(newBundleHash, appAfter.currentHash);

    // 9. 新版での承認を実行
    const approveRes = await fetch(base + '/job/demo-12345678/review', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        decision: 'approve',
        note: 'サムネイルb採用後の新版承認',
        bundleHash: newBundleHash!,
        reviewer: 'operator',
      }).toString(),
      redirect: 'manual',
    });
    assert.equal(approveRes.status, 303);
    assert.equal(approvalOf(d).state, 'approved');
  } finally {
    srv.close();
  }
}));
