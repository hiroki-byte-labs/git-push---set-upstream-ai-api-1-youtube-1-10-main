import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  generateLongformPlan,
  parseBenchmarkArgs,
  runLongformBenchmark,
  calculateDirSize,
  processTree,
} from '../scripts/benchmark-longform.ts';
import {totalSeconds, validatePlanV2} from '../src/plan.ts';
import {lintPlan} from '../src/lint.ts';
import {buildThumbnailCandidates} from '../src/thumbnail-candidates.ts';

test('generateLongformPlan produces valid plans for 10m, 15m, and 20m with balanced diagrams and chapters', () => {
  for (const mins of [10, 15, 20]) {
    const plan = generateLongformPlan(mins);
    assert.equal(plan.schema, 2);
    assert.equal(totalSeconds(plan), mins * 60, `${mins}分の総秒数が一致すること`);

    // バリデーションとLintの通過
    assert.doesNotThrow(() => validatePlanV2(plan));
    const lint = lintPlan(plan);
    assert.equal(lint.ok, true, `lintPlanがエラーなく合格すること (${mins}分)`);
    assert.doesNotThrow(() => buildThumbnailCandidates(plan), '描画後のサムネイル契約も満たす');

    // 5種類の図解が含まれていること
    const diagramTypes = new Set(plan.scenes.map(s => s.diagram.type));
    assert.deepEqual(
      [...diagramTypes].sort(),
      ['branch', 'compare', 'flow', 'meter', 'number'].sort(),
      '主要な図解タイプすべてを網羅していること'
    );

    // 章の連続性確認
    assert.ok(plan.scenes.every(s => s.chapter !== undefined), '全場面にchapterが存在すること');
  }
});

test('parseBenchmarkArgs parses CLI arguments correctly', () => {
  const args = ['--minutes', '15', '--renderer', 'remotion', '--audio', 'say', '--dry-run', '--max-rss', '2048', '--max-disk', '400'];
  const opts = parseBenchmarkArgs(args);
  assert.equal(opts.minutes, 15);
  assert.equal(opts.renderer, 'remotion');
  assert.equal(opts.audio, 'say');
  assert.equal(opts.dryRun, true);
  assert.equal(opts.maxRssMb, 2048);
  assert.equal(opts.maxDiskMb, 400);

  assert.throws(() => parseBenchmarkArgs(['--unknown']), /不明な引数/);
});

test('runLongformBenchmark dry-run generates plan and safety threshold report without executing render', async t => {
  const tempDir = mkdtempSync(join(tmpdir(), 'bench-test-'));
  t.after(() => rmSync(tempDir, {recursive: true, force: true}));

  const report = await runLongformBenchmark({
    minutes: 10,
    renderer: 'native',
    audio: 'mock',
    dir: tempDir,
    dryRun: true,
  });

  assert.equal(report.durationMinutes, 10);
  assert.equal(report.durationSeconds, 600);
  assert.equal(report.totalFrames, 14400);
  assert.equal(report.dryRun, true);
  assert.equal(report.safetyThresholds.passed, null, '推計を実測合格にしない');
  assert.equal(report.resources.peakRssMb, null);

  const reportFile = join(tempDir, 'benchmark-report.json');
  assert.ok(existsSync(reportFile));
  const planFile = join(tempDir, 'plan.json');
  assert.ok(existsSync(planFile));
});

