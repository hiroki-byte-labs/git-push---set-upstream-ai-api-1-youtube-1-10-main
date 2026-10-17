import {readFileSync, existsSync} from 'node:fs';
import {loadPlan} from './plan.ts';
import {buildThumbnailCandidates} from './thumbnail-candidates.ts';
import {renderThumbnails} from './thumbnail-renderer.ts';
import {checkThumbnailQuality} from './thumbnails.ts';
try {
  const [input, output, family, ...rest] = process.argv.slice(2);
  if (!input || !output || !['mincho', 'gothic'].includes(family) || rest.length) throw Error('Usage: ./scripts/run src/thumbnail-cli.ts <plan.json> <new-output-dir> mincho|gothic');
  if (existsSync(output)) throw Error('既存の出力ディレクトリは上書きしません');
  const plan = loadPlan(JSON.parse(readFileSync(input, 'utf8')));
  const brief = buildThumbnailCandidates(plan, {typography: {family: family as 'mincho' | 'gothic', weight: 900, outline: true, glow: true, gradient: true}});
  renderThumbnails({brief, outputDir: output});
  const quality = checkThumbnailQuality(output, brief);
  console.log(JSON.stringify(quality, null, 2));
  if (!quality.canProceed) process.exitCode = 1;
} catch (error) {console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;}
