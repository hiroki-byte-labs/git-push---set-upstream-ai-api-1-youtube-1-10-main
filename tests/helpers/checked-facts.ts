// Synthetic certificates for workflow tests. These do not certify the fixtures'
// scholarly claims and must never be copied into a production project.
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {projectState, readScript, reviewScript} from '../../src/production.ts';
export function checkedReportForTest(root: string, id: string) {
  const script = projectState(root, id).script!;
  const plan = readScript(root, id, script);
  const sources = plan.sources.length ? plan.sources : [{id: 'original', title: 'Synthetic test text', url: 'https://example.invalid/test-only'}];
  return {schema: 1, planId: plan.id, binding: {projectId: id, scriptHash: script.hash, scriptFileSha256: script.fileSha256},
    claims: sources.map(source => ({claim: 'TEST ONLY: ' + source.title, sourceId: source.id, citation: source.title, url: source.url,
      status: source.id === 'original' ? 'inference' : 'verified', checkedAt: '2026-10-17', note: 'Synthetic workflow fixture; no scholarly verification'})),
    assets: [{assetId: 'test-only-assets', type: 'svg', origin: 'original', license: 'test fixture', attributionRequired: false, commercialUseAllowed: true, checkedAt: '2026-10-17'}],
    ok: true, escalations: []};
}
export function checkScriptForTest(root: string, id: string) {
  const report = checkedReportForTest(root, id);
  writeFileSync(join(root, id, 'fact-check.json'), JSON.stringify(report));
  return report;
}

// Existing workflow/queue tests explicitly supply a synthetic checked report.
// Security tests use the real reviewScript directly and never this helper.
export function reviewWithCheckedFactsForTest(...args: Parameters<typeof reviewScript>) {
  const [root, id, decision, hash] = args;
  const state = projectState(root, id);
  if (decision === 'approve' && state.script?.hash === hash && !['none', 'stale', 'broken'].includes(state.scriptState)) checkScriptForTest(root, id);
  return reviewScript(...args);
}
