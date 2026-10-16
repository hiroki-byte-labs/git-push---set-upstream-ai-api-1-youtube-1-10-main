// sampleコマンド: 台本→音声→描画→MP4と検査情報を1ジョブとして出力する。
import {mkdirSync, writeFileSync, readFileSync, existsSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {encode, ffmpegVersion} from '../media.ts';
import type {SubtitleMode} from '../media.ts';
import {FixtureScript, CueAudio} from '../providers.ts';
import {LocalSayAudio} from '../local-say-audio.ts';
import type {VisualProvider, Plan} from '../providers.ts';
import {totalSeconds} from '../plan.ts';
import {lintPlan, formatLint} from '../lint.ts';
import {loadChannel, sourcesText, stanceText} from '../channel.ts';
import {buildMetadata, YT} from '../metadata.ts';
import {checkThumbnailQuality} from '../thumbnails.ts';
import {buildThumbnailCandidates} from '../thumbnail-candidates.ts';
import {renderThumbnails} from '../thumbnail-renderer.ts';
import {checkReadability} from '../readability.ts';
import {checkLayout} from '../layout.ts';
import {buildSegments, buildRenderSpec, buildThumbSpecs} from '../timeline.ts';
import {LocalConnection, callWithBudget} from '../connections.ts';
import type {Usage, Attempt} from '../connections.ts';
import {Budget} from '../budget.ts';
import {buildChecklist, writeChecklist} from '../checklist.ts';

function run(exe: string, args: string[]) {
  const r = spawnSync(exe, args, {encoding: 'utf8', timeout: 240000, maxBuffer: 8 * 1024 * 1024});
  if (r.status !== 0) throw Error(`${exe}: ${r.error?.message ?? r.stderr}`);
  return r.stdout;
}

const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

function nativeRenderer() {
  mkdirSync('work/swift-cache', {recursive: true});
  const source = readFileSync('scripts/render.swift', 'utf8');
  if (!existsSync('work/render') || !existsSync('work/render-source') || readFileSync('work/render-source', 'utf8') !== source) {
    run('/usr/bin/swiftc', ['-module-cache-path', 'work/swift-cache', 'scripts/render.swift', '-o', 'work/render']);
    writeFileSync('work/render-source', source);
  }
  return resolve('work/render');
}

// AppKitでPNGを描画しFFmpegでH264/AACへ書出す（ADR-007）。kindはjob.jsonに残る接続種別。
// 字幕の既定は焼き込み（burn）。利用者の希望（T007の所感「字幕は焼き込み希望」）による（T106、ADR-019）。
// 以前の既定soft（T078、E12: 全文字幕はナレーションと重複する）は --subtitles soft|both で引き続き選べる。
export const DEFAULT_SUBTITLES: SubtitleMode = 'burn';

export class NativeVisual implements VisualProvider {
  kind = 'local.appkit-ffmpeg';
  subtitles: SubtitleMode;
  scale: number;
  narration: boolean;
  constructor(subtitles: SubtitleMode = DEFAULT_SUBTITLES, resolution: 720 | 1080 = 720, narration = false) {
    this.subtitles = subtitles;
    this.scale = resolution / 720;
    this.narration = narration;
  }
  async render(plan: Plan, dir: string) {
    const renderer = nativeRenderer();
    // 区間（図解の段階表示×字幕cue）を計算し、Swiftに描画仕様として渡す（T043）。
    const segments = buildSegments(plan);
    writeFileSync(join(dir, 'segments.json'), JSON.stringify(segments, null, 2));
    writeFileSync(join(dir, 'render-spec.json'), JSON.stringify({...buildRenderSpec(plan, segments, this.subtitles === 'soft' ? 'none' : 'burn'), thumbnails: buildThumbSpecs(plan), scale: this.scale}, null, 2));
    console.log(run(renderer, [dir]));
    encode(plan, dir, {segments, subtitles: this.subtitles, narration: this.narration});
  }
}

// job: 制作案件から作るときの記録（T104）。省略時（cli.ts sample）は常にデモ。
export type JobLink = {mode: 'production' | 'demo'; project?: string; scriptHash?: string; scriptVersion?: number};
export type AudioMode = 'mock' | 'say';
export type VisualRendererType = 'native' | 'remotion';
export type SampleOptions = {
  plan?: string;
  subtitles?: SubtitleMode;
  budgetUsd?: number;
  resolution?: 720 | 1080;
  renderer?: VisualRendererType;
  audio?: AudioMode;
  job?: JobLink;
  queue?: boolean;
  queueDir?: string;
  concurrency?: number;
  maxAttempts?: number;
};

export function parseSampleArgs(args: string[]): SampleOptions {
  const opts: SampleOptions = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--plan' && args[i + 1]) opts.plan = args[++i];
    else if (args[i] === '--subtitles' && ['burn', 'soft', 'both'].includes(args[i + 1])) opts.subtitles = args[++i] as SubtitleMode;
    else if (args[i] === '--resolution' && ['720', '1080'].includes(args[i + 1])) opts.resolution = Number(args[++i]) as 720 | 1080;
    else if (args[i] === '--budget-usd' && /^\d+(\.\d+)?$/.test(args[i + 1] ?? '')) opts.budgetUsd = Number(args[++i]);
    else if (args[i] === '--renderer' && ['native', 'remotion'].includes(args[i + 1])) opts.renderer = args[++i] as VisualRendererType;
    else if (args[i] === '--audio' && ['mock', 'say'].includes(args[i + 1])) opts.audio = args[++i] as AudioMode;
    else if (args[i] === '--queue') opts.queue = true;
    else if (args[i] === '--queue-dir' && args[i + 1]) opts.queueDir = args[++i];
    else if (args[i] === '--concurrency' && /^\d+$/.test(args[i + 1] ?? '')) opts.concurrency = Number(args[++i]);
    else throw Error(`不明な引数: ${args[i]}（sample [--plan 台本.json] [--subtitles burn|soft|both] [--budget-usd 上限] [--resolution 720|1080] [--renderer native|remotion] [--audio mock|say] [--queue] [--queue-dir ディレクトリ] [--concurrency 並行数]）`);
  }
  return opts;
}

