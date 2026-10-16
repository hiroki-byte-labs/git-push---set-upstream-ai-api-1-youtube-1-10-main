// トレンド・成長分析のレポート（T137）。表（text）・CSV・JSONで、出典・観測期間・鮮度・指標の意味・比較限界を必ず添える。
import type {CollectionBatch, Source, TrendsPolicy} from './trends-schema.ts';
import {
  type AnalysisOptions, type Growth, type Reason, REASON_LABEL, categoryTrend, channelGrowth, rawSeries, videoGrowth,
} from './trends-metrics.ts';

export type ReportKind = 'categories' | 'videos' | 'channels' | 'series';
export type ReportFilter = {categoryId?: string; channelId?: string; videoId?: string; limit?: number};
export type Report = {kind: ReportKind; title: string; notes: string[]; columns: string[]; rows: (string | number | null)[][]};

const SOURCE_LABEL: Record<Source, string> = {
  'synthetic': '合成データ（試験用。YouTubeの実データではない）',
  'youtube-data-api': 'YouTube Data API v3（公開データ、APIキーで取得）',
};

const DERIVED_NOTE = '増加量・増加率・構成比・中央値は本ツールの算出値で、YouTubeが提供する値ではない。';
const HISTORY_NOTE = '各値は取得時刻時点のもの。最新の値はYouTube上で異なる場合がある。';

const round = (x: number | null, d = 2) => x === null ? null : Math.round(x * 10 ** d) / 10 ** d;
const reasons = (rs: Reason[]) => rs.join(' ') || null;

function header(source: Source, opt: AnalysisOptions, scoped: CollectionBatch[]): string[] {
  const times = scoped.flatMap(b => [b.startedAt, b.completedAt]).sort((a, b) => Date.parse(a) - Date.parse(b));
  return [
    `出典: ${SOURCE_LABEL[source]}、地域 ${opt.regionCode}`,
    `基準時刻 ${opt.asOf}、観測窓 ${opt.windowDays}日（実際の間隔が25%超ずれる値は比較しない）、鮮度の上限 ${opt.staleDays ?? 2}日`,
    times.length ? `収集期間: ${times[0]} 〜 ${times.at(-1)}（${scoped.length} batch）` : 'データなし: この出所・地域の収集記録がありません',
    HISTORY_NOTE,
  ];
}

const reasonLegend = (rows: (string | number | null)[][], col: number) => {
  const used = new Set(rows.flatMap(r => String(r[col] ?? '').split(' ').filter(Boolean)));
  return [...used].map(r => `${r}: ${REASON_LABEL[r as Reason] ?? r}`);
};

const growthCells = (g: Growth) => [g.start?.at ?? null, g.end?.at ?? null, round(g.elapsedDays), g.start?.value ?? null, g.end?.value ?? null,
  g.delta, round(g.perDay), round(g.relative, 4), round(g.dataAgeDays), reasons(g.reasons)];
const GROWTH_COLUMNS = ['開始時刻', '終了時刻', '経過日数', '開始値', '終了値', '増加量', '1日当たり', '相対増加率', 'データ経過日数', '注記'];

