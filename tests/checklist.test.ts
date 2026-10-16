import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {loadPlan, LIMITS} from '../src/plan.ts';
import {buildChecklist, writeChecklist} from '../src/checklist.ts';
import {buildMetadata, YT} from '../src/metadata.ts';
import {sourcesText} from '../src/channel.ts';
import {lintPlan} from '../src/lint.ts';
import {reviewBundle, bundleHash, recordReview, approvalOf} from '../src/review.ts';
import {createHandler} from '../src/commands/serve.ts';
import type {IncomingMessage, ServerResponse} from 'node:http';

const demo = () => loadPlan(JSON.parse(readFileSync('fixtures/checklist-demo.json', 'utf8')));
test('台本の指定原文・場面・出典・架空表示を保持し、全項目を概要欄に接続', () => {
  const p = demo(), c = buildChecklist(p);
  assert.equal(c.items.length, 4);
  assert.deepEqual(c.items.map(x => x.text), p.scenes.flatMap(s => s.practice ?? []));
  assert.equal(c.items[0].fictional, true);
  assert.equal(c.items[3].scene, 2);
  assert.equal(c.items[3].sources[0].url, p.sources[0].url);
  assert.deepEqual(c.pages.map(p => p.lines.length), [3, 1]);
  const m = buildMetadata(p, {sources: sourcesText(p), stance: ''});
  assert.ok(m.description.includes(c.text));
  assert.match(m.description, /場面1・架空の例/);
  assert.match(m.description, /場面2 \/ 出典\[1\]/);
  assert.ok(Buffer.byteLength(m.description) <= YT.descriptionBytes);
  assert.equal(m.ok, true);
  assert.equal(lintPlan(p).ok, true);
});
test('未指定の旧台本は助言を補完せずテキストと画像ページを出す', () => {
  const p = loadPlan(JSON.parse(readFileSync('fixtures/sample.json', 'utf8'))), c = buildChecklist(p);
  assert.equal(c.items.length, 0);
  assert.equal(c.pages.length, 1);
  assert.match(c.text, /実践項目の指定がありません/);
});
test('原文にない項目・未出典・不正参照・制御文字・長文・項目超過を拒否', () => {
  const mutate = (fn: (p: any) => void) => {const p = demo(); fn(p); return () => loadPlan(p);};
  assert.throws(mutate(p => p.scenes[0].practice = ['新しい助言です。']), /原文/);
  assert.throws(mutate(p => p.scenes[0].practice = ['比べる品']), /原文の一文/);
  assert.throws(mutate(p => p.scenes[0].fictional = false), /出典/);
  assert.throws(mutate(p => p.scenes[1].sources = ['missing']), /存在しない出典/);
  assert.throws(mutate(p => p.scenes[0].practice = ['メモ\n']), /原文/);
  assert.throws(mutate(p => p.scenes[0].practice = ['あ'.repeat(81)]), /80字/);
  assert.throws(mutate(p => p.scenes[0].practice = Array(12).fill(p.scenes[0].practice[0])), /全体で12/);
  assert.throws(mutate(p => p.scenes[0].practice = []), /1〜12/);
});
test('actionは末尾・実践あり・字幕と音声の案内あり、免責を弱めない', () => {
  const p = demo();
  const noItems = structuredClone(p); noItems.scenes.forEach(s => delete s.practice);
  assert.throws(() => loadPlan(noItems), /action/);
  const early = structuredClone(p); early.scenes[0].role = 'action'; early.scenes[2].role = 'recap';
  assert.throws(() => loadPlan(early), /action/);
  const noCue = structuredClone(p); noCue.scenes[2].cues[0].text = '確認しましょう。';
  assert.throws(() => loadPlan(noCue), /action/);
  p.scenes[2].narration = 'チェックリストを読み返しましょう。';
  assert.ok(lintPlan(p).findings.some(f => f.rule === 'disclaimer'));
});
test('最大文字数12項目を4ページへ欠落なく分割し、概要欄超過も記録', () => {
  const p = demo(), text = '確認'.repeat(40);
  p.scenes[0].seconds = 120; p.scenes[0].cues = [{text: '架空の練習です。', seconds: 120}];
  p.scenes[0].narration = text; p.scenes[0].practice = Array(LIMITS.practiceItems).fill(text);
  delete p.scenes[1].practice;
  const c = buildChecklist(p);
  assert.equal(c.pages.length, 4);
  assert.equal(c.pages.flatMap(p => p.lines).length, 12);
  const m = buildMetadata(p, {sources: '文'.repeat(1000), stance: ''});
  assert.equal(m.ok, false);
  assert.match(m.issues.join(), /5000バイト/);
  assert.ok(m.description.includes(c.text));
});
test('テキストはURL・確認日を保存し、チェックリスト変更・欠落・追加で承認失効', () => {
  const d = mkdtempSync(join(tmpdir(), 'checklist-review-'));
  try {
    const c = buildChecklist(demo()); writeChecklist(d, c);
    assert.match(readFileSync(join(d, 'checklist.txt'), 'utf8'), /https:\/\/www.stat.go.jp\/data\/cpi\//);
    assert.match(readFileSync(join(d, 'checklist.txt'), 'utf8'), /2026-10-10/);
    writeFileSync(join(d, 'sample.mp4'), 'fake');
    writeFileSync(join(d, 'job.json'), JSON.stringify({status: 'completed', outputHash: createHash('sha256').update('fake').digest('hex'), checklist: {files: ['checklist-1.png', 'checklist-2.png']}}));
    writeFileSync(join(d, 'checklist-1.png'), 'fake-png');
    writeFileSync(join(d, 'checklist-2.png'), 'fake-png');
    const approve = () => recordReview(d, 'approve', 'デモの試験', bundleHash(reviewBundle(d)), 'test-agent');
    approve(); assert.equal(approvalOf(d).state, 'approved');
    writeFileSync(join(d, 'checklist.txt'), 'changed'); assert.equal(approvalOf(d).state, 'expired');
    approve(); rmSync(join(d, 'checklist-1.png')); assert.equal(approvalOf(d).state, 'expired');
    assert.throws(approve, /成果物が欠落/);
    writeFileSync(join(d, 'checklist-1.png'), 'restored');
    approve(); writeFileSync(join(d, 'checklist-3.png'), 'added'); assert.equal(approvalOf(d).state, 'expired');
  } finally {rmSync(d, {recursive: true, force: true});}
});
test('確認画面と限定GET経路からチェックリストを確認できる（HTTPハンドラー単体）', async () => {
  const root = mkdtempSync(join(tmpdir(), 'checklist-http-')), d = join(root, 'checklist-aaaaaaaa');
  const {mkdirSync} = await import('node:fs'); mkdirSync(d);
  writeChecklist(d, buildChecklist(demo()));
  writeFileSync(join(d, 'checklist-1.png'), 'fake-png');
  writeFileSync(join(d, 'job.json'), JSON.stringify({id: 'checklist-aaaaaaaa', status: 'completed', outputHash: 'fake', mode: 'demo'}));
  const handler = createHandler(root);
  const get = async (path: string) => {
    let status = 0, headers: any, body = '';
    const req = {url: `/job/checklist-aaaaaaaa${path}`, method: 'GET', headers: {host: '127.0.0.1:4173'}} as IncomingMessage;
    const res = {writeHead: (s: number, h: any) => {status = s; headers = h;}, end: (value: any) => {body = String(value ?? '');}} as unknown as ServerResponse;
    await handler(req, res);
    return {status, headers, body};
  };
  try {
    assert.match((await get('')).body, /checklist-1.png/);
    assert.match((await get('/checklist.txt')).body, /比べる品をメモ/);
    assert.equal((await get('/checklist-1.png')).headers['Content-Type'], 'image/png');
    assert.equal((await get('/checklist-report.json')).status, 404);
    assert.equal((await get('/checklist-../plan.json')).status, 404);
  } finally {rmSync(root, {recursive: true, force: true});}
});
