// Chromium subprocessだけをローカルFFmpegの色面映像に置換する試験。
// Remotionの描画・視覚品質の成功証拠ではない。mux/inspector/sampleの経路は実コードを実行。
import {mock} from 'node:test';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as child from 'node:child_process';
import {readFileSync, writeFileSync, readdirSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
assert.equal(process.cwd(), dirname(fileURLToPath(import.meta.url)), 'Run with the isolated harness directory as cwd');
assert.ok(process.cwd().startsWith('/private/tmp/T156-render-'), 'An isolated T156 root is required');
let scenario = 'valid';
const ffmpeg = process.env.T156_FFMPEG;
mock.module('node:child_process', {namedExports: {...child, spawnSync(exe, args, options) {
  if (args[1] === 'render' && args[3] === 'PlanVideo') {
    return child.spawnSync(ffmpeg, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=1280x720:r=24:d=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', args[4]], {encoding:'utf8'});
  }
  if (args.includes('-show_streams') && scenario === 'inspector-failure') {
    return {status:1, signal:null, stderr:'Injected inspector failure', stdout:''};
  }
  if (args.at(-1)?.endsWith('/sample.mp4') && args.includes('-movflags')) {
    const altered = [...args];
    if (scenario === 'no-audio') {
      const at = altered.indexOf('1:a'); altered.splice(at - 1, 2); altered.splice(altered.length - 1, 0, '-an');
    }
    if (scenario === 'duration') altered.splice(altered.length - 1, 0, '-t', '29');
    const r = child.spawnSync(exe, altered, options);
    if (scenario === 'truncated' && r.status === 0) {
      const b = readFileSync(args.at(-1)); writeFileSync(args.at(-1), b.subarray(0, Math.floor(b.length * 0.7)));
    }
    return r;
  }
  return child.spawnSync(exe, args, options);
}}});
const {sample} = await import(join(process.cwd(), 'src/commands/sample.ts'));
const summary = [];
for (scenario of ['valid','truncated','duration','no-audio','inspector-failure']) {
  const before = new Set(readdirSync('outputs'));
  const latestBefore = existsSync('outputs/latest.json') ? readFileSync('outputs/latest.json','utf8') : null;
  let error = null;
  try { await sample({plan:'fixtures/sample-surname-illustration.json', renderer:'remotion',subtitles:'both'}); }
  catch (e) { error = String(e); }
  const id = readdirSync('outputs').find(n => !before.has(n) && n !== 'latest.json');
  const dir = join('outputs',id);
  const job = JSON.parse(readFileSync(join(dir,'job.json'),'utf8'));
  const media = JSON.parse(readFileSync(join(dir,'media-check.json'),'utf8'));
  assert.equal(job.status,scenario === 'valid' ? 'completed' : 'failed');
  assert.equal(job.events.includes('video-checked'),scenario === 'valid');
  assert.equal(media.status,scenario === 'valid' ? 'passed' : 'failed');
  if (scenario !== 'valid') assert.equal(readFileSync('outputs/latest.json','utf8'),latestBefore);
  summary.push({scenario,id,jobStatus:job.status,events:job.events,error,media});
}
writeFileSync('job-integration-summary.json',JSON.stringify(summary,null,2));
console.log('PASS: 5 sample job scenarios; renderer subprocess substituted, actual mux/decode/inspection');
