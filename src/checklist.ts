// T084: 作者が指定した実践の原文だけを取り出す。意味の自動推測・助言の補完はしない。
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {validatePlanV2} from './plan.ts';
import type {Plan, Source} from './plan.ts';
import {sourceRecords} from './metadata.ts';

export const CHECKLIST_NOTE = '台本の実践箇所の原文です。出典の記載は助言の正しさや結果を保証しません。';
export type ChecklistItem = {text: string; scene: number; fictional: boolean; sources: (Source & {number: number})[]};
export type Checklist = {schema: 1; title: string; items: ChecklistItem[]; note: string; text: string; pages: {file: string; lines: {text: string; reference: string}[]}[]};
export const checklistReference = (item: ChecklistItem) => `場面${item.scene}${item.fictional ? '・架空の例' : ''} / 出典${item.sources.length ? item.sources.map(s => `[${s.number}]`).join('') : 'なし'}`;

export function buildChecklist(plan: Plan): Checklist {
  validatePlanV2(plan);
  const sources = sourceRecords(plan);
  const items: ChecklistItem[] = plan.scenes.flatMap((s, i) => (s.practice ?? []).map(text => ({
    text, scene: i + 1, fictional: s.fictional === true,
    sources: s.sources.map(id => {
      const src = sources.find(x => x.id === id)!;
      return {id: src.id, title: src.title, url: src.url, accessedAt: src.accessedAt, number: src.number};
    }),
  })));
  const lines = items.map(item => ({text: `□ ${item.text}`, reference: checklistReference(item)}));
  const pages: Checklist['pages'] = [];
  for (let i = 0; i < lines.length; i += 3) pages.push({file: `checklist-${pages.length + 1}.png`, lines: lines.slice(i, i + 3)});
  if (!pages.length) pages.push({file: 'checklist-1.png', lines: [{text: '台本に実践項目の指定がありません。', reference: '助言の自動補完は行っていません。'}]});
  const text = ['判断前チェックリスト', plan.title, CHECKLIST_NOTE,
    ...(items.length ? items.flatMap(item => [`□ ${item.text}`, `  ${checklistReference(item)}`]) : ['台本に実践項目の指定がありません。']),
  ].join('\n');
  return {schema: 1, title: plan.title, items, note: CHECKLIST_NOTE, text, pages};
}

export function writeChecklist(dir: string, checklist: Checklist) {
  writeFileSync(join(dir, 'checklist.json'), JSON.stringify(checklist, null, 2));
  const used = [...new Map(checklist.items.flatMap(item => item.sources).map(s => [s.id, s])).values()];
  writeFileSync(join(dir, 'checklist.txt'), checklist.text + '\n\n' + used.map(s => `[${s.number}] ${s.title}（確認日 ${s.accessedAt}） ${s.url}`).join('\n') + '\n');
}