// WebVTTの時刻（ミリ秒まで）。
export function vttStamp(t: number) {
  const ms = Math.round(t * 1000);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)}.${p(ms % 1000, 3)}`;
}

// 字幕cueごとのWebVTT本文。
export function buildVtt(plan: Plan) {
  let time = 0;
  const blocks: string[] = [];
  for (const s of plan.scenes) for (const c of s.cues) {
    const start = time;
    time += c.seconds;
    blocks.push(`${vttStamp(start)} --> ${vttStamp(time)}\n${c.text}\n`);
  }
  return 'WEBVTT\n\n' + blocks.join('\n');
}

export async function sample(opts: SampleOptions = {}) {
  if (opts.queue) {
    const {runSampleWithQueue} = await import('../queue-adapter.ts');
    return runSampleWithQueue(opts);
  }
  const isRemotion = opts.renderer === 'remotion';
  if (!isRemotion && process.platform !== 'darwin') throw Error('M1 rendererはmacOS専用です');
  const script = new FixtureScript(opts.plan);
  const audio = opts.audio === 'say' ? new LocalSayAudio() : new CueAudio();
  const visual: VisualProvider & {scale?: number} = isRemotion
    ? new (await import('../remotion-visual.ts')).RemotionVisual(opts.subtitles, opts.resolution, 24, opts.job ?? {mode: 'demo'})
    : new NativeVisual(opts.subtitles, opts.resolution, opts.audio === 'say');
  // 接続抽象と費用上限（T024）。M1の接続はすべて模擬・手元処理で費用0だが、実APIと同じ経路（見積り→予約→再試行→精算）を通す。
  const budget = new Budget(opts.budgetUsd ?? 0);
  const usage: Usage[] = [];
  // 全試行の記録（T098）。失敗や費用不明の試行も残す。
  const attempts: Attempt[] = [];
  const scriptConn = new LocalConnection('script', script.kind, 'mock', async (_: void) => ({output: await script.create()}));
  const plan = await callWithBudget(scriptConn, undefined, budget, 0, usage, 3, attempts);
  const audioConn = new LocalConnection('audio', audio.kind, opts.audio === 'say' ? 'local' : 'mock', async (path: string) => {
    await audio.create(plan, path);
    return {output: path, outputUnits: totalSeconds(plan)};
  });
  const visualConn = new LocalConnection('visual', visual.kind, 'local', async (d: string) => {
    await visual.render(plan, d);
    return {output: d, outputUnits: totalSeconds(plan)};
  });
  const id = `${plan.id}-${randomUUID().slice(0, 8)}`;
  const dir = resolve('outputs', id);
  mkdirSync(dir, {recursive: true});
  const link: JobLink = opts.job ?? {mode: 'demo'};
  const job: any = {
    id, kind: 'production-job', status: 'running', createdAt: new Date().toISOString(), pid: process.pid,
    // デモ（sample）は本人の題材選定・考察・台本承認を経ていない。本番の動画は制作案件（produce render）からだけ作る（T104）。
    mode: link.mode, ...(link.project ? {project: link.project, scriptHash: link.scriptHash, scriptVersion: link.scriptVersion} : {}),
    providers: [script.kind, audio.kind, visual.kind, 'publisher.disabled'],
    cost: {currency: 'USD', limit: budget.limit, committed: 0, reserved: 0, unknown: 0, basis: 'mock/local only（実API未接続）'},
    usage,
    attempts,
    inputHash: sha256(JSON.stringify(plan)),
    input: opts.plan ?? 'fixtures/sample.json', durationSeconds: totalSeconds(plan), subtitles: opts.subtitles ?? DEFAULT_SUBTITLES, resolution: opts.resolution ?? 720,
    versions: {
      planSchema: plan.schema,
      plan: plan.version,
      rendererSource: isRemotion ? sha256(readFileSync('motion-lab/src/PlanVideo.tsx')) : sha256(readFileSync('scripts/render.swift')),
      rendererKind: visual.kind,
      ffmpeg: ffmpegVersion(),
      node: process.version,
    },
    events: [],
  };
  const save = () => {
    job.cost.committed = budget.committed;
    job.cost.reserved = budget.reserved;
    job.cost.unknown = budget.unknown;
    writeFileSync(join(dir, 'job.json'), JSON.stringify(job, null, 2));
  };
  save();
  try {
    writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan, null, 2));
    // 安全検査（T042）。errorがあれば音声・描画の前に止める。
    const lint = lintPlan(plan);
    writeFileSync(join(dir, 'lint.json'), JSON.stringify(lint, null, 2));
    job.lint = {ok: lint.ok, errors: lint.errors, warnings: lint.warnings};
    job.events.push('lint-checked');
    save();
    if (!lint.ok) throw Error('安全検査に失敗:\n' + formatLint(lint));
    const checklist = buildChecklist(plan);
    writeChecklist(dir, checklist);
    // 両映像経路とも画像は既存のAppKit描画器で生成。未対応OSは安全に停止する。
    console.log(run(nativeRenderer(), [dir, '--checklist']));
    const checklistReport = JSON.parse(readFileSync(join(dir, 'checklist-report.json'), 'utf8'));
    job.checklist = {items: checklist.items.length, files: ['checklist.json', 'checklist.txt', ...checklist.pages.map(p => p.file)], ok: checklistReport.every((r: any) => r.fitted)};
    // 概要欄用の出典と立場（T072）。T074でdescriptionへまとめる。
    const channel = loadChannel();
    writeFileSync(join(dir, 'sources.txt'), sourcesText(plan) + '\n');
    writeFileSync(join(dir, 'stance.txt'), stanceText(channel) + '\n');
    job.channelDecided = channel.decided;
    // タイトル・概要欄・チャプター（T074）。問題があれば記録し、公開前の確認で直す（制作は止めない）。
    const metadata = buildMetadata(plan, {sources: sourcesText(plan), stance: stanceText(channel)});
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(metadata, null, 2));
    job.metadata = {ok: metadata.ok, issues: metadata.issues, chapters: metadata.chapters.length};
    if (checklist.items.length && Buffer.byteLength(metadata.description, 'utf8') > YT.descriptionBytes) throw Error('チェックリストを含む概要欄が5000バイトを超えています。項目か概要欄を短くしてください（自動切り捨てなし）');
    if (!channel.decided) job.events.push('channel-undecided');
    await callWithBudget(audioConn, join(dir, 'audio.wav'), budget, 0, usage, 3, attempts);
    job.events.push('audio-ready');
    save();
    // ソフト字幕は書出し時に多重化するため、描画より前に書く（T044）。
    writeFileSync(join(dir, 'subtitles.vtt'), buildVtt(plan));
    await callWithBudget(visualConn, dir, budget, 0, usage, 3, attempts);
    // 専用サムネイル描画（T163/T164: 動画rendererに関わらず共通の専用PNG経路で描画）
    const thumbnailBrief = buildThumbnailCandidates(plan);
    writeFileSync(join(dir, 'thumbnail-brief.json'), JSON.stringify(thumbnailBrief, null, 2));
    job.thumbnailBrief = {
      schema: thumbnailBrief.schema,
      inputHash: thumbnailBrief.inputHash,
      overallStatus: thumbnailBrief.overallStatus,
      candidates: thumbnailBrief.candidates.map(c => ({
        variant: c.id,
        composition: c.composition,
        headline: c.headline,
        sub: c.sub,
        motifs: c.motifs,
        status: c.status,
      })),
      selectedCandidate: 'a',
    };
    renderThumbnails({brief: thumbnailBrief, outputDir: dir});

    // サムネイル案の検査（T073/T165）。実画像・全テキスト・欠測・NaNを検査し、不合格なら安全停止。
    const quality = checkThumbnailQuality(dir, thumbnailBrief, {selectedThumbnail: 'thumbnail-a.png'});
    job.thumbnails = quality.candidates.map(c => ({file: c.file, ok: c.status === 'pass', issues: c.issues}));
    job.thumbnailQuality = {
      ok: quality.ok,
      canProceed: quality.canProceed,
      allPassed: quality.allPassed,
      selectedVariant: quality.selectedVariant,
      reasons: quality.reasons,
    };
    if (!quality.canProceed) {
      throw Error('サムネイル品質検査に不合格（安全停止）:\n' + quality.reasons.join('\n'));
    }
    // 見やすさ（T091/T158）。不合格なら公開候補（latest）にせず安全停止。
    job.readability = checkReadability(dir, visual.scale ?? 1);
    if (!job.readability.ok) {
      throw Error('可読性検査に不合格（安全停止）:\n' + job.readability.issues.join('\n'));
    }
    // 文字配置（T106/T158）。枠からのはみ出し・中央からのずれ・区画の重なり。不合格なら公開候補にせず安全停止。
    job.layout = checkLayout(dir);
    if (!job.layout.ok) {
      throw Error('文字配置検査に不合格（安全停止）:\n' + job.layout.issues.join('\n'));
    }
    job.status = 'completed';
    job.outputHash = sha256(readFileSync(join(dir, 'sample.mp4')));
    job.events.push('video-checked');
    save();
    writeFileSync('outputs/latest.json', JSON.stringify({id}));
    console.log(`生成完了: ${dir}/sample.mp4`);
    if (link.mode === 'demo') console.log('（デモ: 本人の題材選定・考察・台本承認を経ていない。本番の制作は produce を使う）');
    return {id, dir};
  } catch (e) {
    job.status = 'failed';
    job.error = String(e);
    save();
    throw e;
  }
}
