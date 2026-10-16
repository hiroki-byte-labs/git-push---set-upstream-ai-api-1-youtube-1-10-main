import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, writeFileSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {run} from '../src/trends-cli.ts';
import {csvCell, formatCsv} from '../src/trends-report.ts';

const NOW = new Date('2026-10-08T12:00:00Z');
const cli = async (args: string[], env: Record<string, string | undefined> = {}) => {
  const out: string[] = [], err: string[] = [];
  const code = await run(args, {out: s => out.push(s), err: s => err.push(s), env, now: () => NOW});
  return {code, out: out.join('\n'), err: err.join('\n')};
};
const store = () => mkdtempSync(join(tmpdir(), 'trends-cli-'));

test('trends-cli: 合成データの取込とカテゴリ・動画・チャンネル・推移のレポート', async () => {
  const s = store();
  assert.equal((await cli(['import', 'fixtures/trends/synthetic-history.json', '--store', s])).code, 0);
  const again = await cli(['import', 'fixtures/trends/synthetic-history.json', '--store', s]);
  assert.match(again.out, /追加 0件/);
  const cats = await cli(['report', 'categories', '--store', s, '--as-of', '2026-10-08T00:00:00.000Z']);
  assert.equal(cats.code, 0);
  assert.match(cats.out, /合成データ（試験用。YouTubeの実データではない）/);
  assert.match(cats.out, /YouTube全体のカテゴリ別視聴量ではない/);
  assert.match(cats.out, /^20\s+Gaming\s+1\s+4\s+25\s+2\s+5\s+40\s+15\s+200\s+1\s+low-sample$/m);
  const vids = await cli(['report', 'videos', '--store', s, '--as-of', '2026-10-08T00:00:00Z', '--category', '10']);
  assert.match(vids.out, /表示 2件 \/ 該当 2件/);
  assert.match(vids.out, /^vidA0000001\s+chX\s+10\s+.*\s7000\s+1000\s+7\s+0\s+-$/m);
  // 基準時刻の時点では最新の観測から12時間（鮮度の上限内）
  const now = await cli(['report', 'videos', '--store', s, '--video', 'vidA0000001']);
  assert.match(now.out, /\s0\.5\s+-$/m);
  const ch = await cli(['report', 'channels', '--store', s, '--as-of', '2026-10-08T00:00:00Z', '--format', 'json']);
  const rows = JSON.parse(ch.out).rows;
  assert.deepEqual([rows[0]['チャンネルID'], rows[0]['登録者 増加'], rows[0]['登録者 誤差±']], ['chX', 200, 100]);
  const series = await cli(['report', 'series', '--store', s, '--channel', 'chY']);
  assert.match(series.out, /取得したままの値/);
  // 古いデータは注記する
  const stale = await cli(['report', 'videos', '--store', s, '--as-of', '2026-10-20T00:00:00Z', '--video', 'vidA0000001']);
  assert.match(stale.out, /stale: データが古い/);
});

test('trends-cli: CSV出力は注記つきで、式として解釈される値を無害化する', async () => {
  const s = store();
  await cli(['import', 'fixtures/trends/synthetic-history.json', '--store', s]);
  const out = join(s, 'out', 'videos.csv');
  const r = await cli(['report', 'videos', '--store', s, '--as-of', '2026-10-08T00:00:00Z', '--format', 'csv', '--out', out]);
  assert.equal(r.code, 0);
  const csv = readFileSync(out, 'utf8');
  assert.match(csv, /^# 出典: 合成データ/);
  assert.match(csv, /^動画ID,チャンネルID,カテゴリ,タイトル,開始時刻/m);
  assert.match(csv, /^vidA0000001,chX,10,合成動画 vidA0000001,2026-10-01T00:00:00Z,2026-10-08T00:00:00Z,7,1000,8000,7000,1000,7,0,$/m);
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell('-1+2'), `'-1+2`);
  assert.equal(csvCell('@SUM(A1)'), `'@SUM(A1)`);
  assert.equal(csvCell(-5), '-5');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell(null), '');
  assert.equal(formatCsv({kind: 'videos', title: 't', notes: ['改行\nを含む'], columns: ['a'], rows: []}), '# 改行 を含む\na\n');
});

test('trends-cli: 無データ・不正な指定でもクラッシュしない', async () => {
  const s = store();
  for (const kind of ['categories', 'videos', 'channels']) {
    const r = await cli(['report', kind, '--store', s]);
    assert.equal(r.code, 0);
    assert.match(r.out, /データなし|該当なし/);
  }
  assert.equal((await cli(['report', 'series', '--store', s])).code, 2);
  assert.equal((await cli(['report', 'nope', '--store', s])).code, 2);
  assert.equal((await cli(['report', 'videos', '--store', s, '--window', '-1'])).code, 2);
  assert.equal((await cli(['report', 'videos', '--store', s, '--as-of', 'yesterday'])).code, 2);
  assert.equal((await cli(['report', 'videos', '--store', s, '--source', 'scraped'])).code, 2);
  assert.equal((await cli([])).code, 2);
  assert.equal((await cli(['unknown'])).code, 2);
  // 壊れた取込ファイルは履歴を変えない
  const bad = join(s, 'bad.json');
  writeFileSync(bad, JSON.stringify({schema: 'yt-trends-batch/v1', batchId: 'x'}));
  assert.equal((await cli(['import', bad, '--store', s])).code, 1);
  assert.equal(existsSync(join(s, 'store.json')), false);
});

