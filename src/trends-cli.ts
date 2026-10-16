// YouTube公開データのトレンド・成長分析CLI（T137）。収集（T134）・履歴（T135）・算出（T136）をつなぐ。
// 実APIへの接続は --live と環境変数 YOUTUBE_API_KEY の両方があるときだけ。運用は docs/TRENDS-OPERATIONS.md。
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {type Source, validatePolicy} from './trends-schema.ts';
import {
  DEFAULT_STORE_DIR, type TrendsStore, StoreError, deleteRecords, exportStore, importBatch, loadStore, purgeExpired,
  quotaDay, recordQuota, saveStore, setPolicy, withLock, withLockAsync,
} from './trends-store.ts';
import {
  API_KEY_ENV, CollectError, DEFAULT_DAILY_LIMIT, checkBudget, DEFAULT_RUN_LIMIT, collect, liveTransport, loadFixtureTransport,
} from './trends-collect.ts';
import {PolicyDenied} from './trends-metrics.ts';
import {type ReportKind, buildReport, formatCsv, formatJson, formatText} from './trends-report.ts';

export const USAGE = [
  'scripts/run src/trends-cli.ts <command> [--store work/trends]',
  '  status                                     履歴の件数・出所・クォータ使用量・ポリシー',
  '  import <file.json>                         batch（または {batches:[...]}）を取り込む',
  '  collect (--fixture <mock.json> | --live) [--region JP] [--charts 0,10] [--pages 1-4]',
  '          [--videos id,id] [--channels id,id] [--no-channel-stats] [--no-categories]',
  '          [--run-limit 200] [--daily-limit 10000] [--dry-run]',
  '  report categories|videos|channels|series [--source synthetic|youtube-data-api] [--region JP]',
  '          [--as-of ISO時刻] [--window 7] [--stale-days 2] [--category id] [--video id] [--channel id]',
  '          [--limit 50] [--format text|csv|json] [--out ファイル]',
  '  policy | policy set --profile standard|audited-derived-metrics [--approval-ref 参照] [--category-aggregation] --by 名前',
  '  purge                                      保持期限を過ぎたデータを削除する',
  '  delete (--video id | --channel id | --source 出所)',
  '  export <file.json>',
].join('\n');

const EXIT = {usage: 2, policy: 3, quota: 4, auth: 5, transient: 6, invalid: 7, budget: 8, store: 9};

function option(args: string[], name: string) {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  if (v === undefined || v.startsWith('--')) throw new UsageError(`${name} に値が必要です`);
  return v;
}
const list = (v: string | undefined) => v ? v.split(',').map(s => s.trim()).filter(Boolean) : [];
const num = (v: string | undefined, name: string, def: number) => {
  if (v === undefined) return def;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new UsageError(`${name} は正の数`);
  return n;
};

class UsageError extends Error {}

type Io = {out: (s: string) => void; err: (s: string) => void; env: Record<string, string | undefined>; now: () => Date};

// 読み込み直後に保持期限の削除を行う。削除があれば保存する。
function openPurged(dir: string, io: Io): TrendsStore {
  const {store, recoveredFromBackup} = loadStore(dir, io.now());
  if (recoveredFromBackup) io.err('警告: store.json が読めないため store.json.bak から復旧しました（次の保存で置き換わります）');
  const {store: purged, record} = purgeExpired(store, io.now());
  const removed = record.removedVideos + record.removedChannels + record.strippedMetadata;
  if (removed || recoveredFromBackup) {
    saveStore(dir, purged);
    if (removed) io.err(`保持期限により削除: 動画${record.removedVideos}件、チャンネル${record.removedChannels}件、タイトル等の消去${record.strippedMetadata}件`);
  }
  return purged;
}

