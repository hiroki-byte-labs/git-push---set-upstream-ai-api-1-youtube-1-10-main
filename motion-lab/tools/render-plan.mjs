// Uses the same bundle and props for media and DOM/background samples.
import {createRequire} from 'node:module';
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve, join} from 'node:path';
const require = createRequire(import.meta.url);
const cliRequire = createRequire(require.resolve('@remotion/cli/package.json'));
const {bundle} = cliRequire('@remotion/bundler');
const {selectComposition, renderMedia, renderStill, openBrowser} = cliRequire('@remotion/renderer');
const [propsPath, output] = process.argv.slice(2);
const inputProps = JSON.parse(readFileSync(propsPath, 'utf8'));
const samples = new Map();
const onBrowserLog = ({text}) => {
  if (text.startsWith('T155_LAYOUT:')) {
    const sample = JSON.parse(text.slice('T155_LAYOUT:'.length));
    // Premounted scenes can emit too: keep only the active scene for this frame.
    const scene = inputProps.scenes.find(s => sample.frame >= s.startFrame && sample.frame < s.startFrame + s.durationFrames);
    if (scene?.index === sample.scene) samples.set(sample.frame, sample);
  }
};
const serveUrl = await bundle({entryPoint: resolve('src/index.ts')});
const browser = await openBrowser('chrome');
try {
  const composition = await selectComposition({serveUrl, id: 'PlanVideo', inputProps, puppeteerInstance: browser});
  await renderMedia({serveUrl, composition, inputProps, codec: 'h264', outputLocation: output,
    concurrency: 2, puppeteerInstance: browser, onBrowserLog, logLevel: 'error'});
  // Capture each requested frame explicitly: also verifies coverage if renderer logging changes.
  for (const frame of inputProps.layoutFrames) {
    await renderStill({serveUrl, composition, inputProps, frame, puppeteerInstance: browser, onBrowserLog,
      output: join(resolve(output, '..'), `layout-${frame}.png`), imageFormat: 'png', logLevel: 'error'});
    await renderStill({serveUrl, composition: {...composition, props: {...composition.props, layoutBackgroundOnly: true}}, inputProps: {...inputProps, layoutBackgroundOnly: true}, frame,
      puppeteerInstance: browser, output: join(resolve(output, '..'), `background-${frame}.png`), imageFormat: 'png', logLevel: 'error'});
  }
  if (inputProps.layoutFrames.some(f => !samples.has(f))) throw Error('Missing DOM layout samples');
  writeFileSync(join(resolve(output, '..'), 'layout-dom.json'), JSON.stringify([...samples.values()].sort((a,b) => a.frame-b.frame), null, 2));
} finally {await browser.close({silent: true});}
