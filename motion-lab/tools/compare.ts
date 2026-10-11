// 参考動画と生成動画を比較する。
// 1. 画素: FFmpegのSSIM/PSNR（フレームごと）と、差分画素の数・範囲。
// 2. 画像: 差の大きいフレームと各動きの区間の中央で「参考 | 生成 | 差×4」の比較画像、全体の比較動画。
// 3. 動き: 生成動画を同じ解析器にかけ、図形ごとの実測値（位置・大きさ・角度・不透明度）と、開始・終了・イージングを比べる。
// 使い方: node tools/compare.ts <参考.mp4> <生成.mp4> --reference-analysis <analysis.json> --out <出力先> [--match position] [--design-changed]
import {spawn} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import type {Analysis, ChannelName, ElementAnalysis} from '../shared/analysis.ts';
import {analyzeVideo} from './analyze.ts';
import {ffmpeg, ffmpegPath, probe} from './lib/ffmpeg.ts';
import {round} from './lib/fit.ts';

export const CRITERIA = {
  ssimMean: 0.98, ssimMin: 0.95, psnrMean: 35,
  position: 1.5, size: 1.5, angle: 1, opacity: 0.05, timing: 1,
};

type FrameStat = {n: number; ssim: number; psnr: number; changed: number; bbox: [number, number, number, number] | null};
export type ElementDiff = {
  reference: string; generated: string | null;
  maxError: Partial<Record<ChannelName, number>>; rmsError: Partial<Record<ChannelName, number>>;
  visibility: {referenceFirst: number; generatedFirst: number | null; referenceLast: number; generatedLast: number | null};
  /** startDiff/endDiff: 判定に使う時刻差。開始（終了）が観測できない動きはモデル上の時刻の差（basis=model）。visibleStartDiffは最初に見えたフレームの差（色・コントラストに依存）。 */
  animations: {type: string; generatedType: string | null; startDiff: number | null; endDiff: number | null; basis: 'observed' | 'model' | 'unidentifiable'; visibleStartDiff: number | null; easing: string | null; generatedEasing: string | null; easingMatch: boolean | null}[];
  shape: {reference: string | null; generated: string | null; compared: boolean};
  pass: boolean; problems: string[];
};
export type Comparison = {
  reference: string; generated: string;
  video: {match: boolean; reference: string; generated: string};
  pixel: {ssimMean: number; ssimMin: number; ssimMinFrame: number; psnrMean: number; psnrMin: number; worstFrames: FrameStat[]; perScene: {scene: number; ssimMean: number; ssimMin: number}[]};
  motion: {elements: ElementDiff[]; unmatchedGenerated: string[]};
  images: string[];
  video_sbs: string | null;
  designChanged: boolean;
  criteria: typeof CRITERIA;
  verdict: {pass: boolean; failures: string[]};
};

const FONT = ['/System/Library/Fonts/Supplemental/Arial.ttf', '/System/Library/Fonts/Helvetica.ttc'].find(existsSync);
const label = (t: string) => (FONT ? `,drawtext=fontfile=${FONT}:text='${t}':x=10:y=10:fontsize=28:fontcolor=white:box=1:boxcolor=black@0.6` : '');

