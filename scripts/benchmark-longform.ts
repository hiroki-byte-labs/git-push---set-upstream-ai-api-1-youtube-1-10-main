// scripts/benchmark-longform.ts
// T175: 長尺（10〜20分）制作ジョブにおけるリソース消費・メモリリーク・プロセス耐久性ベンチマーク

import {existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, readdirSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {validatePlanV2, totalSeconds} from '../src/plan.ts';
import type {Plan, Scene, Diagram} from '../src/plan.ts';
import {lintPlan, formatLint} from '../src/lint.ts';

export type BenchmarkOptions = {
  minutes: number;
  renderer: 'native' | 'remotion';
  audio: 'mock' | 'say';
  dir?: string;
  dryRun?: boolean;
  maxRssMb?: number;
  maxDiskMb?: number;
};

export type BenchmarkReport = {
  schema: 1;
  timestamp: string;
  durationMinutes: number;
  durationSeconds: number;
  totalFrames: number;
  renderer: string;
  audio: string;
  dryRun: boolean;
  resources: {
    peakRssMb: number;
    diskUsageMb: number;
    elapsedSeconds: number;
    fps: number;
    speedRatio: number;
  };
  safetyThresholds: {
    maxRssMb: number;
    maxDiskMb: number;
    passed: boolean;
    violations: string[];
  };
  mediaValidation?: {
    videoFrames: number;
    expectedFrames: number;
    fullDecodePassed: boolean;
    avPlayerEnded?: boolean;
    error?: string;
  };
};

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
    title: `長尺制作耐久性ベンチマーク（${targetMinutes}分）`,
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
  if (!existsSync(dirPath)) return 0;
  let total = 0;
  for (const entry of readdirSync(dirPath, {withFileTypes: true})) {
    const full = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += calculateDirSize(full);
    } else if (entry.isFile()) {
      total += statSync(full).size;
    }
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
    else if (arg === '--max-rss' && args[i + 1]) opts.maxRssMb = Number(args[++i]);
    else if (arg === '--max-disk' && args[i + 1]) opts.maxDiskMb = Number(args[++i]);
    else throw Error(`不明な引数: ${arg}`);
  }
  return opts;
}

/**
 * ベンチマーク実行エンジン
 */
