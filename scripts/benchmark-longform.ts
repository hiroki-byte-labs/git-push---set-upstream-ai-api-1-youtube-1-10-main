// scripts/benchmark-longform.ts
// T175: 長尺（10〜20分）制作ジョブにおけるリソース消費・メモリリーク・プロセス耐久性ベンチマーク

import {existsSync, mkdirSync, readFileSync, statSync, writeFileSync, readdirSync, cpSync, symlinkSync, mkdtempSync, realpathSync, lstatSync, createWriteStream} from 'node:fs';
import {finished} from 'node:stream/promises';
import {join, resolve, dirname, basename, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {spawn, spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {validatePlanV2, totalSeconds} from '../src/plan.ts';
import type {Plan, Scene, Diagram} from '../src/plan.ts';
import {lintPlan, formatLint} from '../src/lint.ts';
import {inspectRemotionMedia} from '../src/remotion-media.ts';

export type BenchmarkOptions = {
  minutes: number;
  renderer: 'native' | 'remotion';
  audio: 'mock' | 'say';
  dir?: string;
  dryRun?: boolean;
  maxRssMb?: number;
  maxDiskMb?: number;
  timeoutSeconds?: number;
};

export type BenchmarkReport = {
  schema: 2;
  timestamp: string;
  durationMinutes: number;
  durationSeconds: number;
  totalFrames: number;
  renderer: string;
  audio: string;
  dryRun: boolean;
  directory: string;
  outcome: 'estimated' | 'passed' | 'failed';
  estimates?: {rssMb: number; diskMb: number; withinThresholds: boolean};
  process?: {exitCode: number | null; signal: string | null; error?: string};
  resources: {
    peakRssMb: number | null;
    diskUsageMb: number | null;
    elapsedSeconds: number | null;
    fps: number | null;
    speedRatio: number | null;
    samplingIntervalMs: number;
    samples: number;
    processes: ProcessPeak[];
    errors: string[];
  };
  safetyThresholds: {
    maxRssMb: number;
    maxDiskMb: number;
    passed: boolean | null;
    violations: string[];
  };
  mediaValidation?: {
    videoFrames: number;
    expectedFrames: number;
    fullDecodePassed: boolean;
    avPlayerEnded?: boolean;
    error?: string;
    videoDuration?: number;
    audioDuration?: number;
    artifactSha256?: string;
    path?: string;
  };
};

type ProcessSample = {pid: number; ppid: number; rssKb: number; command: string};
type ProcessPeak = {pid: number; command: string; peakRssMb: number};
// Test commands run in the same isolated workspace; production always uses the real sample CLI.
export type BenchmarkDependencies = {renderCommand?: (workspace: string, planPath: string) => {executable: string; args: string[]}};
const sourceRoot = realpathSync(fileURLToPath(new URL('../', import.meta.url)));

export const DEFAULT_MAX_RSS_MB = 3072; // 3 GiB
export const DEFAULT_MAX_DISK_MB = 500;  // 500 MB

/**
 * 10〜20分の長尺台本をプロシージャルに生成する。
 * 各場面に flow, compare, number, branch, meter を配置し、安全検査（lint）をパスする正式台本。
 */
export function generateLongformPlan(targetMinutes: number): Plan {
  const targetSeconds = targetMinutes * 60;
  const sceneDuration = 30; // 1場面あたり30秒
  const sceneCount = Math.max(1, Math.round(targetSeconds / sceneDuration));

  const sources = [
    {id: 'stat-doc', title: '長尺耐久性評価統計資料', url: 'https://example.org/stats', accessedAt: '2026-10-16'},
    {id: 'benchmark-ref', title: 'リソースベンチマーク基準書', url: 'https://example.org/benchmark', accessedAt: '2026-10-16'},
  ];

  const diagrams: Diagram[] = [
    {type: 'flow', items: ['観測データ収集', '負荷状況解析', '結果フィードバック']},
    {type: 'compare', left: '通常短尺', right: '長尺動画', leftItems: ['メモリ即時解放', '低ディスク負荷'], rightItems: ['累積メモリ消費', '耐久性検査必須']},
    {type: 'number', value: '28,800', label: '最大描画フレーム数', note: '20分・24fpsにおける総フレーム数'},
    {type: 'branch', question: '耐久性基準を満たしているか？', yes: '長尺制作承認', no: '安全停止・改善'},
    {type: 'meter', bars: [{label: 'CPU', value: 0.65}, {label: 'RAM', value: 0.45}, {label: 'Disk', value: 0.3}], total: '全体負荷率47%'},
  ];

  const scenes: Scene[] = [];
  const chapters = ['導入と問題提起', '基本メカニズムの検証', '長時間運用の実態', '改善と今後の指針'];

  for (let i = 0; i < sceneCount; i++) {
    const isLast = i === sceneCount - 1;
    const isAction = i === sceneCount - 2;
    const chapterIdx = Math.min(chapters.length - 1, Math.floor((i / sceneCount) * chapters.length));
    const diagram = diagrams[i % diagrams.length];

    let narration = `場面${i + 1}の説明です。長尺レンダリングにおけるプロセスの挙動とリソース使用量を継続的に観察しています。`;
    let cues = [
      {text: `場面${i + 1}の計測を開始します。`, seconds: 10},
      {text: 'リソースの消費量とメモリの推移を監視します。', seconds: 10},
      {text: '安定したフレーム生成が維持されています。', seconds: 10},
    ];

    let role: any = 'body';
    if (i === 0) {
      // 冒頭場面: hook
      role = 'hook';
      narration = `長尺動画を安定して書き出すには何が必要でしょうか？場面${i + 1}の計測を開始します。`;
      cues = [
        {text: '長尺動画を安定して書き出すには何が必要でしょうか？', seconds: 15},
        {text: 'リソースの消費量とメモリの推移を監視します。', seconds: 15},
      ];
    } else if (isAction) {
      role = 'action';
      narration = '長尺制作時のリソース監視チェックリストを確認し、システムが安全基準内にあるか点検しましょう。';
      cues = [
        {text: 'チェックリストを確認しましょう。', seconds: 10},
        {text: 'メモリとディスクの消費量を点検します。', seconds: 10},
        {text: '安全基準を満たしているか照合します。', seconds: 10},
      ];
    } else if (isLast) {
      // 最終場面: 免責事項・recap
      role = 'recap';
      narration = '本検証はシステムの耐久性を測定する目的で行われており、動作環境や端末性能を一切保証するものではありません。';
      cues = [
        {text: '本検証は耐久性を測定する目的で行われており、', seconds: 15},
        {text: '動作環境や端末性能を一切保証するものではありません。', seconds: 15},
      ];
    } else if (i % 3 === 1) {
      role = 'example';
      narration = `具体的な検証例として場面${i + 1}の挙動を追跡します。安定したフレーム生成が維持されています。`;
      cues = [
        {text: `具体例として場面${i + 1}の挙動を追跡します。`, seconds: 15},
        {text: '安定したフレーム生成が維持されています。', seconds: 15},
      ];
    } else if (i % 3 === 2) {
      role = 'question';
      narration = `リソースの推移において異常な増加は見られるでしょうか？メモリ使用率を継続して点検します。`;
      cues = [
        {text: 'リソースの推移において異常な増加はあるでしょうか？', seconds: 15},
        {text: 'メモリ使用率を継続して点検します。', seconds: 15},
      ];
    }

    const beats = ['situation', 'conflict', 'insight', 'lesson'] as const;
    const beat = beats[i % beats.length];

    scenes.push({
      title: `評価セクション ${i + 1}`,
      narration,
      cues,
      diagram,
      sources: ['stat-doc', 'benchmark-ref'],
      seconds: sceneDuration,
      chapter: chapters[chapterIdx],
      role,
      beat,
      practice: isAction ? ['長尺制作時のリソース監視チェックリストを確認し、システムが安全基準内にあるか点検しましょう。'] : undefined,
    });
  }

  const plan: any = {
    schema: 2,
    id: `benchmark-longform-${targetMinutes}m`,
    title: `${targetMinutes}分の長尺耐久検証`,
    version: 1,
    theme: 'general',
    sources,
    promise: `長尺${targetMinutes}分制作時のリソース限界を解明する`,
    intro: {
      text: '長尺動画のレンダリングにおけるプロセス耐久性とリソース消費の限界を測定する検証レポートです。',
      sources: ['stat-doc'],
    },
    scenes,
  };

  const validated = validatePlanV2(plan);
  const lint = lintPlan(validated);
  if (!lint.ok) {
    throw Error(`生成された長尺台本のlint検査不合格:\n${formatLint(lint)}`);
  }

  return validated;
}

/**
 * ディスク使用量を再帰的に計算する（バイト）
 */
export function calculateDirSize(dirPath: string): number {
  let total = 0;
  try {
    for (const entry of readdirSync(dirPath, {withFileTypes: true})) {
      const full = join(dirPath, entry.name);
      try {
        if (entry.isDirectory()) total += calculateDirSize(full);
        else if (entry.isFile()) total += statSync(full).size;
      } catch (e) {
        // Swift/Chrome delete lock and temporary files between readdir and stat.
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  return total;
}

/**
 * CLI引数のパース
 */
export function parseBenchmarkArgs(args: string[]): BenchmarkOptions {
  const opts: BenchmarkOptions = {
    minutes: 10,
    renderer: 'native',
    audio: 'mock',
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--minutes' && args[i + 1]) opts.minutes = Number(args[++i]);
    else if (arg === '--renderer' && ['native', 'remotion'].includes(args[i + 1])) opts.renderer = args[++i] as any;
    else if (arg === '--audio' && ['mock', 'say'].includes(args[i + 1])) opts.audio = args[++i] as any;
    else if (arg === '--dir' && args[i + 1]) opts.dir = args[++i];
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--timeout' && args[i + 1]) opts.timeoutSeconds = Number(args[++i]);
    else if (arg === '--max-rss' && args[i + 1]) opts.maxRssMb = Number(args[++i]);
    else if (arg === '--max-disk' && args[i + 1]) opts.maxDiskMb = Number(args[++i]);
    else throw Error(`不明な引数: ${arg}`);
  }
  validateOptions(opts);
  return opts;
}

function validateOptions(opts: BenchmarkOptions) {
  if (![10, 15, 20].includes(opts.minutes)) throw Error('minutesは10/15/20分を指定してください');
  if (!['native', 'remotion'].includes(opts.renderer) || !['mock', 'say'].includes(opts.audio)) throw Error('renderer/audio不正');
  for (const [name, value] of Object.entries({maxRss: opts.maxRssMb, maxDisk: opts.maxDiskMb, timeout: opts.timeoutSeconds})) {
    if (value !== undefined && (!Number.isFinite(value) || value <= 0)) throw Error(`${name}は有限の正数が必要`);
  }
}

function isolatedDirectory(requested?: string): string {
  if (!requested) return mkdtempSync(join(tmpdir(), 'benchmark-longform-'));
  const path = resolve(requested);
  // Resolve symlink parents before checking boundaries; never create anything under the source tree.
  const canonical = existsSync(path) ? realpathSync(path) : join(realpathSync(dirname(path)), basename(path));
  if (canonical === sourceRoot || canonical.startsWith(sourceRoot + sep)) throw Error('隔離先はリポジトリ外に指定してください');
  if (existsSync(path)) {
    if (lstatSync(path).isSymbolicLink() || !statSync(path).isDirectory() || readdirSync(path).length) throw Error('隔離先には空の実ディレクトリが必要');
  } else mkdirSync(canonical);
  return canonical;
}

export function processTree(snapshot: ProcessSample[], rootPid: number): ProcessSample[] {
  const ids = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of snapshot) if (ids.has(p.ppid) && !ids.has(p.pid)) {ids.add(p.pid); changed = true;}
  }
  return snapshot.filter(p => ids.has(p.pid));
}

function snapshotProcesses(): ProcessSample[] {
  const p = spawnSync('ps', ['-axo', 'pid=,ppid=,rss=,comm='], {encoding: 'utf8', timeout: 5000});
  if (p.error || p.status !== 0) throw Error(`ps failed: ${p.error?.message ?? p.stderr}`);
  return p.stdout.split('\n').flatMap(line => {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
    return m ? [{pid: Number(m[1]), ppid: Number(m[2]), rssKb: Number(m[3]), command: m[4]}] : [];
  });
}

function copyWorkspace(base: string) {
  const workspace = join(base, 'workspace');
  mkdirSync(workspace);
  for (const name of ['src', 'scripts', 'fixtures', 'config', 'prompts', 'assets', 'package.json']) {
    if (existsSync(join(sourceRoot, name))) cpSync(join(sourceRoot, name), join(workspace, name), {recursive: true});
  }
  mkdirSync(join(workspace, 'motion-lab'));
  for (const name of ['src', 'shared', 'package.json']) cpSync(join(sourceRoot, 'motion-lab', name), join(workspace, 'motion-lab', name), {recursive: true});
  // Dependencies are shared; all compilation caches, renders and outputs remain local to workspace.
  for (const name of ['node_modules', 'motion-lab/node_modules', 'work/python-deps']) {
    if (existsSync(join(sourceRoot, name))) {
      mkdirSync(dirname(join(workspace, name)), {recursive: true});
      symlinkSync(join(sourceRoot, name), join(workspace, name));
    }
  }
  return workspace;
}

export async function runLongformBenchmark(opts: BenchmarkOptions, deps: BenchmarkDependencies = {}): Promise<BenchmarkReport> {
  validateOptions(opts);
  const plan = generateLongformPlan(opts.minutes);
  const durationSec = totalSeconds(plan), totalFrames = Math.round(durationSec * 24);
  const maxRssMb = opts.maxRssMb ?? DEFAULT_MAX_RSS_MB, maxDiskMb = opts.maxDiskMb ?? DEFAULT_MAX_DISK_MB;
  const baseDir = isolatedDirectory(opts.dir);
  writeFileSync(join(baseDir, 'plan.json'), JSON.stringify(plan, null, 2));
  const report: BenchmarkReport = {
    schema: 2, timestamp: new Date().toISOString(), durationMinutes: opts.minutes, durationSeconds: durationSec,
    totalFrames, renderer: opts.renderer, audio: opts.audio, dryRun: Boolean(opts.dryRun), directory: baseDir,
    outcome: opts.dryRun ? 'estimated' : 'failed',
    resources: {peakRssMb: null, diskUsageMb: null, elapsedSeconds: null, fps: null, speedRatio: null, samplingIntervalMs: 100, samples: 0, processes: [], errors: []},
    safetyThresholds: {maxRssMb, maxDiskMb, passed: opts.dryRun ? null : false, violations: []},
  };
  const save = () => writeFileSync(join(baseDir, 'benchmark-report.json'), JSON.stringify(report, null, 2));
  if (opts.dryRun) {
    const rssMb = opts.renderer === 'remotion' ? 850 : 350, diskMb = totalFrames * 0.01 + 20;
    report.estimates = {rssMb, diskMb, withinThresholds: rssMb <= maxRssMb && diskMb <= maxDiskMb};
    save(); return report;
  }
  const violations = report.safetyThresholds.violations;
  const startTime = performance.now();
  const workspace = copyWorkspace(baseDir);
  const command = deps.renderCommand?.(workspace, join(baseDir, 'plan.json')) ?? {
    executable: process.execPath,
    args: ['src/cli.ts', 'sample', '--plan', join(baseDir, 'plan.json'), '--renderer', opts.renderer, '--audio', opts.audio, '--subtitles', 'burn'],
  };
  writeFileSync(join(baseDir, 'render-command.json'), JSON.stringify({...command, cwd: workspace}, null, 2));
  const child = spawn(command.executable, command.args, {cwd: workspace, detached: true, stdio: ['ignore', 'pipe', 'pipe']});
  // Streaming to disk avoids buffering a long renderer's output in memory.
  const output = createWriteStream(join(baseDir, 'render-stdout.txt'));
  const errors = createWriteStream(join(baseDir, 'render-stderr.txt'));
  const flushed = Promise.all([finished(output), finished(errors)]);
  child.stdout.pipe(output); child.stderr.pipe(errors);
  let peakKb = 0, diskBytes = 0, stopped = false;
  const peaks = new Map<number, ProcessPeak>();
  const stop = (reason: string) => {
    if (stopped) return;
    stopped = true; violations.push(reason);
    try { if (child.pid) process.kill(-child.pid, 'SIGKILL'); } catch { /* already exited */ }
  };
  const sample = () => {
    try {
      const tree = processTree(snapshotProcesses(), child.pid ?? -1);
      if (tree.length) {
        report.resources.samples++;
        peakKb = Math.max(peakKb, tree.reduce((n, p) => n + p.rssKb, 0));
        for (const p of tree) peaks.set(p.pid, {pid: p.pid, command: p.command, peakRssMb: Math.max(peaks.get(p.pid)?.peakRssMb ?? 0, p.rssKb / 1024)});
        if (peakKb / 1024 > maxRssMb) stop(`最大RSS超過: ${peakKb / 1024}MB > ${maxRssMb}MB`);
      }
      diskBytes = Math.max(diskBytes, calculateDirSize(workspace));
      if (diskBytes / 1048576 > maxDiskMb) stop(`ディスク使用量超過: ${diskBytes / 1048576}MB > ${maxDiskMb}MB`);
    } catch (e) {
      report.resources.errors.push(String(e)); stop('リソース実測失敗');
    }
  };
  // Attach listeners before the first synchronous ps call (spawn failure can emit immediately).
  const done = new Promise<void>(resolveDone => {
    child.once('error', e => {report.process = {exitCode: null, signal: null, error: e.message};});
    child.once('close', (code, signal) => {report.process = {...report.process, exitCode: code, signal}; resolveDone();});
  });
  sample();
  const timer = setInterval(sample, 100);
  const timeout = setTimeout(() => stop(`タイムアウト: ${opts.timeoutSeconds ?? 1800}秒`), (opts.timeoutSeconds ?? 1800) * 1000);
  try {await done;} finally {clearInterval(timer); clearTimeout(timeout);}
  // The child close event follows closure of its stdio; wait for destination flush as well.
  await flushed;
  const elapsedSec = (performance.now() - startTime) / 1000;
  diskBytes = Math.max(diskBytes, calculateDirSize(workspace));
  report.resources = {...report.resources, peakRssMb: report.resources.samples ? peakKb / 1024 : null,
    diskUsageMb: diskBytes / 1048576, elapsedSeconds: elapsedSec,
    fps: null, speedRatio: null, processes: [...peaks.values()]};
  if (!report.resources.samples) violations.push('子プロセスRSS未測定');
  if (report.process?.exitCode !== 0 || report.process?.error) violations.push(`生成失敗: ${JSON.stringify(report.process)}`);
  if (diskBytes / 1048576 > maxDiskMb && !violations.some(v => v.includes('ディスク'))) violations.push('ディスク使用量超過');
  report.mediaValidation = {videoFrames: 0, expectedFrames: totalFrames, fullDecodePassed: false};
  try {
    // latest is only a locator; job status, containment and independent decoding must all pass.
    const outputRoot = join(workspace, 'outputs');
    const latest = JSON.parse(readFileSync(join(outputRoot, 'latest.json'), 'utf8'));
    if (typeof latest.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(latest.id)) throw Error('latestのjob ID不正');
    const jobDir = join(outputRoot, latest.id);
    const canonicalOutput = realpathSync(outputRoot), canonicalJob = realpathSync(jobDir);
    if (dirname(canonicalJob) !== canonicalOutput || lstatSync(jobDir).isSymbolicLink()) throw Error('jobが隔離先外');
    const mp4 = join(jobDir, 'sample.mp4');
    if (lstatSync(mp4).isSymbolicLink()) throw Error('動画symlinkは不可');
    const job = JSON.parse(readFileSync(join(jobDir, 'job.json'), 'utf8'));
    if (job.status !== 'completed') throw Error(`job未完了: ${job.status}`);
    const inspectionDir = join(baseDir, 'independent-media'); mkdirSync(inspectionDir);
    symlinkSync(mp4, join(inspectionDir, 'sample.mp4'));
    const media = inspectRemotionMedia(inspectionDir, {duration: durationSec, fps: 24, width: 1280, height: 720, subtitles: 'burn', rendererName: `${opts.renderer} benchmark / independent FFmpeg`, narration: opts.audio === 'say'});
    report.mediaValidation = {videoFrames: media.videoFrames!, expectedFrames: totalFrames, fullDecodePassed: media.fullDecode === 'passed',
      videoDuration: media.videoDuration, audioDuration: media.audioDuration, artifactSha256: media.artifact?.sha256, path: mp4};
    report.resources.fps = totalFrames / elapsedSec;
    report.resources.speedRatio = durationSec / elapsedSec;
  } catch (e) { report.mediaValidation.error = String(e); violations.push(`媒体検査失敗: ${e}`); }
  if (!report.mediaValidation.fullDecodePassed || report.mediaValidation.videoFrames !== totalFrames) violations.push('媒体検査未合格');
  report.safetyThresholds.passed = violations.length === 0;
  report.outcome = report.safetyThresholds.passed ? 'passed' : 'failed';
  save(); return report;
}

// 直接実行時のエントリポイント
if (process.argv[1] && process.argv[1].endsWith('benchmark-longform.ts')) {
  try {
    const opts = parseBenchmarkArgs(process.argv.slice(2));
    console.log(`[benchmark] 長尺制作ベンチマーク開始: ${opts.minutes}分 (renderer=${opts.renderer}, dryRun=${opts.dryRun ?? false})`);
    const report = await runLongformBenchmark(opts);
    console.log('[benchmark] レポート出力完了:');
    console.log(JSON.stringify(report, null, 2));
    if (report.outcome === 'failed' || report.estimates?.withinThresholds === false) {
      console.error('[benchmark] 安全限界違反:', report.safetyThresholds.violations);
      process.exitCode = 1;
    }
  } catch (err: any) {
    console.error('[benchmark] 致命的エラー:', err.message);
    process.exitCode = 1;
  }
}
