// タイトル・概要欄・チャプター・タグの生成と検査（T074）。YouTubeへの反映はしない（T032）。
// 上限はYouTube公式（2026-10-08確認。docs/RESEARCH-GROWTH.md 6章）:
// タイトル100文字・<>不可、説明はAPIで5000バイト・<>不可、タグは合計500文字（区切りと引用符を含む）、
// チャプターは00:00開始・3つ以上・各10秒以上。
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {chaptersOf, totalSeconds, DEFAULT_AI_DISCLOSURE} from './plan.ts';
import type {Plan} from './plan.ts';
import {lintText} from './lint.ts';
import {buildChecklist} from './checklist.ts';

export const YT = {titleChars: 100, descriptionBytes: 5000, tagsChars: 500, chapterMin: 3, chapterMinSeconds: 10} as const;

// 出典の記録（T103）。番号は概要欄・画面の[n]と同じ規則（場面の初出順、続いて場面で未参照のもの）。
// scenesは参照する場面番号（1始まり）、introは導入文で使うか。URLの記録は主張の検証済みを意味しない。
export type SourceRecord = {number: number; id: string; title: string; url: string; accessedAt: string; scenes: number[]; intro: boolean};
export const SOURCES_NOTE = '出典は動画内の主張の参照先として記録した文献名・URL・確認日です。リンクの存在は主張が検証済みであることを意味しません。主張と出典の対応は台本の確認（人）で確かめます。';

// 改変・合成コンテンツ（YouTube開示設定: containsSyntheticMedia）の判定結果（T071、G20）。
export type SyntheticMediaDisclosure = {
  containsSyntheticMedia: boolean;
  reason: string;
};

export type Metadata = {
  titles: string[]; selectedTitle: string; description: string; tags: string[];
  chapters: {time: string; title: string}[]; chaptersOmitted?: string;
  intro?: string; sources: SourceRecord[]; sourcesNote: string;
  aiDisclosureText: string;
  syntheticMedia: SyntheticMediaDisclosure;
  selectedThumbnail?: string;
  issues: string[]; ok: boolean;
};

export function sourceRecords(plan: Plan): SourceRecord[] {
  const order = [...new Set(plan.scenes.flatMap(s => s.sources))];
  const ids = [...order, ...plan.sources.map(s => s.id).filter(id => !order.includes(id))];
  const byId = new Map(plan.sources.map(s => [s.id, s]));
  return ids.map((id, i) => {
    const s = byId.get(id)!;
    return {number: i + 1, id, title: s.title, url: s.url, accessedAt: s.accessedAt, scenes: plan.scenes.flatMap((x, k) => (x.sources.includes(id) ? [k + 1] : [])), intro: plan.intro?.sources.includes(id) ?? false};
  });
}