export function buildReport(kind: ReportKind, batches: CollectionBatch[], policy: TrendsPolicy, opt: AnalysisOptions, filter: ReportFilter = {}): Report {
  const scoped = batches.filter(b => b.source === opt.source && b.regionCode === opt.regionCode);
  const notes = header(opt.source, opt, scoped);
  const limit = filter.limit ?? 50;
  if (kind === 'series') {
    if (!filter.videoId && !filter.channelId) throw Error('seriesには --video または --channel が必要です');
    const points = rawSeries(batches, opt, {videoId: filter.videoId, channelId: filter.channelId});
    const rows = points.map(p => [p.at, p.status, p.viewCount, filter.channelId ? p.subscriberCount ?? null : p.chartRank ?? null]);
    return {kind, title: `取得値の推移 ${filter.videoId ?? filter.channelId}`, columns: ['取得時刻', '状態', '再生数', filter.channelId ? '登録者数（3桁切り捨て、非公開は空）' : '全体人気チャート順位'],
      rows, notes: [...notes, '取得したままの値（派生計算なし）。missingは取得できなかった時点（削除・非公開化の可能性）。', ...(rows.length ? [] : ['該当する記録がありません'])]};
  }
  if (kind === 'videos') {
    let list = videoGrowth(batches, policy, opt);
    if (filter.categoryId) list = list.filter(v => (v.categoryId ?? 'unknown') === filter.categoryId);
    if (filter.channelId) list = list.filter(v => v.channelId === filter.channelId);
    if (filter.videoId) list = list.filter(v => v.videoId === filter.videoId);
    const rows = list.slice(0, limit).map(v => [v.videoId, v.channelId, v.categoryId ?? 'unknown', v.title, ...growthCells(v.views)]);
    return {kind, title: '動画の再生数の伸び（1日当たりの降順）', columns: ['動画ID', 'チャンネルID', 'カテゴリ', 'タイトル', ...GROWTH_COLUMNS], rows,
      notes: [...notes, DERIVED_NOTE, '相対増加率 = 増加量 ÷ 開始値（開始値0は空）。注記がある行は値を比較に使わない（stale・low-sampleは参考値）。',
        `表示 ${rows.length}件 / 該当 ${list.length}件`, ...reasonLegend(rows, 13)]};
  }
  if (kind === 'channels') {
    let list = channelGrowth(batches, policy, opt);
    if (filter.channelId) list = list.filter(c => c.channelId === filter.channelId);
    const rows = list.slice(0, limit).map(c => [c.channelId, c.title, ...growthCells(c.views), c.subscribers.start?.value ?? null, c.subscribers.end?.value ?? null,
      c.subscribers.delta, c.subscribers.uncertainty, reasons(c.subscribers.reasons), c.videos.delta]);
    return {kind, title: 'チャンネルの伸び（再生数1日当たりの降順）', rows,
      columns: ['チャンネルID', 'チャンネル名', ...GROWTH_COLUMNS.map(c => `再生 ${c}`), '登録者 開始', '登録者 終了', '登録者 増加', '登録者 誤差±', '登録者 注記', '公開動画数 増加'],
      notes: [...notes, DERIVED_NOTE, '登録者数はAPIで有効数字3桁に切り捨てられた値。増加は誤差±の範囲で不確か。非公開は空。',
        `表示 ${rows.length}件 / 該当 ${list.length}件`, ...reasonLegend(rows, 11), ...reasonLegend(rows, 16)]};
  }
  const t = categoryTrend(batches, policy, opt);
  let cats = t.categories;
  if (filter.categoryId) cats = cats.filter(c => c.categoryId === filter.categoryId);
  const rows = cats.map(c => [c.categoryId, c.title, c.start?.count ?? null, c.start?.total ?? null, round(c.start ? c.start.share * 100 : null, 1),
    c.end.count, c.end.total, round(c.end.share * 100, 1), round(c.changePoints, 1), round(c.medianPerDay), c.momentumSample, reasons(c.reasons)]);
  return {kind, title: `カテゴリ別の人気チャート構成比（${t.startAt ?? '-'} → ${t.at ?? '-'}）`, rows,
    columns: ['カテゴリID', 'カテゴリ名', '開始 件数', '開始 母数', '開始 構成比%', '終了 件数', '終了 母数', '終了 構成比%', '変化（ポイント）', '増加の中央値（回/日）', '中央値の標本数', '注記'],
    notes: [...notes, DERIVED_NOTE,
      '構成比は全体の人気チャート（mostPopular、カテゴリ指定なし）上位に入った動画のカテゴリ内訳で、YouTube全体のカテゴリ別視聴量ではない。地域が違う結果と比べない。',
      `全体の注記: ${t.reasons.map(r => `${r}（${REASON_LABEL[r]}）`).join('、') || 'なし'}`,
      ...(t.at ? [] : ['完全な全体チャートの記録がありません']), ...reasonLegend(rows, 11)]};
}

// 表示用の幅（全角を2として数える）。
const width = (s: string) => [...s].reduce((n, ch) => n + (/[　-鿿＀-￯]/.test(ch) ? 2 : 1), 0);
const cell = (v: unknown) => v === null || v === undefined ? '-' : String(v);

export function formatText(r: Report): string {
  const lines = [`# ${r.title}`, ...r.notes.map(n => `- ${n}`), ''];
  if (!r.rows.length) return [...lines, '（該当なし）'].join('\n');
  const table = [r.columns, ...r.rows.map(row => row.map(cell))];
  const w = r.columns.map((_, i) => Math.max(...table.map(row => width(String(row[i])))));
  for (const row of table) lines.push(row.map((c, i) => String(c) + ' '.repeat(w[i] - width(String(c)))).join('  ').trimEnd());
  return lines.join('\n');
}

// 表計算ソフトで式として解釈されないようにする（=,+,-,@,タブ,CRで始まる文字列に'を付ける）。数値はそのまま。
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

export function formatCsv(r: Report): string {
  const notes = r.notes.map(n => `# ${n.replace(/[\r\n]+/g, ' ')}`);
  return [...notes, r.columns.map(csvCell).join(','), ...r.rows.map(row => row.map(csvCell).join(','))].join('\n') + '\n';
}

export function formatJson(r: Report): string {
  return JSON.stringify({title: r.title, notes: r.notes, rows: r.rows.map(row => Object.fromEntries(r.columns.map((c, i) => [c, row[i]])))}, null, 1) + '\n';
}
