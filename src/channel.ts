// チャンネルの立場・利害関係・免責の定型文（T072）。正本は config/channel.json。T070の方針決定で確定する。
import {readFileSync} from 'node:fs';
import type {Plan} from './plan.ts';
import {sourceRecords} from './metadata.ts';

export type Channel = {decided: boolean; channelName: string; stance: string; conflictsOfInterest: string; disclaimer: string};

export function loadChannel(path = 'config/channel.json'): Channel {
  const c = JSON.parse(readFileSync(path, 'utf8'));
  for (const k of ['channelName', 'stance', 'conflictsOfInterest', 'disclaimer'] as const) {
    if (typeof c[k] !== 'string' || !c[k].trim()) throw Error(`config/channel.json: ${k}が必要`);
  }
  if (typeof c.decided !== 'boolean') throw Error('config/channel.json: decidedは真偽値');
  return c as Channel;
}

// 概要欄用の出典一覧。場面の参照順に並べ、確認日を付ける。番号の規則はsourceRecords（T103）に一本化。
export function sourcesText(plan: Plan) {
  if (!plan.sources.length) return '出典: なし（この動画は数値や外部資料の主張を含みません）';
  return ['出典:', ...sourceRecords(plan).map(s => `${s.number}. ${s.title}（確認日 ${s.accessedAt}） ${s.url}`)].join('\n');
}

// 概要欄用の立場・利害関係・免責。未確定なら未確定と明示する。
export function stanceText(c: Channel) {
  return [
    `発信者の立場: ${c.stance}`,
    `利害関係: ${c.conflictsOfInterest}`,
    c.disclaimer,
    ...(c.decided ? [] : ['（注: チャンネルの立場は未確定です。T070で確定するまで公開しないでください）']),
  ].join('\n');
}