export function timestamp(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = Math.floor(sec % 60);
  const p = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

const clean = (t: string) => t.replace(/[<>]/g, '').trim();
const chars = (t: string) => [...t].length;
// APIの数え方: カンマ区切りの合計。空白を含むタグは引用符2文字を加える。
export const tagsLength = (tags: string[]) => tags.reduce((n, t) => n + chars(t) + (/\s/.test(t) ? 2 : 0), 0) + Math.max(0, tags.length - 1);

export function checkTitle(title: string) {
  const issues: string[] = [];
  if (!title.trim()) issues.push('タイトルが空');
  if (chars(title) > YT.titleChars) issues.push(`タイトルが${YT.titleChars}文字を超える（${chars(title)}）`);
  if (/[<>]/.test(title)) issues.push('タイトルに < > は使えない');
  for (const f of lintText(title)) issues.push(`タイトルの禁止表現: ${f.message}`);
  return issues;
}

// YouTube公式ポリシー（G20）に基づく改変・合成コンテンツ開示判定（T071）。
// 現実と誤認しうる合成（ディープフェイク等）は開示義務があるが、
// アニメーション・図解モーショングラフィックス・制作補助ツールとしてのAI利用は開示義務の対象外。
export function evaluateSyntheticMedia(plan: Plan): SyntheticMediaDisclosure {
  if (plan.aiDisclosure?.realisticSyntheticMedia) {
    return {
      containsSyntheticMedia: true,
      reason: '台本に現実と誤認しうる合成メディア（realisticSyntheticMedia: true）が指定されているため、YouTubeへの開示が必要です。',
    };
  }
  return {
    containsSyntheticMedia: false,
    reason: '図解モーショングラフィックスおよび制作補助としてのAI利用であり、現実と誤認しうる合成（実写ディープフェイク等）を含まないため開示義務はありません（YouTube公式ポリシーG20）。',
  };
}

// 概要欄に入れる定型の説明文（どこにAIを使い、人が何を確認したか。T071、G21〜G22）。
export function formatAiDisclosure(plan: Plan): string {
  const d = plan.aiDisclosure ?? DEFAULT_AI_DISCLOSURE;
  return [
    '【AIの利用と人の監修について】',
    `・AI利用範囲: ${d.scopes.join('、')}`,
    `・監修者: ${d.supervisor}`,
    `・人間による確認項目: ${d.verified.join('、')}`,
    '※本動画は制作補助としてAIを活用していますが、内容の正確性・出典の確認・考察の検討は人間が責任を持って監修しています（完全自動生成ではありません）。',
  ].join('\n');
}

export function buildMetadata(plan: Plan, extras: {sources: string; stance: string; aiDisclosure?: string}): Metadata {
  // タイトル案: 台本の題名、約束（promise）＋題名、冒頭の問い。中身と一致させるため台本の文言から作る。
  const hook = plan.scenes.find(s => s.role === 'hook')?.narration.match(/[^。！？?]*[？?]/)?.[0];
  const candidates = [plan.title, plan.promise ? `${plan.promise}｜${plan.title}` : '', hook ?? ''].map(clean).filter(Boolean);
  const titles = [...new Set(candidates)].filter(t => !checkTitle(t).length);

  const chapters = chaptersOf(plan);
  let chapterLines: {time: string; title: string}[] = [];
  let chaptersOmitted: string | undefined;
  if (chapters.length < YT.chapterMin) chaptersOmitted = `章が${chapters.length}つ（YouTubeのチャプターは${YT.chapterMin}つ以上）`;
  else if (chapters.some(c => c.seconds < YT.chapterMinSeconds)) chaptersOmitted = `${YT.chapterMinSeconds}秒未満の章がある`;
  else chapterLines = chapters.map(c => ({time: timestamp(c.startSeconds), title: clean(c.title)}));

  const aiDisclosureText = extras.aiDisclosure ?? formatAiDisclosure(plan);
  const syntheticMedia = evaluateSyntheticMedia(plan);

  // 概要欄の先頭は導入文（T103。ニュースや事象から題材へ入る）。
  const description = [
    plan.intro ? clean(plan.intro.text) : '',
    plan.promise ? `この動画で分かること: ${clean(plan.promise)}` : '',
    chapterLines.length ? ['チャプター', ...chapterLines.map(c => `${c.time} ${c.title}`)].join('\n') : '',
    plan.glossary?.length ? ['用語', ...plan.glossary.map(g => `・${clean(g.term)}: ${clean(g.definition)}`)].join('\n') : '',
    buildChecklist(plan).text,
    clean(extras.sources),
    clean(extras.stance),
    clean(aiDisclosureText),
  ].filter(Boolean).join('\n\n');

  const tags: string[] = [];
  for (const t of (plan.glossary ?? []).map(g => clean(g.term))) if (tagsLength([...tags, t]) <= YT.tagsChars) tags.push(t);

  const issues: string[] = [];
  if (!titles.length) issues.push('有効なタイトル案がない');
  const bytes = Buffer.byteLength(description, 'utf8');
  if (bytes > YT.descriptionBytes) issues.push(`概要欄が${YT.descriptionBytes}バイトを超える（${bytes}）`);
  for (const f of lintText(description)) issues.push(`概要欄の禁止表現: ${f.message}`);
  if (totalSeconds(plan) >= 180 && chaptersOmitted) issues.push(`チャプターなし: ${chaptersOmitted}`);
  return {
    titles, selectedTitle: titles[0] ?? '', description, tags, chapters: chapterLines, chaptersOmitted,
    ...(plan.intro ? {intro: clean(plan.intro.text)} : {}),
    sources: sourceRecords(plan), sourcesNote: SOURCES_NOTE,
    aiDisclosureText, syntheticMedia,
    selectedThumbnail: 'thumbnail-a.png',
    issues, ok: issues.length === 0,
  };
}

// 公開後の見直し（G9: タイトル・サムネイルの変更で伸びた割合が無変更より高い）。理由とともに履歴へ追記する。
export type Revision = {at: string; field: 'title' | 'thumbnail'; from: string; to: string; reason: string; by: string};

export function reviseTitle(dir: string, to: string, reason: string, by = 'cli-user'): Revision {
  const path = join(dir, 'metadata.json');
  if (!existsSync(path)) throw Error('metadata.jsonがない');
  if (!reason.trim()) throw Error('見直しの理由（--reason）が必要');
  const issues = checkTitle(to);
  if (issues.length) throw Error(issues.join(' / '));
  const m: Metadata = JSON.parse(readFileSync(path, 'utf8'));
  const rev: Revision = {at: new Date().toISOString(), field: 'title', from: m.selectedTitle, to, reason, by};
  const histPath = join(dir, 'metadata-revisions.json');
  const hist: Revision[] = existsSync(histPath) ? JSON.parse(readFileSync(histPath, 'utf8')) : [];
  writeFileSync(histPath, JSON.stringify([...hist, rev], null, 2));
  writeFileSync(path, JSON.stringify({...m, selectedTitle: to}, null, 2));
  return rev;
}

export function reviseThumbnail(dir: string, to: string, reason: string, by = 'cli-user'): Revision {
  const path = join(dir, 'metadata.json');
  if (!existsSync(path)) throw Error('metadata.jsonがない');
  if (!reason.trim()) throw Error('見直しの理由（--reason）が必要');
  if (!/^thumbnail-[a-c]\.png$/.test(to)) throw Error('サムネイルは thumbnail-a.png, thumbnail-b.png, thumbnail-c.png のいずれか');
  const m: Metadata = JSON.parse(readFileSync(path, 'utf8'));
  const from = m.selectedThumbnail ?? 'thumbnail-a.png';
  const rev: Revision = {at: new Date().toISOString(), field: 'thumbnail', from, to, reason, by};
  const histPath = join(dir, 'metadata-revisions.json');
  const hist: Revision[] = existsSync(histPath) ? JSON.parse(readFileSync(histPath, 'utf8')) : [];
  writeFileSync(histPath, JSON.stringify([...hist, rev], null, 2));
  writeFileSync(path, JSON.stringify({...m, selectedThumbnail: to}, null, 2));
  return rev;
}