export async function run(argv: string[], io: Io): Promise<number> {
  const [cmd, ...args] = argv;
  try {
    const dir = option(args, '--store') ?? DEFAULT_STORE_DIR;
    if (!cmd || cmd === 'help' || cmd === '--help') { io.out(USAGE); return cmd ? 0 : EXIT.usage; }

    if (cmd === 'status') {
      const s = withLock(dir, () => openPurged(dir, io));
      const by = new Map<string, {batches: number; videos: number; channels: number; latest: string}>();
      for (const b of s.batches) {
        const k = `${b.source} ${b.regionCode}`;
        const e = by.get(k) ?? {batches: 0, videos: 0, channels: 0, latest: ''};
        e.batches++; e.videos += b.videos.length; e.channels += b.channels.length;
        if (b.completedAt > e.latest) e.latest = b.completedAt;
        by.set(k, e);
      }
      io.out(`履歴: ${dir}/store.json（${s.batches.length} batch）`);
      for (const [k, e] of by) io.out(`  ${k}: batch ${e.batches}、動画の観測 ${e.videos}、チャンネルの観測 ${e.channels}、最新 ${e.latest}`);
      io.out(`ポリシー: ${s.policy.profile}${s.policy.approvalRef ? `（承認の参照 ${s.policy.approvalRef}）` : ''}、カテゴリ集計の承認 ${s.policy.categoryAggregationApproved ? 'あり' : 'なし'}`);
      io.out(`クォータ使用量（太平洋時間 ${quotaDay(io.now())}）: ${s.quotaLedger[quotaDay(io.now())] ?? 0} unit`);
      io.out(`削除の記録: ${s.deletions.length}件`);
      return 0;
    }

    if (cmd === 'import') {
      const file = args[0];
      if (!file || file.startsWith('--')) throw new UsageError('import <file.json>');
      const raw = JSON.parse(readFileSync(file, 'utf8'));
      const batches: unknown[] = Array.isArray(raw?.batches) ? raw.batches : [raw];
      return withLock(dir, () => {
        let s = openPurged(dir, io);
        let added = 0, dup = 0;
        for (const b of batches) { const r = importBatch(s, b); s = r.store; added += r.addedVideos + r.addedChannels; dup += r.duplicates; }
        s = purgeExpired(s, io.now()).store; // 取り込んだ時点で期限切れのものを残さない
        saveStore(dir, s);
        io.out(`取込: ${batches.length} batch、追加 ${added}件、重複 ${dup}件`);
        return 0;
      });
    }

    if (cmd === 'collect') {
      const live = args.includes('--live');
      const fixture = option(args, '--fixture');
      if (live === Boolean(fixture)) throw new UsageError('--fixture <mock.json> か --live のどちらか1つを指定してください');
      const source: Source = live ? 'youtube-data-api' : 'synthetic';
      const key = io.env[API_KEY_ENV];
      if (live && !key) { io.err(`${API_KEY_ENV} が未設定です。T133の手順でAPIキーを用意し、環境変数で渡してください（値をコマンドやログに書かない）`); return EXIT.auth; }
      const charts = option(args, '--charts');
      const plan = {
        regionCode: option(args, '--region') ?? 'JP',
        chartCategoryIds: charts === undefined ? ['0'] : list(charts),
        maxPages: num(option(args, '--pages'), '--pages', 4),
        trackVideoIds: list(option(args, '--videos')),
        trackChannelIds: list(option(args, '--channels')),
        includeChannels: !args.includes('--no-channel-stats'),
        includeCategories: !args.includes('--no-categories'),
      };
      return await withLockAsync(dir, async () => {
        let s = openPurged(dir, io);
        const budget = {dailyLimit: num(option(args, '--daily-limit'), '--daily-limit', DEFAULT_DAILY_LIMIT),
          runLimit: num(option(args, '--run-limit'), '--run-limit', DEFAULT_RUN_LIMIT), usedToday: live ? s.quotaLedger[quotaDay(io.now())] ?? 0 : 0};
        if (args.includes('--dry-run')) {
          const c = checkBudget(plan, budget);
          io.out(`見積り ${c.estimate} unit（本日の使用 ${budget.usedToday}、1回の上限 ${budget.runLimit}、日次上限 ${budget.dailyLimit}）: ${c.ok ? '送信可能' : c.reason}`);
          return c.ok ? 0 : EXIT.budget;
        }
        const transport = live ? liveTransport(key!) : loadFixtureTransport(fixture!);
        try {
          const r = await collect(plan, {transport, source, budget, now: io.now, secret: key, log: io.err});
          s = importBatch(s, r.batch).store;
          if (live) s = recordQuota(s, io.now(), r.unitsUsed);
          saveStore(dir, s);
          io.out(`収集: ${source}（${live ? '実接続' : `模擬 ${fixture}`}）batch ${r.batch.batchId}、動画 ${r.batch.videos.length}件、チャンネル ${r.batch.channels.length}件、使用 ${r.unitsUsed} unit（見積り上限 ${r.estimate}）`);
          return 0;
        } catch (e) {
          if (e instanceof CollectError) {
            // 失敗時も使ったunitは記録する。履歴（収集データ）は変更しない。
            if (live && e.unitsUsed) saveStore(dir, recordQuota(s, io.now(), e.unitsUsed));
            io.err(`${e.message}（使用 ${e.unitsUsed} unit。履歴は変更していません）`);
            return EXIT[e.kind];
          }
          throw e;
        }
      });
    }

    if (cmd === 'report') {
      const kind = args[0] as ReportKind;
      if (!['categories', 'videos', 'channels', 'series'].includes(kind)) throw new UsageError('report categories|videos|channels|series');
      const source = (option(args, '--source') ?? 'synthetic') as Source;
      if (source !== 'synthetic' && source !== 'youtube-data-api') throw new UsageError('--source は synthetic か youtube-data-api');
      const asOf = option(args, '--as-of') ?? io.now().toISOString();
      if (Number.isNaN(Date.parse(asOf))) throw new UsageError('--as-of はISO 8601時刻');
      if (kind === 'series' && !option(args, '--video') && !option(args, '--channel')) throw new UsageError('report series には --video または --channel が必要です');
      const format = option(args, '--format') ?? 'text';
      if (!['text', 'csv', 'json'].includes(format)) throw new UsageError('--format は text|csv|json');
      const s = withLock(dir, () => openPurged(dir, io));
      const opt = {source, regionCode: option(args, '--region') ?? 'JP', asOf: new Date(asOf).toISOString(),
        windowDays: num(option(args, '--window'), '--window', 7), staleDays: num(option(args, '--stale-days'), '--stale-days', 2)};
      const limitOpt = option(args, '--limit');
      const report = buildReport(kind, s.batches, s.policy, opt, {
        categoryId: option(args, '--category'), channelId: option(args, '--channel'), videoId: option(args, '--video'),
        limit: limitOpt === undefined ? undefined : num(limitOpt, '--limit', 50),
      });
      const text = format === 'csv' ? formatCsv(report) : format === 'json' ? formatJson(report) : formatText(report) + '\n';
      const out = option(args, '--out');
      if (out) {
        mkdirSync(dirname(out), {recursive: true});
        writeFileSync(out, text);
        io.out(`出力: ${out}（${report.rows.length}行）`);
      } else io.out(text.trimEnd());
      return 0;
    }

    if (cmd === 'policy') {
      if (args[0] !== 'set') {
        const s = withLock(dir, () => openPurged(dir, io));
        io.out(JSON.stringify(s.policy, null, 1));
        return 0;
      }
      const by = option(args, '--by');
      if (!by) throw new UsageError('policy set には記録者 --by が必要です');
      return withLock(dir, () => {
        let s = openPurged(dir, io);
        s = setPolicy(s, validatePolicy({profile: option(args, '--profile'), approvalRef: option(args, '--approval-ref') ?? null,
          categoryAggregationApproved: args.includes('--category-aggregation'), recordedBy: by, recordedAt: io.now().toISOString()}));
        s = purgeExpired(s, io.now()).store; // 期限が短くなる変更をすぐ適用する
        saveStore(dir, s);
        io.out(`ポリシーを記録: ${s.policy.profile}`);
        return 0;
      });
    }

    if (cmd === 'purge') {
      return withLock(dir, () => { openPurged(dir, io); io.out('保持期限の確認を完了'); return 0; });
    }

    if (cmd === 'delete') {
      const filter = {videoId: option(args, '--video'), channelId: option(args, '--channel'), source: option(args, '--source')};
      if (!filter.videoId && !filter.channelId && !filter.source) throw new UsageError('delete には --video / --channel / --source のいずれかが必要です');
      return withLock(dir, () => {
        const r = deleteRecords(openPurged(dir, io), io.now(), filter);
        saveStore(dir, r.store);
        io.out(`削除: 動画の観測 ${r.record.removedVideos}件、チャンネルの観測 ${r.record.removedChannels}件`);
        return 0;
      });
    }

    if (cmd === 'export') {
      const file = args[0];
      if (!file || file.startsWith('--')) throw new UsageError('export <file.json>');
      return withLock(dir, () => { exportStore(openPurged(dir, io), file); io.out(`書き出し: ${file}`); return 0; });
    }

    throw new UsageError(`不明なコマンド: ${cmd}`);
  } catch (e) {
    if (e instanceof UsageError) { io.err(`${e.message}\n\n${USAGE}`); return EXIT.usage; }
    if (e instanceof PolicyDenied) {
      io.err(`停止: ${e.message}\n派生しない取得値の推移は report series --video/--channel で時点つきで確認できます。根拠: docs/RESEARCH-TRENDS-API.md`);
      return EXIT.policy;
    }
    if (e instanceof StoreError) { io.err(`履歴のエラー: ${e.message}`); return EXIT.store; }
    io.err(`エラー: ${(e as Error).message}`);
    return 1;
  }
}

if (import.meta.main) {
  run(process.argv.slice(2), {out: s => console.log(s), err: s => console.error(s), env: process.env, now: () => new Date()})
    .then(code => { process.exitCode = code; });
}