export async function runLongformBenchmark(opts: BenchmarkOptions): Promise<BenchmarkReport> {
  const plan = generateLongformPlan(opts.minutes);
  const durationSec = totalSeconds(plan);
  const totalFrames = durationSec * 24;
  const maxRssMb = opts.maxRssMb ?? DEFAULT_MAX_RSS_MB;
  const maxDiskMb = opts.maxDiskMb ?? DEFAULT_MAX_DISK_MB;

  const baseDir = opts.dir ? resolve(opts.dir) : join(tmpdir(), `benchmark-longform-${Date.now()}`);
  mkdirSync(baseDir, {recursive: true});

  const planPath = join(baseDir, 'plan.json');
  writeFileSync(planPath, JSON.stringify(plan, null, 2));

  // Dry-run の場合: 見積もりと整合性検査のみ実行して即時復帰
  if (opts.dryRun) {
    const estDiskMb = (totalFrames * 0.01) + 20; // 概算推定
    const estRssMb = opts.renderer === 'remotion' ? 850 : 350;
    const report: BenchmarkReport = {
      schema: 1,
      timestamp: new Date().toISOString(),
      durationMinutes: opts.minutes,
      durationSeconds: durationSec,
      totalFrames,
      renderer: opts.renderer,
      audio: opts.audio,
      dryRun: true,
      resources: {
        peakRssMb: estRssMb,
        diskUsageMb: estDiskMb,
        elapsedSeconds: 0,
        fps: 0,
        speedRatio: 0,
      },
      safetyThresholds: {
        maxRssMb,
        maxDiskMb,
        passed: estRssMb <= maxRssMb && estDiskMb <= maxDiskMb,
        violations: [],
      },
    };
    writeFileSync(join(baseDir, 'benchmark-report.json'), JSON.stringify(report, null, 2));
    return report;
  }

  // 実際のレンダリング実行
  const startTime = performance.now();
  let peakRss = process.memoryUsage().rss;

  // 定期的なRSSサンプリングタイマー
  const sampleTimer = setInterval(() => {
    const currentRss = process.memoryUsage().rss;
    if (currentRss > peakRss) peakRss = currentRss;
  }, 100);

  let renderError: unknown;
  const outDir = join(baseDir, 'outputs');
  mkdirSync(outDir, {recursive: true});

  try {
    const {sample} = await import('../src/commands/sample.ts');
    await sample({
      plan: planPath,
      renderer: opts.renderer,
      audio: opts.audio,
      queue: false,
    });
  } catch (e) {
    renderError = e;
  } finally {
    clearInterval(sampleTimer);
  }

  const elapsedSec = (performance.now() - startTime) / 1000;
  const peakRssMb = Math.round((peakRss / (1024 * 1024)) * 10) / 10;
  const diskBytes = calculateDirSize(baseDir);
  const diskUsageMb = Math.round((diskBytes / (1024 * 1024)) * 10) / 10;
  const fps = elapsedSec > 0 ? Math.round((totalFrames / elapsedSec) * 10) / 10 : 0;
  const speedRatio = elapsedSec > 0 ? Math.round((durationSec / elapsedSec) * 10) / 10 : 0;

  const violations: string[] = [];
  if (peakRssMb > maxRssMb) violations.push(`最大RSS超過: ${peakRssMb}MB > ${maxRssMb}MB`);
  if (diskUsageMb > maxDiskMb) violations.push(`ディスク使用量超過: ${diskUsageMb}MB > ${maxDiskMb}MB`);
  if (renderError) violations.push(`実行時エラー: ${String(renderError)}`);

  const report: BenchmarkReport = {
    schema: 1,
    timestamp: new Date().toISOString(),
    durationMinutes: opts.minutes,
    durationSeconds: durationSec,
    totalFrames,
    renderer: opts.renderer,
    audio: opts.audio,
    dryRun: false,
    resources: {
      peakRssMb,
      diskUsageMb,
      elapsedSeconds: Math.round(elapsedSec * 100) / 100,
      fps,
      speedRatio,
    },
    safetyThresholds: {
      maxRssMb,
      maxDiskMb,
      passed: violations.length === 0,
      violations,
    },
  };

  // 媒体検査
  const mp4Path = join(outDir, 'sample.mp4');
  if (existsSync(mp4Path)) {
    const ffprobe = spawnSync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-count_packets',
      '-show_entries', 'stream=nb_read_packets',
      '-of', 'csv=p=0',
      mp4Path,
    ], {encoding: 'utf8'});

    const actualFrames = Number(ffprobe.stdout.trim()) || 0;
    const decodeCheck = spawnSync('ffmpeg', ['-v', 'error', '-i', mp4Path, '-f', 'null', '-'], {encoding: 'utf8'});

    report.mediaValidation = {
      videoFrames: actualFrames,
      expectedFrames: totalFrames,
      fullDecodePassed: decodeCheck.status === 0,
    };
  }

  writeFileSync(join(baseDir, 'benchmark-report.json'), JSON.stringify(report, null, 2));
  return report;
}

// 直接実行時のエントリポイント
if (process.argv[1] && process.argv[1].endsWith('benchmark-longform.ts')) {
  try {
    const opts = parseBenchmarkArgs(process.argv.slice(2));
    console.log(`[benchmark] 長尺制作ベンチマーク開始: ${opts.minutes}分 (renderer=${opts.renderer}, dryRun=${opts.dryRun ?? false})`);
    const report = await runLongformBenchmark(opts);
    console.log('[benchmark] レポート出力完了:');
    console.log(JSON.stringify(report, null, 2));
    if (!report.safetyThresholds.passed) {
      console.error('[benchmark] 安全限界違反:', report.safetyThresholds.violations);
      process.exitCode = 1;
    }
  } catch (err: any) {
    console.error('[benchmark] 致命的エラー:', err.message);
    process.exitCode = 1;
  }
}
