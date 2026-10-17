// CLIの入口。各コマンドの実装は src/commands/ にある（T014で分割）。
import {resolve} from 'node:path';
import {available, loadTickets} from './tickets.ts';
import {checkLogs} from './worklog.ts';
import {sample, parseSampleArgs} from './commands/sample.ts';
import {serve} from './commands/serve.ts';
import {FixtureScript} from './providers.ts';
import {lintPlan, formatLint} from './lint.ts';
import {listJobs, abandon, planClean, applyClean, JOB_ID} from './jobs.ts';
import {approvalOf, recordReview, publishReadiness} from './review.ts';
import {produce, PRODUCE_USAGE, stageLabel} from './commands/produce.ts';
import {projectState, PROJECT_ID} from './production.ts';
import {reviseTitle, reviseThumbnail} from './metadata.ts';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const usage = [
  'scripts/run src/cli.ts <command>',
  '  tickets | next | check',
  '  lint [--plan 台本.json]',
  '  sample [--plan 台本.json] [--subtitles burn|soft|both] [--budget-usd 上限] [--resolution 720|1080] [--renderer native|remotion] [--audio mock|say|voicevox] [--queue] [--queue-dir ディレクトリ] [--concurrency 並行数]',
  '  serve                                  127.0.0.1:4173 でジョブ一覧・確認画面',
  '  jobs | jobs abandon <id> [--note 文] | jobs clean [--apply]',
  '  review <id> | review <id> approve|reject --hash <sha256> [--note 文] [--reviewer 名前]',
  '  metadata <id> | metadata <id> revise (--title 新タイトル | --thumbnail 新サムネイル) --reason 理由 [--by 名前]',
  '  （本人の工程を通す本番の制作。sampleは常にデモ）',
  PRODUCE_USAGE,
].join('\n');
const cmd = process.argv[2] ?? 'help';

function listTickets() {
  for (const t of loadTickets()) console.log(`${t.id} ${t.owner.padEnd(5)} ${t.status.padEnd(11)} ${t.priority} ${t.milestone} deps=${t.depends.join(',') || '-'} ${t.title}`);
}

function next() {
  const ts = loadTickets();
  for (const owner of ['human', 'agent']) {
    console.log(`\n${owner === 'human' ? '私が次に行う作業' : 'AIエージェントが着手可能な作業'}`);
    console.log(available(ts, owner).map(t => `${t.id} ${t.title}`).join('\n') || 'なし');
    console.log('review: ' + ts.filter(t => t.owner === owner && t.status === 'review').map(t => t.id).join(', '));
  }
}

function check() {
  console.log(`OK: ${loadTickets().length} tickets`);
  console.log('Logs: ' + JSON.stringify(checkLogs(resolve('.'))));
}

// 台本だけを検査する（T042）。errorがあれば終了コード1。
async function lint(args: string[]) {
  const plan = await new FixtureScript(parseSampleArgs(args).plan).create();
  const r = lintPlan(plan);
  console.log(formatLint(r));
  if (!r.ok) process.exitCode = 1;
}

function option(args: string[], name: string) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

// ジョブ管理（T033）。cleanは既定で候補の表示だけ（--applyで移動。削除はしない）。
function jobs(args: string[]) {
  const [sub, id] = args;
  if (!sub) {
    for (const j of listJobs()) {
      const extra = PROJECT_ID.test(j.id) ? `工程:${stageLabel(projectState('outputs', j.id).stage)}` : `確認:${j.approval}`;
      console.log(`${j.id}  ${j.mode === 'production' ? '本番' : 'デモ'}  ${j.status}${j.stale ? '(中断の疑い)' : ''}  ${j.createdAt}  ${j.durationSeconds ?? '-'}秒  ${extra}`);
    }
  } else if (sub === 'abandon' && id) {
    console.log(`abandoned: ${abandon('outputs', id, option(args, '--note') ?? '').id}`);
  } else if (sub === 'clean') {
    const plan = planClean();
    console.log(`退避候補: ジョブ${plan.jobs.length}件（failed/abandoned → outputs/_trash/）、直下ファイル${plan.loose.length}件（→ outputs/_archive/日付/）`);
    for (const j of plan.jobs) console.log(`  job  ${j.id} (${j.status})`);
    for (const n of plan.loose) console.log(`  file ${n}`);
    if (args.includes('--apply')) for (const m of applyClean('outputs', plan)) console.log(`移動: ${m}`);
    else console.log('（表示のみ。移動するには --apply）');
  } else throw Error(usage);
}

