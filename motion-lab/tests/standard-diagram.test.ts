import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync, existsSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {loadPlan} from '../../src/plan.ts';
import {toRemotionPlanProps} from '../src/remotion-plan.ts';

// 本番のdispatchを含むJSXを変換し、実際のReactマークアップを検査する。
const require = createRequire(import.meta.url);
const ts = require('typescript');
const {renderToStaticMarkup} = require('react-dom/server');
function loadTsx(path: string): any {
  path = [path, path + '.tsx', path + '.ts', path + '/index.ts'].find(p => existsSync(p))!;
  const source = readFileSync(path, 'utf8');
  const compiled = ts.transpileModule(source, {compilerOptions: {jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true}});
  const module = {exports: {} as any};
  const localRequire = (name: string) => name.startsWith('.') ? loadTsx(resolve(dirname(path), name)) : require(name);
  new Function('require', 'module', 'exports', compiled.outputText)(localRequire, module, module.exports);
  return module.exports;
}
const {renderDiagram} = loadTsx(new URL('../src/PlanVideo.tsx', import.meta.url).pathname);
const plan = loadPlan(JSON.parse(readFileSync(new URL('../../fixtures/sample-standard-diagrams.json', import.meta.url), 'utf8')));
const props = toRemotionPlanProps(plan);
const markup = (diagram: unknown, frame = 120) => renderToStaticMarkup(renderDiagram({...props.scenes[0], diagram}, frame, props.fps));

test('compare: 左右の所属・ラベル・全項目を保持する', () => {
  const d = props.scenes[0].diagram;
  assert.equal(d.type, 'compare');
  if (d.type !== 'compare') throw Error();
  const html = markup(d);
  const sides = html.split('data-side="right"');
  for (const text of [d.left, ...d.leftItems]) assert.ok(sides[0].includes(text));
  for (const text of [d.right, ...d.rightItems]) assert.ok(sides[1].includes(text));
  assert.equal((html.match(/<li>/g) ?? []).length, 6);
});

test('number: value/label/noteを描画し、任意noteの省略も扱う', () => {
  for (const scene of props.scenes.slice(1, 3)) {
    const d = scene.diagram;
    if (d.type !== 'number') throw Error();
    const html = markup(d);
    assert.ok(html.includes(d.value));
    assert.ok(html.includes(d.label));
    assert.equal(html.includes('data-field="note"'), d.note !== undefined);
    if (d.note) assert.ok(html.includes(d.note));
  }
});

test('meter: 負は基準左・0は幅0・正は右、totalは算術平均で描く', () => {
  for (const [index, expected] of ['negative', 'zero', 'positive'].entries()) {
    const d = props.scenes[index + 3].diagram;
    if (d.type !== 'meter') throw Error();
    const html = markup(d);
    assert.ok(html.includes(d.total));
    const rows = html.split('data-row=').slice(1);
    assert.equal(rows.length, 4);
    for (const [i, direction] of ['negative', 'zero', 'positive', expected].entries()) {
      assert.ok(rows[i].includes(`data-direction="${direction}"`));
      assert.ok(rows[i].includes(i === 3 ? d.total : d.bars[i].label));
    }
    const fills = [...html.matchAll(/data-meter-fill="true" style="[^"]*left:([\d.]+)%;width:([\d.]+)%/g)].map(m => [Number(m[1]), Number(m[2])]);
    const values = [...d.bars.map(b => b.value), d.bars.reduce((sum, b) => sum + b.value, 0) / d.bars.length];
    assert.equal(fills.length, values.length);
    values.forEach((v, i) => {
      assert.ok(Math.abs(fills[i][0] - (v < 0 ? 50 + v * 50 : 50)) < 1e-9);
      assert.ok(Math.abs(fills[i][1] - Math.abs(v) * 50) < 1e-9);
    });
    assert.ok(html.includes('下がった') && html.includes('変わらない') && html.includes('上がった'));
  }
});

test('meter: 登場前は全棒幅0、進行中も負方向を保つ', () => {
  const d = props.scenes[3].diagram;
  const before = markup(d, -1);
  assert.equal((before.match(/data-meter-fill="true" style="[^"]*width:0%/g) ?? []).length, 4);
  const during = markup(d, 5);
  const first = /data-meter-fill="true" style="[^"]*left:([\d.]+)%;width:([\d.]+)%/.exec(during)!;
  assert.ok(Number(first[1]) < 50 && Number(first[2]) > 0 && Number(first[2]) < 50);
});

test('supported diagramは人型fallbackに置換しない', () => {
  for (const d of [{type: 'flow', items: ['出来事', '判断']}, {type: 'branch', question: '記録した？', yes: '確認する', no: '記録する'}]) {
    const html = markup(d);
    assert.ok(html.includes(d.type === 'flow' ? '出来事' : '記録した？'));
    assert.ok(!html.includes('<svg'));
  }
});