/** 差分（各画素のRGB差の最大）が16を超える画素の数と範囲を、フレームごとに数える。 */
async function diffStats(ref: string, gen: string, w: number, h: number) {
  const size = w * h * 3, out: {changed: number; bbox: [number, number, number, number] | null}[] = [];
  const child = spawn(ffmpegPath(), ['-hide_banner', '-nostdin', '-i', ref, '-i', gen, '-lavfi', '[0:v]format=gbrp[a];[1:v]format=gbrp[b];[a][b]blend=all_mode=difference,format=rgb24', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {stdio: ['ignore', 'pipe', 'pipe']});
  let err = '';
  child.stderr.on('data', d => { err = (err + d).slice(-2000); });
  let buf: Buffer = Buffer.alloc(0);
  for await (const chunk of child.stdout) {
    buf = buf.length ? Buffer.concat([buf, chunk as Buffer]) : (chunk as Buffer);
    while (buf.length >= size) {
      let c = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let i = 0; i < w * h; i++) {
        if (Math.max(buf[i * 3], buf[i * 3 + 1], buf[i * 3 + 2]) <= 16) continue;
        c++;
        const x = i % w, y = (i - x) / w;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      out.push({changed: c, bbox: c ? [x0, y0, x1, y1] : null});
      buf = buf.subarray(size);
    }
  }
  const code: number = await new Promise(r => child.on('close', r));
  if (code !== 0) throw Error(`差分の計算に失敗: ${err}`);
  return out;
}

function matchElements(ref: Analysis, gen: Analysis, byPosition: boolean) {
  const diag = Math.hypot(ref.video.width, ref.video.height), used = new Set<string>(), pairs = new Map<string, ElementAnalysis | null>();
  const rgbDist = (a: ElementAnalysis, b: ElementAnalysis) => (a.color.rgb && b.color.rgb ? Math.hypot(...a.color.rgb.map((v, i) => v - b.color.rgb![i])) / 441 : 1);
  const cost = (a: ElementAnalysis, b: ElementAnalysis) => Math.hypot(a.layout.final.cx - b.layout.final.cx, a.layout.final.cy - b.layout.final.cy) / diag + Math.abs(a.observed.firstFrame - b.observed.firstFrame) / ref.video.frameCount + (byPosition ? 0 : rgbDist(a, b));
  const all = ref.elements.flatMap(a => gen.elements.filter(b => b.scene === a.scene).map(b => ({a, b, c: cost(a, b)}))).sort((x, y) => x.c - y.c);
  for (const {a, b, c} of all) if (!pairs.has(a.id) && !used.has(b.id) && c < 0.3) { pairs.set(a.id, b); used.add(b.id); }
  for (const a of ref.elements) if (!pairs.has(a.id)) pairs.set(a.id, null);
  return {pairs, unmatched: gen.elements.filter(b => !used.has(b.id)).map(b => b.id)};
}

/** designChanged: 独自配色など見た目を意図的に変えた再現。形・大きさ・見え始め（コントラスト依存）は判定に含めず、位置・角度・不透明度・時刻・イージングで判定する。 */
function diffElement(a: ElementAnalysis, b: ElementAnalysis | null, designChanged: boolean): ElementDiff {
  const d: ElementDiff = {reference: a.id, generated: b?.id ?? null, maxError: {}, rmsError: {}, visibility: {referenceFirst: a.observed.firstFrame, generatedFirst: b?.observed.firstFrame ?? null, referenceLast: a.observed.lastFrame, generatedLast: b?.observed.lastFrame ?? null}, animations: [], shape: {reference: a.shape.value, generated: b?.shape.value ?? null, compared: !designChanged}, pass: true, problems: []};
  if (!b) { d.pass = false; d.problems.push('生成動画に対応する図形がない'); return d; }
  if (!designChanged && a.shape.value !== b.shape.value) d.problems.push(`形が異なる（参考${a.shape.value}、生成${b.shape.value}）`);
  const lim: Record<ChannelName, number> = {cx: CRITERIA.position, cy: CRITERIA.position, w: CRITERIA.size, h: CRITERIA.size, angle: CRITERIA.angle, opacity: CRITERIA.opacity};
  for (const c of Object.keys(lim) as ChannelName[]) {
    if (designChanged && (c === 'w' || c === 'h') && a.shape.value !== b.shape.value) continue;
    const ma = new Map(a.series[c].frames.map((f, i) => [f, a.series[c].values[i]])), errs: {f: number; e: number}[] = [];
    b.series[c].frames.forEach((f, i) => { if (ma.has(f)) errs.push({f, e: Math.abs(ma.get(f)! - b.series[c].values[i])}); });
    if (!errs.length) continue;
    const worst = errs.reduce((x, y) => (y.e > x.e ? y : x));
    d.maxError[c] = round(worst.e, 3);
    d.rmsError[c] = round(Math.sqrt(errs.reduce((s, x) => s + x.e ** 2, 0) / errs.length), 3);
    if (worst.e > lim[c]) d.problems.push(`${c}の差が最大${worst.e.toFixed(2)}（フレーム${worst.f}、許容${lim[c]}）`);
  }
  if (!designChanged && Math.abs(a.observed.firstFrame - b.observed.firstFrame) > CRITERIA.timing) d.problems.push(`見え始めが${b.observed.firstFrame - a.observed.firstFrame}フレームずれる（参考${a.observed.firstFrame}、生成${b.observed.firstFrame}）`);
  if (!designChanged && Math.abs(a.observed.lastFrame - b.observed.lastFrame) > CRITERIA.timing) d.problems.push(`見え終わりが${b.observed.lastFrame - a.observed.lastFrame}フレームずれる`);
  type TP = ElementAnalysis['animations'][number]['start'];
  // 観測できない端（上限・下限）はモデル上の時刻で比べる。最初に見えたフレームは色・コントラストで変わるため。
  const unobs = (t: TP) => t.status === 'upper_bound' || t.status === 'lower_bound';
  // モデル時刻も不確かさが基準（1フレーム）を超えるなら識別できないため判定に使わない（見え始めと各フレームの軌跡で判定する）。
  const diff = (p: TP, q: TP) => {
    const m = unobs(p) || unobs(q);
    if (m && [p, q].some(x => unobs(x) && (x.modelFrame === undefined || (x.uncertaintyFrames ?? Infinity) > CRITERIA.timing))) return {v: null, basis: 'unidentifiable' as const};
    const pv = m ? p.modelFrame ?? p.frame : p.frame, qv = m ? q.modelFrame ?? q.frame : q.frame;
    return {v: pv !== null && qv !== null ? round(qv - pv, 2) : null, basis: m ? 'model' as const : 'observed' as const};
  };
  a.animations.forEach((x, i) => {
    const y = b.animations.find(z => z.type === x.type) ?? b.animations[i] ?? null;
    const s0 = y ? diff(x.start, y.start) : null, e0 = y ? diff(x.end, y.end) : null;
    const sd = s0?.v ?? null, ed = e0?.v ?? null;
    const em = y && x.easing.best && y.easing.best ? x.easing.best === y.easing.best : null;
    d.animations.push({type: x.type, generatedType: y?.type ?? null, startDiff: sd, endDiff: ed, basis: s0?.basis === 'unidentifiable' || e0?.basis === 'unidentifiable' ? 'unidentifiable' : s0?.basis === 'model' || e0?.basis === 'model' ? 'model' : 'observed', visibleStartDiff: y && x.start.frame !== null && y.start.frame !== null ? round(y.start.frame - x.start.frame, 2) : null, easing: x.easing.best, generatedEasing: y?.easing.best ?? null, easingMatch: em});
    if (!y) d.problems.push(`${x.type}が生成動画で検出されない`);
    else {
      if (y.type !== x.type) d.problems.push(`種類が異なる（参考${x.type}、生成${y.type}）`);
      if (sd !== null && Math.abs(sd) > CRITERIA.timing) d.problems.push(`${x.type}の開始が${sd}フレームずれる`);
      if (ed !== null && Math.abs(ed) > CRITERIA.timing) d.problems.push(`${x.type}の終了が${ed}フレームずれる`);
      if (em === false) d.problems.push(`イージングが異なる（参考${x.easing.best}、生成${y.easing.best}）`);
    }
  });
  if (b.animations.length > a.animations.length) d.problems.push(`生成動画に余分な動きが${b.animations.length - a.animations.length}件ある`);
  d.pass = !d.problems.length;
  return d;
}

export async function compareVideos(refPath: string, genPath: string, refAnalysis: Analysis, outDir: string, opts: {byPosition?: boolean; designChanged?: boolean; log?: (s: string) => void} = {}): Promise<Comparison> {
  const log = opts.log ?? (() => {});
  mkdirSync(outDir, {recursive: true});
  const pr = probe(refPath), pg = probe(genPath);
  const desc = (p: typeof pr) => `${p.width}x${p.height} ${round(p.fps, 3)}fps ${p.frameCount}フレーム`;
  const failures: string[] = [];
  const videoMatch = pr.width === pg.width && pr.height === pg.height && Math.abs(pr.fps - pg.fps) < 1e-6 && pr.frameCount === pg.frameCount;
  if (!videoMatch) throw Error(`動画の形式が一致しない: 参考 ${desc(pr)} / 生成 ${desc(pg)}`);

  // 画素の比較（SSIMのnは1始まり）。
  const ssimLog = join(outDir, 'ssim.log'), psnrLog = join(outDir, 'psnr.log');
  const esc = (p: string) => p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
  ffmpeg(['-i', refPath, '-i', genPath, '-lavfi', `[0:v][1:v]ssim=stats_file='${esc(ssimLog)}'`, '-f', 'null', '-']);
  ffmpeg(['-i', refPath, '-i', genPath, '-lavfi', `[0:v][1:v]psnr=stats_file='${esc(psnrLog)}'`, '-f', 'null', '-']);
  const ssim = readFileSync(ssimLog, 'utf8').trim().split('\n').map(l => Number(l.match(/All:([\d.]+)/)![1]));
  const psnr = readFileSync(psnrLog, 'utf8').trim().split('\n').map(l => { const m = l.match(/psnr_avg:([\d.]+|inf)/)!; return m[1] === 'inf' ? 100 : Number(m[1]); });
  const diffs = await diffStats(refPath, genPath, pr.width, pr.height);
  const frames: FrameStat[] = ssim.map((s, n) => ({n, ssim: s, psnr: psnr[n], changed: diffs[n]?.changed ?? 0, bbox: diffs[n]?.bbox ?? null}));
  const worst = [...frames].sort((a, b) => a.ssim - b.ssim).slice(0, 5);
  const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
  const perScene = refAnalysis.scenes.map(sc => { const fs = frames.filter(f => f.n >= sc.startFrame && f.n <= sc.endFrame); return {scene: sc.index, ssimMean: round(mean(fs.map(f => f.ssim)), 5), ssimMin: round(Math.min(...fs.map(f => f.ssim)), 5)}; });
  const pixel = {ssimMean: round(mean(ssim), 5), ssimMin: round(Math.min(...ssim), 5), ssimMinFrame: worst[0].n, psnrMean: round(mean(psnr), 2), psnrMin: round(Math.min(...psnr), 2), worstFrames: worst.map(f => ({...f, ssim: round(f.ssim, 5), psnr: round(f.psnr, 2)})), perScene};
  if (opts.designChanged) log('見た目を変えた再現のため、画素の基準は判定に含めない（値は記録する）');
  else if (pixel.ssimMean < CRITERIA.ssimMean) failures.push(`SSIMの平均${pixel.ssimMean}が基準${CRITERIA.ssimMean}未満`);
  if (!opts.designChanged && pixel.ssimMin < CRITERIA.ssimMin) failures.push(`SSIMの最小${pixel.ssimMin}（フレーム${pixel.ssimMinFrame}）が基準${CRITERIA.ssimMin}未満`);
  if (!opts.designChanged && pixel.psnrMean < CRITERIA.psnrMean) failures.push(`PSNRの平均${pixel.psnrMean}dBが基準${CRITERIA.psnrMean}dB未満`);
  log(`画素: SSIM平均${pixel.ssimMean} 最小${pixel.ssimMin}(f${pixel.ssimMinFrame}) PSNR平均${pixel.psnrMean}dB`);

  // 比較画像（参考 | 生成 | 差×4）と比較動画。
  const pick = [...new Set([...worst.slice(0, 3).map(f => f.n), ...refAnalysis.motionSegments.map(m => Math.round((m.startFrame + m.endFrame) / 2))])].sort((a, b) => a - b);
  const images: string[] = [];
  const graph = (sel: string) => `[0:v]${sel}format=rgb24,split[r1][r2];[1:v]${sel}format=rgb24,split[g1][g2];[r2][g2]blend=all_mode=difference,lutrgb=r='min(val*4,255)':g='min(val*4,255)':b='min(val*4,255)'${label('diff x4')}[d];[r1]null${label('reference')}[r];[g1]null${label('generated')}[g];[r][g][d]hstack=inputs=3,scale=iw/2:-2`;
  for (const n of pick) {
    const file = join(outDir, `cmp-f${String(n).padStart(4, '0')}.png`);
    ffmpeg(['-i', refPath, '-i', genPath, '-lavfi', graph(`select='eq(n\\,${n})',`), '-frames:v', '1', file]);
    images.push(file);
  }
  const sbs = join(outDir, 'side-by-side.mp4');
  ffmpeg(['-i', refPath, '-i', genPath, '-lavfi', graph(''), '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', sbs]);

  // 動きの比較（生成動画を同じ解析器で測る）。
  log('生成動画を解析中…');
  const genAnalysis = await analyzeVideo(genPath, {rightsNote: 'motion-labのRemotion合成で描画した生成動画（比較用）', extractFrames: false});
  writeFileSync(join(outDir, 'generated-analysis.json'), JSON.stringify(genAnalysis, null, 2) + '\n');
  const {pairs, unmatched} = matchElements(refAnalysis, genAnalysis, !!opts.byPosition);
  const elements = refAnalysis.elements.map(a => diffElement(a, pairs.get(a.id) ?? null, !!opts.designChanged));
  for (const e of elements) for (const p of e.problems) failures.push(`${e.reference}: ${p}`);
  if (unmatched.length) failures.push(`生成動画にだけある図形: ${unmatched.join(', ')}`);
  if (genAnalysis.scenes.length !== refAnalysis.scenes.length) failures.push(`シーン数が異なる（参考${refAnalysis.scenes.length}、生成${genAnalysis.scenes.length}）`);

  return {
    reference: refPath, generated: genPath,
    video: {match: videoMatch, reference: desc(pr), generated: desc(pg)},
    pixel, motion: {elements, unmatchedGenerated: unmatched}, images, video_sbs: sbs, designChanged: !!opts.designChanged, criteria: CRITERIA,
    verdict: {pass: !failures.length, failures},
  };
}

export function reportMarkdown(c: Comparison): string {
  const L = [`# 比較結果: ${c.verdict.pass ? '合格' : '不合格'}`, '', ...(c.designChanged ? ['見た目（配色・角丸）を意図的に変えた再現。画素・形・大きさ・見え始めは判定に含めず、位置・角度・不透明度・時刻・イージングで判定した。', ''] : []), `- 参考: ${c.reference}`, `- 生成: ${c.generated}`, `- 形式: ${c.video.reference}`, '',
    '## 画素', `- SSIM 平均 ${c.pixel.ssimMean} / 最小 ${c.pixel.ssimMin}（フレーム${c.pixel.ssimMinFrame}） 基準: 平均≥${c.criteria.ssimMean}、最小≥${c.criteria.ssimMin}`, `- PSNR 平均 ${c.pixel.psnrMean}dB / 最小 ${c.pixel.psnrMin}dB 基準: 平均≥${c.criteria.psnrMean}dB`,
    ...c.pixel.perScene.map(s => `- シーン${s.scene}: SSIM 平均 ${s.ssimMean} / 最小 ${s.ssimMin}`),
    '', '| 差の大きいフレーム | SSIM | PSNR | 差>16の画素 | 範囲 (x0,y0)-(x1,y1) |', '|---|---|---|---|---|',
    ...c.pixel.worstFrames.map(f => `| ${f.n} | ${f.ssim} | ${f.psnr} | ${f.changed} | ${f.bbox ? `(${f.bbox[0]},${f.bbox[1]})-(${f.bbox[2]},${f.bbox[3]})` : '-'} |`),
    '', '## 動き（生成動画を同じ解析器で測定）', '| 参考 | 生成 | 最大誤差 | 動き（開始差/終了差フレーム、イージング） | 判定 |', '|---|---|---|---|---|',
    ...c.motion.elements.map(e => `| ${e.reference} | ${e.generated ?? '-'} | ${Object.entries(e.maxError).map(([k, v]) => `${k}:${v}`).join(' ')} | ${e.animations.map(a => `${a.type}: ${a.startDiff ?? '?'}/${a.endDiff ?? '?'}${a.basis === 'model' ? '（モデル時刻。見え始めの差' + (a.visibleStartDiff ?? '?') + '）' : a.basis === 'unidentifiable' ? '（開始は識別不能のため判定外。見え始めの差' + (a.visibleStartDiff ?? '?') + '）' : ''} ${a.easing ?? '-'}→${a.generatedEasing ?? '-'}`).join('<br>')} | ${e.pass ? '合格' : '不合格'} |`),
    '', '## 不合格の理由', ...(c.verdict.failures.length ? c.verdict.failures.map(f => `- ${f}`) : ['- なし']),
    '', '## 比較画像', ...c.images.map(i => `- ${i}`), c.video_sbs ? `- 比較動画: ${c.video_sbs}` : ''];
  return L.join('\n') + '\n';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2), opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const [ref, gen] = args;
  const ra = opt('--reference-analysis');
  if (!ref || !gen || !ra) throw Error('使い方: node tools/compare.ts <参考.mp4> <生成.mp4> --reference-analysis <analysis.json> --out <出力先> [--match position]');
  const out = resolve(opt('--out') ?? 'out/compare');
  const house = args.includes('--design-changed');
  const c = await compareVideos(resolve(ref), resolve(gen), JSON.parse(readFileSync(ra, 'utf8')), out, {byPosition: house || opt('--match') === 'position', designChanged: house, log: s => console.log(s)});
  writeFileSync(join(out, 'compare.json'), JSON.stringify(c, null, 2) + '\n');
  writeFileSync(join(out, 'compare.md'), reportMarkdown(c));
  console.log(reportMarkdown(c));
}
