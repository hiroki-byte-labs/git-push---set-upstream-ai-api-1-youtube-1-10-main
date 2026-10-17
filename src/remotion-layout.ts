import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {ffmpegPath, ff} from './media.ts';
import {SUBTITLE_MAX_LINES} from './subtitle-optimizer.ts';
import type {RemotionPlanProps} from '../motion-lab/src/remotion-plan.ts';

type Rect = number[];
type DOMRecord = {text: string; zone: string; box: Rect; drawn: Rect; lines: Rect[]; parentBox: Rect; pixelSize: number; foreground: string; opacity: number; fontFamily: string};
type Sample = {frame: number; scene: number; width: number; height: number; records: DOMRecord[]};
export function layoutFrames(props: RemotionPlanProps): number[] {
  return [...new Set(props.scenes.flatMap(s => [s.startFrame + s.durationFrames - 1,
    ...s.cues.map(c => c.startFrame + Math.floor(c.durationFrames / 2))]))].sort((a,b) => a-b);
}
const luminance = (rgb: number[]) => rgb.map(c => c / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).reduce((n,c,i) => n + c * [0.2126,0.7152,0.0722][i], 0);
export function contrastRatio(a: number[], b: number[]): number {
  const x = luminance(a), y = luminance(b); return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);
}
export function diagramTexts(props: RemotionPlanProps['scenes'][number]): string[] {
  const d = props.diagram;
  if (d.illustration) return []; // Illustration labels come from its rendered SVG, not ordinary diagram fields.
  switch (d.type) {
    case 'flow': return d.items;
    case 'compare': return [d.left,d.right,...d.leftItems,...d.rightItems];
    case 'number': return [d.value,d.label,...(d.note ? [d.note] : [])];
    // The branch renderer deliberately uses separate DOM text nodes for the
    // YES/NO prefix and answer so each wrapped answer can be measured.
    case 'branch': return [d.question, 'YES: ', d.yes, 'NO: ', d.no];
    case 'meter': return [...d.bars.map(b=>b.label),d.total];
  }
}
export function validateCoverage(props: RemotionPlanProps, samples: Sample[]) {
  for (const frame of layoutFrames(props)) {
    const s = props.scenes.find(s => frame >= s.startFrame && frame < s.startFrame+s.durationFrames)!;
    const sample = samples.find(x => x.frame === frame && x.scene === s.index);
    if (!sample || sample.width !== props.width || sample.height !== props.height || !sample.records.length) throw Error(`DOM測定欠落 frame=${frame}`);
    if (!sample.records.some(r => r.zone === 'title' && r.text === s.title)) throw Error(`見出し測定欠落 scene=${s.index}`);
    const cue = s.cues.find(c => frame >= c.startFrame && frame < c.startFrame+c.durationFrames);
    const cueMidpoint = cue && frame === cue.startFrame + Math.floor(cue.durationFrames / 2);
    if (props.subtitles !== 'soft' && cueMidpoint && cue && !sample.records.some(r => r.zone === 'subtitle' && r.text === cue.display)) throw Error(`cue測定欠落 frame=${frame}`);
    const sourceText = sample.records.filter(r=>r.zone === 'source').map(r=>r.text).join('');
    if (s.sourceReferences.some(r=>!sourceText.includes(`[${r.number}]`))) throw Error(`出典測定欠落 scene=${s.index}`);
    if (frame === s.startFrame+s.durationFrames-1) {
      const measured = sample.records.filter(r=>r.zone === 'diagram').map(r=>r.text);
      for (const text of diagramTexts(s)) {
        const i = measured.indexOf(text);
        if (i < 0) throw Error(`図解測定欠落 scene=${s.index}: ${text}`);
        measured.splice(i,1);
      }
    }
  }
}

export function generateMeasuredReport(props: RemotionPlanProps, dir: string) {
  const samples: Sample[] = JSON.parse(readFileSync(join(dir,'layout-dom.json'),'utf8'));
  validateCoverage(props, samples);
  const records = [];
  const scale = props.width / 1280;
  const logical = (r: Rect) => [r[0]/scale, (props.height-r[1]-r[3])/scale, r[2]/scale, r[3]/scale];
  for (const sample of samples) {
    if (!props.layoutFrames?.includes(sample.frame)) continue;
    const file = `frame-${sample.frame}.png`;
    ff(['-i',join(dir,'sample.mp4'),'-vf',`select=eq(n\\,${sample.frame})`,'-frames:v','1',join(dir,file)]);
    const r = spawnSync(ffmpegPath(), ['-v','error','-i',join(dir,`background-${sample.frame}.png`),'-f','rawvideo','-pix_fmt','rgb24','pipe:1'], {maxBuffer: props.width*props.height*4});
    if (r.status !== 0 || r.stdout.length !== props.width*props.height*3) throw Error('背景画素の測定失敗');
    for (const rec of sample.records) {
      const scene = props.scenes.find(s => s.index === sample.scene)!;
      // End-of-scene samples cover the final diagram reveal. Subtitle typography is
      // measured at every cue midpoint (full hold), not again during its exit fade.
      // Transition states (opacity < 0.90) are excluded from pass/fail readability checks with recorded reason (T158).
      const isFullHoldSubtitle = rec.zone !== 'subtitle' || scene.cues.some(c => sample.frame === c.startFrame + Math.floor(c.durationFrames / 2));
      const isVisibleHold = rec.opacity >= 0.9;
      const readabilitySample = isFullHoldSubtitle && isVisibleHold;
      let exclusionReason: string | undefined = undefined;
      if (!isFullHoldSubtitle) {
        exclusionReason = `subtitle transition (frame ${sample.frame})`;
      } else if (!isVisibleHold) {
        exclusionReason = `transition opacity ${rec.opacity.toFixed(2)} (< 0.90)`;
      }
      const fg = rec.foreground.match(/[\d.]+/g)?.map(Number);
      if (!fg || fg.length < 3 || fg.length === 4 && fg[3] !== 1) throw Error('未対応の文字色');
      let contrast = Infinity;
      for (const line of rec.lines) {
        for (let y = Math.max(0,Math.floor(line[1])); y < Math.min(props.height,Math.ceil(line[1]+line[3])); y++) {
          for (let x = Math.max(0,Math.floor(line[0])); x < Math.min(props.width,Math.ceil(line[0]+line[2])); x++) {
            const offset = (y*props.width+x)*3;
            const bg = [...r.stdout.subarray(offset,offset+3)];
            const visible = fg.slice(0,3).map((c,i) => c*rec.opacity+bg[i]*(1-rec.opacity));
            contrast = Math.min(contrast,contrastRatio(visible,bg));
          }
        }
      }
      if (!Number.isFinite(contrast)) throw Error('文字背景測定範囲なし');
      records.push({...rec, file, scene: sample.scene, frame: sample.frame, role: rec.zone, coordinateSystem: 'remotion-720-bottom-left',
        box: logical(rec.box), drawn: logical(rec.drawn), zoneBounds: logical(rec.box), parentBox: logical(rec.parentBox),
        pixelBounds: rec.drawn, size: rec.pixelSize/scale, contrast, measurement: 'DOM Range + text-hidden PNG minimum background contrast',
        readabilitySample, exclusionReason, lines: rec.lines.map(logical), maxLines: rec.zone === 'subtitle' ? SUBTITLE_MAX_LINES : undefined,
        expectedLines: rec.zone === 'subtitle' ? rec.text.split('\n') : undefined});
    }
  }
  writeFileSync(join(dir,'render-report.json'),JSON.stringify(records,null,2));
  return records;
}
