// 全工程を一括実行する: 参考動画（指定がなければ自作の合成動画）→ 解析 → JSON保存 → Remotionでレンダリング → 比較（→ 正解照合）。
// 使い方:
//   node tools/lab.ts [--run 名前]                                   自作の合成動画で検証
//   node tools/lab.ts --reference <動画> --rights '<許可の根拠>' [--run 名前]   手元の許可済み素材で検証（取得機能はない）
//   --theme house|both で独自配色の再現も描く（比較は動きだけ）
import {spawnSync} from 'node:child_process';
import {copyFileSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyzeVideo, summarize} from './analyze.ts';
import {compareVideos, reportMarkdown} from './compare.ts';
import {makeReference} from './make-reference.ts';
import {scoreAnalysis, scoreMarkdown} from './score.ts';

const LAB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const run = opt('--run') ?? new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
const out = join(LAB, 'out', run), theme = opt('--theme') ?? 'measured';
const log = (s: string) => console.log(`[lab] ${s}`);
mkdirSync(out, {recursive: true});

// 1. 参考動画
let reference: string, groundTruth: string | null = null, rightsNote: string;
if (opt('--reference')) {
  reference = resolve(opt('--reference')!);
  rightsNote = opt('--rights') ?? '';
  if (!rightsNote.trim()) throw Error('--reference を使うときは --rights で利用許可の根拠を記録してください');
} else {
  log('参考動画（自作の合成動画）を作成');
  const r = await makeReference(join(out, 'reference'));
  reference = r.video; groundTruth = r.groundTruth;
  rightsNote = 'motion-lab/tools/make-reference.ts で数式から作った自作の合成動画（外部素材なし）';
}

// 2〜3. 解析とJSON保存（連続フレームの抽出を含む）
log(`解析: ${relative(LAB, reference)}`);
const analysisDir = join(out, 'analysis');
const analysis = await analyzeVideo(reference, {rightsNote, outDir: analysisDir, log});
writeFileSync(join(analysisDir, 'analysis.json'), JSON.stringify(analysis, null, 2) + '\n');
mkdirSync(join(LAB, 'public'), {recursive: true});
copyFileSync(join(analysisDir, 'analysis.json'), join(LAB, 'public', 'latest-analysis.json'));
console.log(summarize(analysis));

// 4. Remotionでレンダリング（CLI。設定はremotion.config.ts）
const cli = (() => { const req = createRequire(join(LAB, 'package.json')); const pkg = req.resolve('@remotion/cli/package.json'); const bin = JSON.parse(readFileSync(pkg, 'utf8')).bin; return join(dirname(pkg), typeof bin === 'string' ? bin : bin.remotion); })();
const render = (t: 'measured' | 'house') => {
  const dir = join(out, 'render');
  mkdirSync(dir, {recursive: true});
  const props = join(dir, `props-${t}.json`), video = join(dir, t === 'measured' ? 'reproduction.mp4' : 'reproduction-house.mp4');
  writeFileSync(props, JSON.stringify({analysis, theme: t}));
  log(`Remotionでレンダリング（${t}）`);
  const r = spawnSync(process.execPath, [cli, 'render', 'src/index.ts', 'Reproduction', video, `--props=${props}`, '--log=error'], {cwd: LAB, stdio: 'inherit', env: {...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ''}`}});
  if (r.status !== 0) throw Error(`レンダリング失敗（終了コード${r.status}）`);
  return video;
};
const summary: Record<string, unknown> = {run, reference, rightsNote, analysis: join(analysisDir, 'analysis.json')};
const measured = render('measured');

// 5. 比較
log('比較（参考 ↔ 生成）');
const cmp = await compareVideos(reference, measured, analysis, join(out, 'compare'), {log});
writeFileSync(join(out, 'compare', 'compare.json'), JSON.stringify(cmp, null, 2) + '\n');
writeFileSync(join(out, 'compare', 'compare.md'), reportMarkdown(cmp));
summary.compare = {pass: cmp.verdict.pass, ssimMean: cmp.pixel.ssimMean, ssimMin: cmp.pixel.ssimMin, psnrMean: cmp.pixel.psnrMean, failures: cmp.verdict.failures};

if (theme === 'house' || theme === 'both') {
  const house = render('house');
  log('比較（独自配色。位置で対応付け、動きだけ判定）');
  const ch = await compareVideos(reference, house, analysis, join(out, 'compare-house'), {byPosition: true, designChanged: true, log});
  const motionFailures = ch.verdict.failures;
  writeFileSync(join(out, 'compare-house', 'compare.json'), JSON.stringify(ch, null, 2) + '\n');
  writeFileSync(join(out, 'compare-house', 'compare.md'), reportMarkdown(ch));
  summary.house = {motionPass: !motionFailures.length, motionFailures, ssimMean: ch.pixel.ssimMean, note: '配色・角丸を変えた再現。画素・形・大きさ・見え始めは判定せず、位置・角度・不透明度・時刻・イージングで判定'};
}

// 6. 正解照合（自作の合成動画のときだけ）
if (groundTruth) {
  const s = scoreAnalysis(JSON.parse(readFileSync(groundTruth, 'utf8')), analysis);
  writeFileSync(join(out, 'score.json'), JSON.stringify(s, null, 2) + '\n');
  writeFileSync(join(out, 'score.md'), scoreMarkdown(s));
  summary.score = {pass: s.pass, passed: s.passed, total: s.checks.length, failed: s.checks.filter(c => !c.pass)};
}
writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
log(`完了: ${relative(LAB, out)}`);
console.log(JSON.stringify(summary, null, 2));
