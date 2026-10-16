// Standalone mock audio verification; does not invoke sample or production services.
import {readFileSync} from 'node:fs';
import {loadPlan} from './plan.ts';
import {renderMockAudioMedia} from './mock-audio-media.ts';

try {
  const [planPath, isolatedRoot, ...extra] = process.argv.slice(2);
  if (!planPath || !isolatedRoot || extra.length) throw Error('Usage: ./scripts/run src/mock-audio-media-cli.ts <plan.json> <existing-isolated-temp-directory>');
  const plan = loadPlan(JSON.parse(readFileSync(planPath, 'utf8')));
  const {directory, report} = renderMockAudioMedia(plan, isolatedRoot);
  console.log(JSON.stringify({directory, mode: report.mode, material: report.material,
    decodedDurationSec: report.decodedDurationSec, fullDecode: report.fullDecode,
    sync: report.sync, loudness: report.loudness,
    bgmReductionDb: report.measurements.map(m => ({stem: m.reductionDb, mix: m.mixReductionDb}))}, null, 2));
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
