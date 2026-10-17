// A checked report is scoped to one project and immutable script version.
// This validates evidence records, not the truth of an unchecked URL.
import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {checkFactAndRights} from './fact-check.ts';
import type {FactCheckReport} from './fact-check.ts';
import type {Plan} from './plan.ts';

type Script = {hash: string; fileSha256: string};
export type FactCheckBinding = {projectId: string; scriptHash: string; scriptFileSha256: string};
export type BoundFactCheckReport = FactCheckReport & {binding: FactCheckBinding};
export function factCheckBinding(projectId: string, script: Script): FactCheckBinding {
  return {projectId, scriptHash: script.hash, scriptFileSha256: script.fileSha256};
}
export function validateScriptFactCheck(raw: any, projectId: string, script: Script, plan: Plan): BoundFactCheckReport {
  const binding = factCheckBinding(projectId, script);
  if (!raw?.binding || Object.entries(binding).some(([key, value]) => raw.binding[key] !== value)) throw Error('事実・権利確認レポートの案件/台本の版/hash結合が不一致。現在の版で確認し直してください');
  if (raw.planId !== plan.id) throw Error('事実・権利確認レポートのplanIdが台本と不一致');
  // Recompute from claims/assets; never trust persisted ok/escalations flags.
  const report = checkFactAndRights(raw);
  for (const claim of report.claims.filter(c => c.status !== 'unverified')) {
    const source = plan.sources.find(s => s.id === claim.sourceId);
    const original = claim.sourceId === 'original' && claim.status === 'inference' && Boolean(claim.note?.trim());
    if (!original && (!source || source.url !== claim.url)) throw Error('事実確認の出典ID/URLが現在の台本と不一致');
  }
  const used = new Set([...plan.scenes.flatMap(s => s.sources), ...(plan.intro?.sources ?? [])]);
  for (const sourceId of used) if (!report.claims.some(c => c.sourceId === sourceId)) report.escalations.push(`出典${sourceId}に対応する主張の照合記録がありません`);
  report.ok = report.escalations.length === 0;
  return {...report, binding};
}
export const factCheckReportHash = (report: BoundFactCheckReport) => createHash('sha256').update(JSON.stringify(report)).digest('hex');
export function readScriptFactCheck(root: string, projectId: string, script: Script, plan: Plan) {
  const paths = ['fact-check.json', 'fact-check-report.json'].map(file => join(root, projectId, file));
  const path = paths.find(p => existsSync(p));
  if (!path) throw Error('事実・権利確認レポート（fact-check.json）がありません。produce fact-checkを実施してください');
  const report = validateScriptFactCheck(JSON.parse(readFileSync(path, 'utf8')), projectId, script, plan);
  if (!report.ok) throw Error(`事実・権利確認にエスカレーション項目があるため承認できません:\n- ${report.escalations.join('\n- ')}`);
  return report;
}
export function draftScriptFactCheck(projectId: string, script: Script, plan: Plan) {
  const today = new Date().toISOString().slice(0, 10);
  const sources = plan.sources.length ? plan.sources : [{id: 'none', title: '出典なし', url: 'https://example.invalid/unverified'}];
  return {schema: 1, planId: plan.id, binding: factCheckBinding(projectId, script),
    claims: sources.map(s => ({claim: `未照合: ${s.title}に対応する主張を原文で記入してください`, sourceId: s.id, citation: s.title, url: s.url,
      status: 'unverified', checkedAt: today, note: '自動生成は確認用ひな型。原本の該当箇所との照合は未実施'})),
    assets: [{assetId: 'production-assets-unreviewed', type: 'svg', origin: 'unknown', license: '未確認', attributionRequired: true,
      commercialUseAllowed: false, checkedAt: today, notes: '使用する図形・フォント・音声ごとの利用条件を確認して置き換える'}]};
}
