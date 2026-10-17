import {readFileSync, writeFileSync} from 'node:fs';
import {compileDocumentary} from './documentary.ts';

try {
  const args = process.argv.slice(2);
  if (args.length !== 2) throw Error('Usage: ./scripts/run src/documentary-cli.ts <chapters.json> <draft-plan.json>');
  const {plan, report} = compileDocumentary(JSON.parse(readFileSync(args[0], 'utf8')));
  writeFileSync(args[1], JSON.stringify(plan, null, 2) + '\n', {flag: 'wx'});
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
