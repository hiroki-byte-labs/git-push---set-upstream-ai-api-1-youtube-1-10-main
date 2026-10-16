import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync, existsSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {loadPlan} from '../../src/plan.ts';
import {sourceRecords} from '../../src/metadata.ts';
import {sourcesText} from '../../src/channel.ts';
import {toRemotionPlanProps} from '../src/remotion-plan.ts';

// 本番のdispatchを含むJSXを変換し、実際のReactマークアップを検査する。
const require = createRequire(import.meta.url);
const ts = require('typescript');
const {renderToStaticMarkup} = require('react-dom/server');
let videoWidth = 1920;
function loadTsx(path: string): any {
  path = [path, path + '.tsx', path + '.ts', path + '/index.ts'].find(p => existsSync(p))!;
  const source = readFileSync(path, 'utf8');
  const compiled = ts.transpileModule(source, {compilerOptions: {jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true}});
  const module = {exports: {} as any};
  const localRequire = (name: string): any => name === 'remotion'
    ? {...require(name), useCurrentFrame: () => 84, useVideoConfig: () => ({width: videoWidth, height: videoWidth * 9 / 16, fps: 24})}
    : name.startsWith('.') ? loadTsx(resolve(dirname(path), name)) : require(name);
  new Function('require', 'module', 'exports', compiled.outputText)(localRequire, module, module.exports);
  return module.exports;
}
const {SceneInformation, SceneTemplate} = loadTsx(new URL('../src/PlanVideo.tsx', import.meta.url).pathname);
const plan = loadPlan(JSON.parse(readFileSync(new URL('../../fixtures/sample-source-labels.json', import.meta.url), 'utf8')));
const props = toRemotionPlanProps(plan);
const markup = (index: number, production = props.production) => renderToStaticMarkup(SceneInformation({scene: props.scenes[index], production})).replace(/<[^>]*>/g, '');

test('source catalogと各場面はmetadata/sources.txtと同じID・初出番号で対応する', () => {
  assert.deepEqual(props.sources.map(s => [s.id, s.number, s.title]), sourceRecords(plan).map(s => [s.id, s.number, s.title]));
  assert.deepEqual(props.sources.map(s => s.id), ['short', 'long', 'unused']);
  assert.deepEqual(props.scenes[1].sources, ['long', 'short']);
  assert.deepEqual(props.scenes[1].sourceReferences.map(s => [s.id, s.number]), [['long', 2], ['short', 1]]);
  for (const s of props.sources) assert.ok(sourcesText(plan).includes(`${s.number}. ${s.title}`));
  assert.deepEqual(props.production, plan.production);
  assert.equal(props.scenes[3].fictional, true);
  assert.equal(props.scenes[4].role, 'reflection');
});

test('出典だけ・複数/長い題名・出典なしを混同せず番号を描く', () => {
  assert.match(markup(0), /出典: 概要欄 \[1\]/);
  assert.match(markup(1), /出典: 概要欄 \[2\]\[1\]/);
  assert.ok(!markup(1).includes(plan.sources[1].title));
  assert.ok(!markup(0).includes('架空の例') && !markup(0).includes('考察'));
  assert.equal(markup(2), '');
});

test('fictionalとreflectionとmodeは独立、欠落contextも本人と呼ばない', () => {
  assert.ok(markup(3).includes('架空の例') && !markup(3).includes('考察'));
  for (const production of [{mode: 'demo'}, undefined]) {
    const html = renderToStaticMarkup(SceneInformation({scene: props.scenes[4], production}));
    assert.ok(html.includes('デモ: 仮の考察（本人ではない）'));
    assert.ok(!html.includes('本人の考察') && !html.includes('架空の例'));
  }
  const html = markup(4, {mode: 'production'});
  assert.ok(html.includes('本人の考察') && !html.includes('デモ'));
  assert.ok(!markup(0, {mode: 'production'}).includes('本人の考察'));
  for (const text of ['架空の例', 'デモ: 仮の考察（本人ではない）', '出典: 概要欄 [2]']) assert.ok(markup(5).includes(text));
});

test('ジョブcontextはPlanのproductionを上書きでき、sampleを本人と誤認させない', () => {
  const productionPlan = {...plan, production: {mode: 'production' as const, project: 'test'}};
  assert.equal(toRemotionPlanProps(productionPlan).production?.mode, 'production');
  assert.equal(toRemotionPlanProps(productionPlan, 24, 1280, 720, {mode: 'demo'}).production?.mode, 'demo');
});

test('本番SceneTemplateは720p/1080pとも札・出典・字幕・図解を描画し座標を縮尺する', () => {
  for (const width of [1280, 1920]) {
    videoWidth = width;
    const html = renderToStaticMarkup(SceneTemplate({scene: props.scenes[5], fps: 24, production: props.production}));
    assert.ok(html.includes(`scale(${width / 1920})`));
    for (const text of ['data-scene-badges', 'data-scene-sources', 'data-source-id="long"', 'デモ: 仮の考察（本人ではない）', '表示検証です。結果を保証しません。', '記録', '解釈']) assert.ok(html.includes(text));
    assert.ok(!html.includes('本人の考察'));
    const production = renderToStaticMarkup(SceneTemplate({scene: props.scenes[4], fps: 24, production: {mode: 'production'}}));
    assert.ok(production.includes('本人の考察') && !production.includes('デモ'));
  }
});