// 承認・差戻し（T033、T095）。--hashには `review <id>` で表示される確認対象一式の現在の版を渡す（別の版の誤承認を防ぐ）。
function review(args: string[]) {
  const [id, decision] = args;
  if (!id || !JOB_ID.test(id)) throw Error(usage);
  const dir = join('outputs', id);
  if (!decision) {
    const a = approvalOf(dir);
    const b = a.bundle;
    const ready = publishReadiness(dir);
    console.log(`${id}: ${a.state}（${a.reason}）\n区分: ${a.mode === 'production' ? '本番' : 'デモ（本人の工程を経ていない。本番の承認に転用できない）'}${a.project ? ` / 制作案件 ${a.project}` : ''}\n現在の版（確認対象一式）: ${a.currentHash ?? '-'}`);
    if (b?.script !== undefined) console.log(`  台本の版 ${b.script ?? 'なし'}`);
    console.log(`公開前の判定: ${ready.ok ? '可（投稿機能は未実装・無効）' : '不可 - ' + ready.reasons.join(' / ')}`);
    if (b) console.log(`  動画 ${b.video ?? 'なし'}\n  字幕 ${b.subtitles ?? 'なし'}\n  タイトル ${b.metadata?.selectedTitle ?? 'なし'}\n  サムネイル ${b.thumbnails.map(t => t.file + (t.sha256 ? '' : '(なし)')).join(', ') || 'なし'}`);
    return;
  }
  // エージェントが動作確認で記録する場合は --reviewer にエージェント名を入れ、人の承認と区別する。
  const e = recordReview(dir, decision as any, option(args, '--note') ?? '', option(args, '--hash') ?? '', option(args, '--reviewer') ?? 'cli-user');
  console.log(`記録: ${e.decision} 一式の版 ${e.bundleHash} ${e.at}`);
}

// タイトル等の表示と、公開後の見直しの記録（T074/T118）。
function metadata(args: string[]) {
  const [id, sub] = args;
  if (!id || !JOB_ID.test(id)) throw Error(usage);
  const dir = join('outputs', id);
  if (sub === 'revise') {
    const title = option(args, '--title');
    const thumb = option(args, '--thumbnail');
    const reason = option(args, '--reason') ?? '';
    const by = option(args, '--by') ?? 'cli-user';
    if (title) {
      const r = reviseTitle(dir, title, reason, by);
      console.log(`記録: タイトル ${r.from} → ${r.to}（${r.reason}）`);
    } else if (thumb) {
      const r = reviseThumbnail(dir, thumb, reason, by);
      console.log(`記録: サムネイル ${r.from} → ${r.to}（${r.reason}）`);
    } else {
      throw Error('--title または --thumbnail が必要\n' + usage);
    }
    return;
  }
  const m = JSON.parse(readFileSync(join(dir, 'metadata.json'), 'utf8'));
  console.log(`タイトル: ${m.selectedTitle}\n採用サムネイル: ${m.selectedThumbnail ?? 'thumbnail-a.png'}\n候補: ${m.titles.join(' / ')}\n問題: ${m.issues.join(' / ') || 'なし'}\n\n${m.description}`);
}

try {
  if (cmd === 'tickets') listTickets();
  else if (cmd === 'next') next();
  else if (cmd === 'check') check();
  else if (cmd === 'sample') await sample(parseSampleArgs(process.argv.slice(3)));
  else if (cmd === 'lint') await lint(process.argv.slice(3));
  else if (cmd === 'serve') serve();
  else if (cmd === 'jobs') jobs(process.argv.slice(3));
  else if (cmd === 'review') review(process.argv.slice(3));
  else if (cmd === 'metadata') metadata(process.argv.slice(3));
  else if (cmd === 'produce') await produce(process.argv.slice(3));
  else console.log(usage);
} catch (e) {
  console.error(String(e));
  process.exitCode = 1;
}
