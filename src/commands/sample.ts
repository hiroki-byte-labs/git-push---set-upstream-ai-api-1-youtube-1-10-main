// sampleコマンド: 台本→音声→描画→MP4と検査情報を1ジョブとして出力する。
import {mkdirSync, writeFileSync, readFileSync, existsSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {encode, ffmpegVersion} from '../media.ts';
import type {SubtitleMode} from '../media.ts';
import {FixtureScript, CueAudio} from '../providers.ts';
import type {VisualProvider, Plan} from '../providers.ts';
import {totalSeconds} from '../plan.ts';
import {lintPlan, formatLint} from '../lint.ts';
import {loadChannel, sourcesText, stanceText} from '../channel.ts';
import {buildMetadata} from '../metadata.ts';
import {checkThumbnails} from '../thumbnails.ts';
import {checkReadability} from '../readability.ts';
import {checkLayout} from '../layout.ts';
import {buildSegments, buildRenderSpec, buildThumbSpecs} from '../timeline.ts';
import {LocalConnection, callWithBudget} from '../connections.ts';
import type {Usage, Attempt} from '../connections.ts';
import {Budget} from '../budget.ts';

function run(exe: string, args: string[]) {
  const r = spawnSync(exe, args, {encoding: 'utf8', timeout: 240000, maxBuffer: 8 * 1024 * 1024});
  if (r.status !== 0) throw Error(`${exe}: ${r.error?.message ?? r.stderr}`);
  return r.stdout;
}

const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

// AppKitでPNGを描画しFFmpegでH264/AACへ書出す（ADR-007）。kindはjob.jsonに残る接続種別。
// 字幕の既定は焼き込み（burn）。利用者の希望（T007の所感「字幕は焼き込み希望」）による（T106、ADR-019）。
// 以前の既定soft（T078、E12: 全文字幕はナレーションと重複する）は --subtitles soft|both で引き続き選べる。
export const DEFAULT_SUBTITLES: SubtitleMode = 'burn';

export class NativeVisual implements VisualProvider {
  kind = 'local.appkit-ffmpeg';
  subtitles: SubtitleMode;
  scale: number;
  constructor(subtitles: SubtitleMode = DEFAULT_SUBTITLES, resolution: 720 | 1080 = 720) {
    this.subtitles = subtitles;
    this.scale = resolution / 720;
  }
  async render(plan: Plan, dir: string) {
    mkdirSync('work/swift-cache', {recursive: true});
    const source = readFileSync('scripts/render.swift', 'utf8');
    const stale = !existsSync('work/render') || !existsSync('work/render-source') || readFileSync('work/render-source', 'utf8') !== source;
    if (stale) {
      run('/usr/bin/swiftc', ['-module-cache-path', 'work/swift-cache', 'scripts/render.swift', '-o', 'work/render']);
      writeFileSync('work/render-source', source);
    }
    // 区間（図解の段階表示×字幕cue）を計算し、Swiftに描画仕様として渡す（T043）。
    const segments = buildSegments(plan);
    writeFileSync(join(dir, 'segments.json'), JSON.stringify(segments, null, 2));
    writeFileSync(join(dir, 'render-spec.json'), JSON.stringify({...buildRenderSpec(plan, segments, this.subtitles === 'soft' ? 'none' : 'burn'), thumbnails: buildThumbSpecs(plan), scale: this.scale}, null, 2));
    console.log(run(resolve('work/render'), [dir]));
    encode(plan, dir, {segments, subtitles: this.subtitles});
  }
}

// job: 制作案件から作るときの記録（T104）。省略時（cli.ts sample）は常にデモ。
export type JobLink = {mode: 'production' | 'demo'; project?: string; scriptHash?: string; scriptVersion?: number};
export type SampleOptions = {plan?: string; subtitles?: SubtitleMode; budgetUsd?: number; resolution?: 720 | 1080; job?: JobLink};

export function parseSampleArgs(args: string[]): SampleOptions {
  const opts: SampleOptions = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--plan' && args[i + 1]) opts.plan = args[++i];
    else if (args[i] === '--subtitles' && ['burn', 'soft', 'both'].includes(args[i + 1])) opts.subtitles = args[++i] as SubtitleMode;
    else if (args[i] === '--resolution' && ['720', '1080'].includes(args[i + 1])) opts.resolution = Number(args[++i]) as 720 | 1080;
    else if (args[i] === '--budget-usd' && /^\d+(\.\d+)?$/.test(args[i + 1] ?? '')) opts.budgetUsd = Number(args[++i]);
    else throw Error(`不明な引数: ${args[i]}（sample [--plan 台本.json] [--subtitles burn|soft|both] [--budget-usd 上限] [--resolution 720|1080]）`);
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
  if (process.platform !== 'darwin') throw Error('M1 rendererはmacOS専用です');
  const script = new FixtureScript(opts.plan), audio = new CueAudio(), visual = new NativeVisual(opts.subtitles, opts.resolution);
  // 接続抽象と費用上限（T024）。M1の接続はすべて模擬・手元処理で費用0だが、実APIと同じ経路（見積り→予約→再試行→精算）を通す。
  const budget = new Budget(opts.budgetUsd ?? 0);
  const usage: Usage[] = [];
  // 全試行の記録（T098）。失敗や費用不明の試行も残す。
  const attempts: Attempt[] = [];
  const scriptConn = new LocalConnection('script', script.kind, 'mock', async (_: void) => ({output: await script.create()}));
  const plan = await callWithBudget(scriptConn, undefined, budget, 0, usage, 3, attempts);
  const audioConn = new LocalConnection('audio', audio.kind, 'mock', async (path: string) => {
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
    versions: {planSchema: plan.schema, plan: plan.version, rendererSource: sha256(readFileSync('scripts/render.swift')), ffmpeg: ffmpegVersion(), node: process.version},
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
    // 概要欄用の出典と立場（T072）。T074でdescriptionへまとめる。
    const channel = loadChannel();
    writeFileSync(join(dir, 'sources.txt'), sourcesText(plan) + '\n');
    writeFileSync(join(dir, 'stance.txt'), stanceText(channel) + '\n');
    job.channelDecided = channel.decided;
    // タイトル・概要欄・チャプター（T074）。問題があれば記録し、公開前の確認で直す（制作は止めない）。
    const metadata = buildMetadata(plan, {sources: sourcesText(plan), stance: stanceText(channel)});
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(metadata, null, 2));
    job.metadata = {ok: metadata.ok, issues: metadata.issues, chapters: metadata.chapters.length};
    if (!channel.decided) job.events.push('channel-undecided');
    await callWithBudget(audioConn, join(dir, 'audio.wav'), budget, 0, usage, 3, attempts);
    job.events.push('audio-ready');
    save();
    // ソフト字幕は書出し時に多重化するため、描画より前に書く（T044）。
    writeFileSync(join(dir, 'subtitles.vtt'), buildVtt(plan));
    await callWithBudget(visualConn, dir, budget, 0, usage, 3, attempts);
    // サムネイル案の検査（T073）。不合格でも動画は残し、公開前の確認で直す。
    const thumbs = checkThumbnails(dir);
    job.thumbnails = thumbs.map(t => ({file: t.file, ok: t.ok, issues: t.issues}));
    // 見やすさ（T091）。不合格でも制作は止めず、公開前の確認で直す。
    job.readability = checkReadability(dir, visual.scale);
    // 文字配置（T106）。枠からのはみ出し・中央からのずれ・区画の重なり。不合格でも制作は止めず、確認で直す。
    job.layout = checkLayout(dir);
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
