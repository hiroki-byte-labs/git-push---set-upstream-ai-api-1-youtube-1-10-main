import type {Diagram} from '../../src/plan.ts';
import {illustrationReveals} from '../shared/illustration.ts';

// Planとnativeと同じ段数・既定の登場秒。各要素は独立した時計を持つ。
export function diagramStepProgress(diagram: Diagram, step: number, frame: number, fps: number, seconds: number, transitions = true): number {
  const starts = illustrationReveals(diagram, seconds).map(t => Math.round(t * fps));
  const start = starts[step];
  if (frame < start) return 0;
  if (!transitions) return 1;
  const end = starts[step + 1] ?? Math.round(seconds * fps);
  const duration = Math.max(1, Math.min(Math.round(0.5 * fps), end - start));
  // onフレームから可視。短い段でも次の段の前には完全表示する。
  const t = Math.min(1, (frame - start + 1) / duration);
  return 1 - (1 - t) ** 4;
}
