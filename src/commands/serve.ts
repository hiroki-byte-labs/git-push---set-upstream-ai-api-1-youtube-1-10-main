// serveコマンド: 127.0.0.1だけで、ジョブ一覧・詳細・承認/差戻しを提供する（T033）。
// 承認はローカル記録のみで、投稿はしない。承認は画面に表示した確認対象一式の版（bundleHash）で送る（T095）。POSTはHost/Originを検査し、他サイトからの送信を拒否する。
import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createServer} from 'node:http';
import type {IncomingMessage, ServerResponse} from 'node:http';
import {JOB_ID, listJobs} from '../jobs.ts';
import {approvalOf, history, readJob, recordReview} from '../review.ts';

export const PORT = 4173;
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]!));
const STATE_LABEL: Record<string, string> = {pending: '未確認', approved: '承認済み', rejected: '差戻し', expired: '承認失効', 'not-reviewable': '確認対象外'};

function layout(title: string, body: string) {
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{background:#0c1626;color:#eef;font:16px/1.6 system-ui;margin:24px;max-width:1100px}a{color:#51d4b8}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #243;padding:6px;text-align:left;vertical-align:top}
.tag{padding:2px 8px;border-radius:8px;background:#1b2e43}.approved{background:#1f5b45}.rejected,.expired{background:#6b2d2d}video{width:100%;max-width:960px}textarea{width:100%;max-width:600px}button{margin-right:8px;padding:6px 14px}</style>
<body>${body}</body></html>`;
}

function listPage(root: string) {
  const rows = listJobs(root).map(j => `<tr><td><a href="/job/${esc(j.id)}">${esc(j.id)}</a></td><td>${esc(j.status)}${j.stale ? '（中断の疑い）' : ''}</td><td>${esc(j.createdAt)}</td><td>${esc(j.durationSeconds ?? '')}</td><td><span class="tag ${esc(j.approval)}">${esc(STATE_LABEL[j.approval] ?? j.approval)}</span></td></tr>`).join('');
  return layout('制作ジョブ一覧', `<h1>制作ジョブ一覧</h1><p>ローカル確認用。承認は記録のみで、投稿はしません。</p><table><tr><th>ジョブ</th><th>状態</th><th>作成</th><th>秒</th><th>確認</th></tr>${rows}</table>`);
}

function detailPage(root: string, id: string, message = '') {
  const dir = join(root, id);
  const job = readJob(dir);
  const approval = approvalOf(dir);
  const plan = existsSync(join(dir, 'plan.json')) ? JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8')) : {scenes: []};
  const lint = existsSync(join(dir, 'lint.json')) ? JSON.parse(readFileSync(join(dir, 'lint.json'), 'utf8')) : null;
  const media = existsSync(join(dir, 'media-check.json')) ? JSON.parse(readFileSync(join(dir, 'media-check.json'), 'utf8')) : null;
  const scenes = (plan.scenes ?? []).map((s: any, i: number) => `<tr><td>${i + 1}</td><td>${esc(s.title)}</td><td>${esc(s.narration)}</td><td>${(s.cues ?? []).map((c: any) => esc(c.text)).join('<br>')}</td><td>${esc(s.diagram?.type)}</td><td>${esc(s.seconds)}</td></tr>`).join('');
  const findings = lint ? lint.findings.map((f: any) => `<li>${esc(f.level)} [${esc(f.rule)}] ${esc(f.where)}: ${esc(f.message)}</li>`).join('') : '';
  // 承認対象（タイトル・概要欄・タグ・チャプター・サムネイル）は、版の計算に使った一式（approval.bundle）から表示する（T095）。
  const meta = existsSync(join(dir, 'metadata.json')) ? JSON.parse(readFileSync(join(dir, 'metadata.json'), 'utf8')) : null;
  const shown = approval.bundle?.metadata;
  const metaHtml = shown ? `<p>タイトル: <b>${esc(shown.selectedTitle)}</b>（候補: ${(meta?.titles ?? []).map(esc).join(' / ')}）</p><p>タグ: ${esc(shown.tags.join(', ') || 'なし')}</p><p>問題: ${esc(meta?.issues?.join(' / ') || 'なし')}</p><pre style="white-space:pre-wrap;background:#13233a;padding:12px">${esc(shown.description)}</pre>` : '<p>記録なし</p>';
  const thumbChecks = new Map<string, any>((job.thumbnails ?? []).map((t: any) => [t.file, t]));
  const thumbHtml = (approval.bundle?.thumbnails ?? []).map(t => {
    const c = thumbChecks.get(t.file);
    return `<figure style="display:inline-block;margin:0 12px 12px 0">${t.sha256 ? `<img src="/job/${esc(id)}/${esc(t.file)}" width="320" alt="${esc(t.file)}">` : ''}<figcaption>${esc(t.file)} ${!t.sha256 ? '画像がない' : c ? (c.ok ? 'OK' : esc(c.issues.join(' / '))) : '検査記録なし'}</figcaption></figure>`;
  }).join('') || '<p>なし</p>';
  const short = (h: string | null | undefined) => (h ? esc(h.slice(0, 12)) : 'なし');
  const bundleHtml = approval.bundle ? `<ul><li>動画: ${short(approval.bundle.video)}</li><li>字幕: ${short(approval.bundle.subtitles)}</li><li>タイトル・概要欄・タグ・チャプター: ${approval.bundle.metadata ? 'あり' : 'なし'}</li><li>サムネイル案（全案）: ${approval.bundle.thumbnails.map(t => `${esc(t.file)} ${short(t.sha256)}`).join(', ') || 'なし'}</li></ul>` : '';
  const reviews = history(dir).map(r => `<li>${esc(r.at)} ${esc(r.decision === 'approve' ? '承認' : '差戻し')} ${esc(r.note)}（${r.bundleHash ? `一式の版 ${esc(r.bundleHash.slice(0, 12))}` : `旧形式: 動画の版 ${esc(r.outputHash.slice(0, 12))}`}、${esc(r.reviewer)}）</li>`).join('');
  const form = approval.state === 'not-reviewable' ? '' : `<form method="post" action="/job/${esc(id)}/review">
<input type="hidden" name="bundleHash" value="${esc(approval.currentHash)}"><p><textarea name="note" rows="3" placeholder="メモ（差戻しは必須）"></textarea></p>
<button name="decision" value="approve">この版を承認</button><button name="decision" value="reject">差戻し</button></form>`;
  const video = job.status === 'completed' ? `<video controls src="/job/${esc(id)}/sample.mp4"><track kind="subtitles" srclang="ja" label="日本語" src="/job/${esc(id)}/subtitles.vtt"${job.subtitles === 'soft' ? ' default' : ''}></video>` : '<p>動画なし</p>';
  return layout(id, `<p><a href="/">← 一覧</a></p><h1>${esc(plan.title ?? id)}</h1>${message ? `<p><b>${esc(message)}</b></p>` : ''}
<p>状態: ${esc(job.status)} / 確認: <span class="tag ${esc(approval.state)}">${esc(STATE_LABEL[approval.state])}</span> ${esc(approval.reason)}</p>
<p>版（確認対象一式のSHA-256）: <code>${esc(approval.currentHash ?? '-')}</code></p>${bundleHtml}${video}
<h2>確認</h2>${form}<ul>${reviews || '<li>履歴なし</li>'}</ul>
<h2>サムネイル案</h2>${thumbHtml}
<h2>タイトル・概要欄</h2>${metaHtml}
<h2>見やすさ</h2><p>${job.readability ? `${job.readability.ok ? 'OK' : '要確認'}（${esc(job.resolution ?? 720)}p、最小文字 ${esc(job.readability.minFont720?.toFixed?.(0))}pt相当、最小コントラスト比 ${esc(job.readability.minContrast)}）${esc(job.readability.issues.join(' / '))}` : '記録なし'}</p>
<h2>安全検査</h2><p>${lint ? `error ${lint.errors} / warning ${lint.warnings}` : '記録なし'}</p><ul>${findings}</ul>
<h2>媒体検査</h2><p>${media ? `フレーム ${esc(media.videoFrames)}/${esc(media.expectedFrames)}、PSNR最小 ${esc(media.psnr?.minDb?.toFixed?.(1))} dB、音量 ${esc(media.loudness?.integratedLufs)} LUFS、字幕 ${esc(media.subtitles)}` : '記録なし'}</p>
<h2>台本</h2><table><tr><th>#</th><th>見出し</th><th>ナレーション</th><th>字幕</th><th>図解</th><th>秒</th></tr>${scenes}</table>`);
}

function sendFile(req: IncomingMessage, res: ServerResponse, path: string, type: string) {
  if (!existsSync(path)) return notFound(res);
  const b = readFileSync(path);
  const range = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
  let start = 0, end = b.length - 1;
  if (range && (range[1] || range[2])) {
    if (range[1]) {
      start = Number(range[1]);
      if (range[2]) end = Math.min(Number(range[2]), b.length - 1);
    } else {
      start = Math.max(0, b.length - Number(range[2]));
    }
    if (start > end) {
      res.writeHead(416, {'Content-Range': `bytes */${b.length}`});
      return res.end();
    }
  }
  const partial = Boolean(range && (range[1] || range[2]));
  res.writeHead(partial ? 206 : 200, {'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, ...(partial ? {'Content-Range': `bytes ${start}-${end}/${b.length}`} : {})});
  res.end(b.subarray(start, end + 1));
}

function notFound(res: ServerResponse) {
  res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'});
  res.end('not found');
}

function html(res: ServerResponse, body: string, status = 200) {
  res.writeHead(status, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'});
  res.end(body);
}

// 他サイトからのフォーム送信（CSRF）とDNSリバインディングを防ぐため、HostとOriginを許可リストで検査する。
export function trustedPost(req: IncomingMessage) {
  const host = req.headers.host ?? '';
  const origin = req.headers.origin;
  return ALLOWED_HOSTS.has(host) && (origin === undefined || [...ALLOWED_HOSTS].some(h => origin === `http://${h}`));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', c => {
      data += c;
      if (data.length > 8192) reject(Error('本文が大きすぎる'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export function createHandler(root = 'outputs') {
  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = new URL(req.url ?? '/', 'http://local');
      const path = url.pathname;
      if (req.method === 'GET' && path === '/') return html(res, listPage(root));
      // 旧URL（M1）: 最新ジョブの動画。
      if (req.method === 'GET' && path === '/sample.mp4') {
        const id = JSON.parse(readFileSync(join(root, 'latest.json'), 'utf8')).id;
        if (!JOB_ID.test(id)) return notFound(res);
        return sendFile(req, res, join(root, id, 'sample.mp4'), 'video/mp4');
      }
      const m = path.match(/^\/job\/([^/]+)(?:\/(sample\.mp4|subtitles\.vtt|review|thumbnail-[abc]\.png))?$/);
      if (!m || !JOB_ID.test(m[1]) || !existsSync(join(root, m[1], 'job.json'))) return notFound(res);
      const [, id, sub] = m;
      const dir = join(root, id);
      if (req.method === 'GET' && !sub) return html(res, detailPage(root, id));
      if (req.method === 'GET' && sub === 'sample.mp4') return sendFile(req, res, join(dir, 'sample.mp4'), 'video/mp4');
      if (req.method === 'GET' && sub?.startsWith('thumbnail-')) return sendFile(req, res, join(dir, sub), 'image/png');
      if (req.method === 'GET' && sub === 'subtitles.vtt') return sendFile(req, res, join(dir, 'subtitles.vtt'), 'text/vtt; charset=utf-8');
      if (req.method === 'POST' && sub === 'review') {
        if (!trustedPost(req)) {
          res.writeHead(403, {'Content-Type': 'text/plain; charset=utf-8'});
          return res.end('許可されていない送信元です');
        }
        const form = new URLSearchParams(await readBody(req));
        try {
          recordReview(dir, form.get('decision') as any, form.get('note') ?? '', form.get('bundleHash') ?? '');
        } catch (e) {
          return html(res, detailPage(root, id, String(e)), 409);
        }
        res.writeHead(303, {Location: `/job/${id}`});
        return res.end();
      }
      res.writeHead(405);
      res.end();
    } catch (e) {
      res.writeHead(500, {'Content-Type': 'text/plain; charset=utf-8'});
      res.end(String(e));
    }
  };
}

export function serve(root = 'outputs') {
  createServer(createHandler(root)).listen(PORT, '127.0.0.1', () => console.log(`http://127.0.0.1:${PORT}`));
}
