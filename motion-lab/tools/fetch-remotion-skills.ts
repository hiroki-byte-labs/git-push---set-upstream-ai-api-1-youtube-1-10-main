// Remotion公式Agent Skills（github.com/remotion-dev/skills）を固定コミットで .agents/skills/ へ取り込む。
// 使い方: node motion-lab/tools/fetch-remotion-skills.ts [--check]（どのディレクトリから実行してもよい）
// --check は取得済みファイルのSHA-256を記録と照合するだけでネットワークを使わない。
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO = 'remotion-dev/skills';
const COMMIT = '32b241b97f4e0e4ab61fe9a41b05e6e64503f8c5'; // 2026-10-07、SKILL.mdのversion 4.0.534
const SKILL = 'remotion-best-practices'; // 他のSkillをすべて内包するルーター（README）
// 地図（Mapbox/Cesium等）は本検証で使わず、見本データが大きいため除外する。
const EXCLUDE = [/\/remotion-maps\//];
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEST = join(ROOT, '.agents', 'skills', SKILL);
const LOCK = join(ROOT, 'motion-lab', 'remotion-skills.lock.json');

type Lock = {repo: string; commit: string; skill: string; excluded: string[]; fetchedAt: string; files: Record<string, string>};
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

if (process.argv.includes('--check')) {
  const lock: Lock = JSON.parse(readFileSync(LOCK, 'utf8'));
  const bad = Object.entries(lock.files).filter(([p, h]) => !existsSync(join(DEST, p)) || sha256(readFileSync(join(DEST, p))) !== h);
  if (bad.length) { console.error('不一致:', bad.map(([p]) => p).join(', ')); process.exit(1); }
  console.log(`OK: ${Object.keys(lock.files).length} files @ ${lock.commit}`);
  process.exit(0);
}

const tree = await (await fetch(`https://api.github.com/repos/${REPO}/git/trees/${COMMIT}?recursive=1`)).json() as {tree: {path: string; type: string}[]};
const prefix = `skills/${SKILL}/`;
const paths = tree.tree.filter(t => t.type === 'blob' && t.path.startsWith(prefix)).map(t => t.path.slice(prefix.length)).filter(p => !EXCLUDE.some(r => r.test('/' + p)));
if (!paths.includes('SKILL.md')) throw Error('SKILL.mdが見つからない');
rmSync(DEST, {recursive: true, force: true});
const files: Record<string, string> = {};
for (const p of paths) {
  const res = await fetch(`https://raw.githubusercontent.com/${REPO}/${COMMIT}/${prefix}${p}`);
  if (!res.ok) throw Error(`取得失敗 ${p}: ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  mkdirSync(dirname(join(DEST, p)), {recursive: true});
  writeFileSync(join(DEST, p), body);
  files[p] = sha256(body);
}
const lock: Lock = {repo: REPO, commit: COMMIT, skill: SKILL, excluded: EXCLUDE.map(String), fetchedAt: new Date().toISOString(), files};
writeFileSync(LOCK, JSON.stringify(lock, null, 2) + '\n');
console.log(`${paths.length} files -> ${DEST.slice(ROOT.length + 1)}`);
