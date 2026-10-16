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
} from '../scripts/benchmark-longform.ts';
import {totalSeconds, validatePlanV2} from '../src/plan.ts';
import {lintPlan} from '../src/lint.ts';

test('generateLongformPlan produces valid plans for 10m, 15m, and 20m with balanced diagrams and chapters', () => {
  for (const mins of [10, 15, 20]) {
    const plan = generateLongformPlan(mins);
    assert.equal(plan.schema, 2);
    assert.equal(totalSeconds(plan), mins * 60, `${mins}分の総秒数が一致すること`);

    // バリデーションとLintの通過
    assert.doesNotThrow(() => validatePlanV2(plan));
    const lint = lintPlan(plan);
    assert.equal(lint.ok, true, `lintPlanがエラーなく合格すること (${mins}分)`);

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
  assert.equal(report.safetyThresholds.passed, true);

  const reportFile = join(tempDir, 'benchmark-report.json');
  assert.ok(existsSync(reportFile));
  const planFile = join(tempDir, 'plan.json');
  assert.ok(existsSync(planFile));
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
