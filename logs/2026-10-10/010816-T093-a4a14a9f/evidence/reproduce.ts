// T093: 隔離データのみを使ったレビュー再現。外部APIや既存outputsには触れない。
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {recordReview, approvalOf} from '../../../../src/review.ts';
import {reviseTitle} from '../../../../src/metadata.ts';
import {planClean, applyClean} from '../../../../src/jobs.ts';
import {lintPlan} from '../../../../src/lint.ts';
import {validatePlanV2} from '../../../../src/plan.ts';
import {buildThumbSpecs} from '../../../../src/timeline.ts';
import {Budget} from '../../../../src/budget.ts';
import {callWithBudget, ConnError} from '../../../../src/connections.ts';
import type {Connection, Usage} from '../../../../src/connections.ts';

const root = mkdtempSync(join(tmpdir(), 't093-review-'));
try {
  const job = join(root, 'review'); mkdirSync(job);
  const outputHash = createHash('sha256').update('fake video for hash test').digest('hex');
  writeFileSync(join(job, 'sample.mp4'), 'fake video for hash test');
  writeFileSync(join(job, 'job.json'), JSON.stringify({status:'completed', outputHash, inputHash:'plan-v1'}));
  writeFileSync(join(job, 'metadata.json'), JSON.stringify({selectedTitle:'変更前の題名'}));
  recordReview(job, 'approve', '隔離再現用', outputHash, 'test-agent');
  reviseTitle(job, '変更後の題名', '承認失効の試験', 'test-agent');
  assert.equal(approvalOf(job).state, 'approved');
  console.log('approval-after-title-edit:', approvalOf(job).state);

  const archiveRoot = join(root, 'cleanup'); mkdirSync(archiveRoot);
  writeFileSync(join(archiveRoot, 'report.txt'), 'first content');
  applyClean(archiveRoot, planClean(archiveRoot), '2026-10-10');
  writeFileSync(join(archiveRoot, 'report.txt'), 'second content');
  applyClean(archiveRoot, planClean(archiveRoot), '2026-10-10');
  const archived = readFileSync(join(archiveRoot, '_archive/2026-10-10/report.txt'), 'utf8');
  assert.equal(archived, 'second content');
  console.log('archive-first-content-overwritten:', archived);

  const plan = JSON.parse(readFileSync('fixtures/sample-v2.json', 'utf8'));
  plan.title = '必ず儲かる'; delete plan.thumbnail;
  const lint = lintPlan(validatePlanV2(plan));
  assert.equal(lint.ok, true);
  const thumbs = buildThumbSpecs(plan);
  console.log('forbidden-fallback-thumbnail:', JSON.stringify({lintOk:lint.ok, thumbs}));

  const disclaimerPlan = JSON.parse(readFileSync('fixtures/sample-v2.json', 'utf8'));
  const last = disclaimerPlan.scenes.at(-1);
  last.narration = '投資を推奨します。利益を保証します。';
  last.cues = [{text:last.narration, seconds:last.seconds}];
  assert.equal(lintPlan(validatePlanV2(disclaimerPlan)).ok, true);
  console.log('affirmative-guarantee-disclaimer-lint:', lintPlan(disclaimerPlan).ok);

  let calls = 0;
  const c: Connection<void,string> = {
    domain:'script', provider:'isolated-fake', model:'none', mode:'mock',
    async call() {
      calls++;
      if (calls === 1) throw new ConnError('SERVER', 'simulated response lost after charged processing');
      return {output:'ok', usage:{domain:'script', provider:'isolated-fake', model:'none', mode:'mock', requestId:'second', inputUnits:0, outputUnits:0, costUsd:0.6}};
    }
  };
  const budget = new Budget(1), usage: Usage[] = [];
  await callWithBudget(c, undefined, budget, 0.6, usage, 2);
  assert.equal(calls, 2); assert.equal(budget.committed, 0.6);
  console.log('retry-cost-ledger:', JSON.stringify({calls, committed:budget.committed,reserved:budget.reserved,usage,simulatedCostIfBothCharged:1.2}));
} finally { rmSync(root, {recursive:true, force:true}); }