test('benchmark rejects unsafe inputs and existing output directories before writing', async t => {
  const {writeFileSync, readdirSync} = await import('node:fs');
  const dir = mkdtempSync(join(tmpdir(), 'bench-existing-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  writeFileSync(join(dir, 'keep.txt'), 'preserve');
  await assert.rejects(runLongformBenchmark({minutes: 10, renderer: 'native', audio: 'mock', dir, dryRun: true}), /空|empty/);
  assert.deepEqual(readdirSync(dir), ['keep.txt']);
  assert.throws(() => parseBenchmarkArgs(['--minutes', 'NaN']), /minutes|分/);
  assert.throws(() => parseBenchmarkArgs(['--max-rss', '-1']), /rss/i);
  await assert.rejects(runLongformBenchmark({minutes: 10, renderer: 'native', audio: 'mock', dir: join(process.cwd(), 'outputs'), dryRun: true}), /リポジトリ外/);
  await assert.rejects(runLongformBenchmark({minutes: 10, renderer: 'native', audio: 'mock', dir: join(process.cwd(), '..bench-forbidden'), dryRun: true}), /リポジトリ外/);
});

test('RSS process tree includes nested children and excludes unrelated processes', () => {
  const snapshot = [
    {pid: 10, ppid: 1, rssKb: 20, command: 'renderer'},
    {pid: 11, ppid: 10, rssKb: 200, command: 'swift'},
    {pid: 12, ppid: 11, rssKb: 300, command: 'ffmpeg'},
    {pid: 99, ppid: 1, rssKb: 99999, command: 'other'},
  ];
  assert.deepEqual(processTree(snapshot.reverse(), 10).map(p => p.pid).sort(), [10, 11, 12]);
});

test('successful child exit without a completed video fails; descendant RSS is actually sampled', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'bench-no-media-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const childCode = "const x=Buffer.alloc(40*1024*1024,1);setTimeout(()=>console.log(x[0]),700)";
  const report = await runLongformBenchmark({minutes: 10, renderer: 'native', audio: 'mock', dir}, {
    renderCommand: () => ({executable: process.execPath, args: ['-e', `const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e',${JSON.stringify(childCode)}],{stdio:'inherit'});c.on('close',()=>{});`]}),
  });
  assert.equal(report.process?.exitCode, 0);
  assert.equal(report.outcome, 'failed');
  assert.equal(report.safetyThresholds.passed, false);
  assert.equal(report.mediaValidation?.fullDecodePassed, false);
  assert.ok(report.resources.samples > 0);
  assert.ok(report.resources.processes.length >= 2, '実子プロセスを含む');
  assert.ok(report.resources.processes.some(p => p.peakRssMb >= 40));
  assert.ok(existsSync(join(dir, 'render-command.json')));
});

test('invalid completed MP4, nonzero exit, timeout and RSS limit are failures', async t => {
  const cases = [
    {code: "const fs=require('node:fs');fs.mkdirSync('outputs/fake',{recursive:true});fs.writeFileSync('outputs/latest.json',JSON.stringify({id:'fake'}));fs.writeFileSync('outputs/fake/job.json',JSON.stringify({status:'completed'}));fs.writeFileSync('outputs/fake/sample.mp4','not a video');", reason: /媒体検査/},
    {code: 'process.exit(17)', reason: /生成失敗/},
    {code: 'setInterval(()=>{},100)', timeoutSeconds: 0.25, reason: /タイムアウト/},
    {code: 'const b=Buffer.alloc(30*1024*1024,1);setTimeout(()=>console.log(b[0]),1000)', maxRssMb: 1, reason: /RSS超過/},
  ];
  for (const c of cases) {
    const dir = mkdtempSync(join(tmpdir(), 'bench-fault-'));
    t.after(() => rmSync(dir, {recursive: true, force: true}));
    const report = await runLongformBenchmark({minutes: 10, renderer: 'native', audio: 'mock', dir, timeoutSeconds: c.timeoutSeconds, maxRssMb: c.maxRssMb}, {
      renderCommand: () => ({executable: process.execPath, args: ['-e', c.code]}),
    });
    assert.equal(report.outcome, 'failed');
    assert.match(report.safetyThresholds.violations.join('\n'), c.reason);
    assert.equal(JSON.parse(readFileSync(join(dir, 'benchmark-report.json'), 'utf8')).outcome, 'failed');
  }
});

test('calculateDirSize measures directory byte size recursively', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'dir-size-test-'));
  try {
    const {writeFileSync, mkdirSync} = await import('node:fs');
    writeFileSync(join(tempDir, 'file1.txt'), 'hello');
    const sub = join(tempDir, 'sub');
    mkdirSync(sub);
    writeFileSync(join(sub, 'file2.txt'), 'world!');
    const size = calculateDirSize(tempDir);
    assert.equal(size, 11); // 'hello' (5) + 'world!' (6)
  } finally {
    rmSync(tempDir, {recursive: true, force: true});
  }
});
