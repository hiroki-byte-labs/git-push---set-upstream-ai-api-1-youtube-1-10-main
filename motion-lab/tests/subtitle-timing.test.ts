import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync, existsSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {loadPlan} from '../../src/plan.ts';
import {buildVtt} from '../../src/commands/sample.ts';
import {toRemotionPlanProps} from '../src/remotion-plan.ts';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const {renderToStaticMarkup} = require('react-dom/server');
let frame = 0;
let fps = 24;
function loadTsx(path: string): any {
  path = [path, path + '.tsx', path + '.ts', path + '/index.ts'].find(p => existsSync(p))!;
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), {compilerOptions: {jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true}});
  const module = {exports: {} as any};
  const localRequire = (name: string): any => name === 'remotion'
    ? {...require(name), useCurrentFrame: () => frame, useVideoConfig: () => ({width: 1280, height: 720, fps})}
    : name.startsWith('.') ? loadTsx(resolve(dirname(path), name)) : require(name);
  new Function('require', 'module', 'exports', compiled.outputText)(localRequire, module, module.exports);
  return module.exports;
}
const {SceneTemplate, renderDiagram, PlanVideo} = loadTsx(new URL('../src/PlanVideo.tsx', import.meta.url).pathname);
const {BurnInSubtitle} = loadTsx(new URL('../src/primitives/BurnInSubtitle.tsx', import.meta.url).pathname);
const raw = JSON.parse(readFileSync(new URL('../../fixtures/sample-standard-diagrams.json', import.meta.url), 'utf8'));
raw.scenes = raw.scenes.slice(0, 2);
for (const s of raw.scenes) s.cues = [0.51, 0.51, 0.51, 0.51, 0.51, 1.45].map((seconds, i) => ({text: `字幕${i}`, seconds}));
const plan = loadPlan(raw);

for (const rate of [24, 30]) {
  test(`${rate}fps: fractional cue boundaries match cumulative VTT without gaps/overlaps`, () => {
    const props = toRemotionPlanProps(plan, rate);
    const stamps = [...buildVtt(plan).matchAll(/(\d\d):(\d\d):(\d\d)\.(\d\d\d)/g)].map(m => Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000);
    const cues = props.scenes.flatMap(s => s.cues);
    cues.forEach((cue, i) => {
      assert.ok(Math.abs(cue.startFrame / rate - stamps[2 * i]) <= 1 / rate);
      assert.ok(Math.abs((cue.startFrame + cue.durationFrames) / rate - stamps[2 * i + 1]) <= 1 / rate);
      assert.equal(cue.startFrame + cue.durationFrames, cues[i + 1]?.startFrame ?? props.totalFrames);
    });
  });
  test(`${rate}fps: modes reach PlanVideo, cue before/on/after, shortest cue has full hold`, () => {
    fps = rate;
    for (const mode of ['burn', 'soft', 'both'] as const) {
      const props = toRemotionPlanProps(plan, rate, 1280, 720, undefined, mode);
      assert.equal(props.subtitles, mode);
      const tree = PlanVideo(props);
      assert.equal(tree.props.children[0].props.children.props.subtitles, mode);
      const scene = props.scenes[0];
      for (const cue of scene.cues) {
        for (const f of [cue.startFrame - 1, cue.startFrame, cue.startFrame + 1, cue.startFrame + cue.durationFrames - 1, cue.startFrame + cue.durationFrames]) {
          frame = f;
          const html = renderToStaticMarkup(SceneTemplate({scene, fps, subtitles: mode}));
          const expected = mode !== 'soft' && f >= cue.startFrame && f < cue.startFrame + cue.durationFrames;
          assert.equal(html.includes(cue.text), expected, `${mode} frame=${f} ${cue.text}`);
        }
      }
      // 場面ローカルのframeへ戻した次場面でも絶対cue境界を取り違えない。
      const second = props.scenes[1];
      for (const cue of second.cues) {
        frame = cue.startFrame - second.startFrame;
        const html = renderToStaticMarkup(SceneTemplate({scene: second, fps, subtitles: mode}));
        assert.equal(html.includes(cue.text), mode !== 'soft');
      }
      let full = 0;
      const cue = {...scene.cues[0], durationFrames: Math.round(0.5 * fps)};
      for (frame = 0; frame < cue.durationFrames; frame++) {
        const element = BurnInSubtitle({text: cue.text, durationInFrames: cue.durationFrames});
        if (element?.props.style.opacity === 1) full++;
      }
      assert.ok(full >= Math.ceil(cue.durationFrames * 2 / 3), `full=${full}`);
      for (frame = -1; frame <= cue.durationFrames; frame++) {
        const element = BurnInSubtitle({text: cue.text, durationInFrames: cue.durationFrames, transitions: false});
        assert.equal(element?.props.style.opacity ?? 0, frame >= 0 && frame < cue.durationFrames ? 1 : 0);
      }
    }
  });
  test(`${rate}fps: all ordinary diagrams honor delayed reveals and transitions=false`, () => {
    fps = rate;
    const diagrams = [
      {type: 'flow', items: ['A', 'B'], reveal: [0, 2.13]},
      {...plan.scenes[0].diagram, reveal: [0, 2.13]},
      {type: 'branch', question: 'Q', yes: 'Y', no: 'N', reveal: [0, 2.13]},
      {type: 'meter', bars: [{label: 'A', value: 1}], total: 'T', reveal: [0, 2.13]},
      {type: 'number', value: '1', label: 'A', reveal: [0]},
    ];
    for (const diagram of diagrams) for (const transitions of [true, false]) {
      const scene = {...toRemotionPlanProps(plan, fps).scenes[0], diagram, transitions};
      const at = Math.round((diagram.reveal.at(-1) ?? 0) * fps);
      for (const f of [at - 1, at, at + 1]) {
        const html = renderToStaticMarkup(renderDiagram(scene, f, fps));
        const step = diagram.reveal.length - 1;
        const opacity = Number(new RegExp(`data-diagram-step="${step}"[^>]*style="[^"]*opacity:([\\d.]+)`).exec(html)?.[1]);
        assert.equal(opacity > 0, f >= at, `${diagram.type} transitions=${transitions} frame=${f}`);
        if (!transitions && f >= at) assert.equal(opacity, 1);
      }
      if (!transitions && diagram.type === 'meter') {
        const html = renderToStaticMarkup(renderDiagram(scene, at, fps));
        assert.ok(html.includes('width:50%'));
      }
      if (diagram.reveal.length > 1) {
        const previous = (f: number) => /data-diagram-step="0"[^>]*style="[^"]*opacity:([\d.]+)/.exec(renderToStaticMarkup(renderDiagram(scene, f, fps)))?.[1];
        assert.equal(previous(at - 1), '1');
        assert.equal(previous(at + 1), '1');
      }
    }
  });
}