// 合成データを、出所だけAPIに変えた複製（ポリシーの停止を試すため。実APIの値ではない）。
const apiCopy = (dir: string) => {
  const raw = JSON.parse(readFileSync('fixtures/trends/synthetic-history.json', 'utf8'));
  for (const b of raw.batches) { b.source = 'youtube-data-api'; b.batchId = `api-${b.batchId}`; }
  const file = join(dir, 'api-copy.json');
  writeFileSync(file, JSON.stringify(raw));
  return file;
};

test('trends-cli: APIデータの派生指標は承認の記録まで停止し、取得値の推移は出せる', async () => {
  const s = store();
  assert.equal((await cli(['import', apiCopy(s), '--store', s])).code, 0);
  const denied = await cli(['report', 'videos', '--store', s, '--source', 'youtube-data-api', '--as-of', '2026-10-08T00:00:00Z']);
  assert.equal(denied.code, 3);
  assert.match(denied.err, /III\.E\.4\.h/);
  const series = await cli(['report', 'series', '--store', s, '--source', 'youtube-data-api', '--video', 'vidA0000001']);
  assert.equal(series.code, 0);
  assert.match(series.out, /YouTube Data API v3/);
  assert.equal((await cli(['policy', 'set', '--profile', 'audited-derived-metrics', '--store', s])).code, 2); // 記録者なし
  assert.equal((await cli(['policy', 'set', '--profile', 'audited-derived-metrics', '--by', 'tester', '--store', s])).code, 1); // 参照なし
  assert.equal((await cli(['policy', 'set', '--profile', 'audited-derived-metrics', '--approval-ref', 'case-1', '--by', 'tester', '--store', s])).code, 0);
  assert.equal((await cli(['report', 'videos', '--store', s, '--source', 'youtube-data-api', '--as-of', '2026-10-08T00:00:00Z'])).code, 0);
  const cat = await cli(['report', 'categories', '--store', s, '--source', 'youtube-data-api', '--as-of', '2026-10-08T00:00:00Z']);
  assert.equal(cat.code, 3);
  assert.match(cat.err, /III\.E\.2/);
  assert.match((await cli(['policy', '--store', s])).out, /"recordedBy": "tester"/);
  // standardへ戻すと取得から30日を過ぎたAPIデータは削除される（基準: NOW=10-08なので残る）
  assert.equal((await cli(['policy', 'set', '--profile', 'standard', '--by', 'tester', '--store', s])).code, 0);
  assert.match((await cli(['status', '--store', s])).out, /youtube-data-api JP: batch 3/);
});

test('trends-cli: 模擬接続の収集・見積り・実接続のキー未設定', async () => {
  const s = store();
  const r = await cli(['collect', '--fixture', 'fixtures/trends/mock-api.json', '--videos', 'mockVid0009,mockGone001', '--pages', '2', '--store', s]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /synthetic（模擬 fixtures\/trends\/mock-api\.json）.*使用 5 unit/);
  assert.match((await cli(['status', '--store', s])).out, /synthetic JP: batch 1、動画の観測 5、チャンネルの観測 2/);
  // 模擬接続はクォータ台帳に数えない
  assert.match((await cli(['status', '--store', s])).out, /: 0 unit/);
  const dry = await cli(['collect', '--live', '--dry-run', '--charts', '0,10,20', '--run-limit', '10', '--store', s], {YOUTUBE_API_KEY: 'dummy'});
  assert.equal(dry.code, 8);
  assert.match(dry.out, /見積り 25 unit/);
  const nokey = await cli(['collect', '--live', '--store', s], {});
  assert.equal(nokey.code, 5);
  assert.match(nokey.err, /YOUTUBE_API_KEY が未設定/);
  assert.equal((await cli(['collect', '--store', s])).code, 2);
  // 模擬レスポンスがない要求は不正として停止し、履歴を変えない
  const before = readFileSync(join(s, 'store.json'), 'utf8');
  const miss = await cli(['collect', '--fixture', 'fixtures/trends/mock-api.json', '--region', 'US', '--store', s]);
  assert.equal(miss.code, 7);
  assert.match(miss.err, /履歴は変更していません/);
  assert.equal(readFileSync(join(s, 'store.json'), 'utf8'), before);
});

test('trends-cli: 削除・書き出し・保持期限・排他・破損からの復旧', async () => {
  const s = store();
  await cli(['import', 'fixtures/trends/synthetic-history.json', '--store', s]);
  await cli(['import', apiCopy(s), '--store', s]);
  assert.match((await cli(['delete', '--video', 'vidA0000001', '--source', 'synthetic', '--store', s])).out, /動画の観測 3件/);
  assert.equal((await cli(['delete', '--store', s])).code, 2);
  const exp = join(s, 'export.json');
  assert.equal((await cli(['export', exp, '--store', s])).code, 0);
  assert.equal(JSON.parse(readFileSync(exp, 'utf8')).batches.length, 6);
  // 30日後の時刻で開くとAPIデータは削除される
  const later = await run(['purge', '--store', s], {out: () => {}, err: () => {}, env: {}, now: () => new Date('2026-11-08T00:00:00Z')});
  assert.equal(later, 0);
  assert.doesNotMatch((await cli(['status', '--store', s])).out, /youtube-data-api/);
  writeFileSync(join(s, 'store.lock'), '1');
  assert.equal((await cli(['status', '--store', s])).code, 9);
  writeFileSync(join(s, 'store.lock'), '');
  const {rmSync} = await import('node:fs');
  rmSync(join(s, 'store.lock'));
  writeFileSync(join(s, 'store.json'), '{"schema":');
  const rec = await cli(['status', '--store', s]);
  assert.equal(rec.code, 0);
  assert.match(rec.err, /store\.json\.bak から復旧/);
});
