import type {Diagram, DiagramIllustration, SceneArchetype} from '../../src/plan.ts';

export function diagramSteps(d: any): number {
  return d?.type === 'flow' ? (d.items?.length ?? 1) :
    d?.type === 'compare' ? 2 :
    d?.type === 'branch' ? 2 :
    d?.type === 'number' ? 1 :
    d?.type === 'meter' ? ((d.bars?.length ?? 0) + 1) : 1;
}

export const illustrationReveals = (diagram: Diagram, seconds: number): number[] =>
  diagram.reveal ?? Array.from({length: diagramSteps(diagram)}, (_, i) => i * Math.min(1, seconds * .4 / diagramSteps(diagram)));

// Original, normalized human silhouette. 0=M, 1=L, 2=cubic Bézier, 3=close.
// Both renderers consume these same contours: neck, sloping shoulders, separate
// upper arms/forearms, tapered torso, two legs, ankles and feet. Not traced media.
export const PERSON_CONTOURS: number[][][] = [
  [[0,0,0],[2,8,0,8,14,0,15],[2,-8,14,-8,0,0,0],[3]],
  [[0,-3.5,13],[1,3.5,13],[1,4,18],
    [2,8,19,14,19,16,23],[2,19,29,21,39,22,47],
    [2,23,51,22,54,20,54],[2,18,54,17,52,17,49],
    [1,14,34],[1,12,29],[1,10.5,47],
    [2,12,54,12,60,11,68],[1,9,92],
    [2,9,95,13,95,14,98],[2,14,100,10,100,6,100],
    [2,3,100,3,97,3,94],[1,2,73],[1,0,58],
    [1,-2,73],[1,-3,94],[2,-3,97,-3,100,-6,100],
    [2,-10,100,-14,100,-14,98],[2,-13,95,-9,95,-9,92],
    [1,-11,68],[2,-12,60,-12,54,-10.5,47],
    [1,-12,29],[1,-14,34],[1,-17,49],
    [2,-17,52,-18,54,-20,54],[2,-22,54,-23,51,-22,47],
    [2,-21,39,-19,29,-16,23],[2,-14,19,-8,19,-4,18],[3]],
];

export const contourToSvg = (contour: number[][]): string => contour.map(([op,...v]) => `${['M','L','C','Z'][op]}${v.join(' ')}`).join(' ');
export type IllustrationFigure = {x:number; y:number; height:number; opacity:number; accent:boolean};
export type IllustrationLine = {x1:number; y1:number; x2:number; y2:number; opacity:number; width:number};
export type IllustrationHalo = {x:number; y:number; rx:number; ry:number; opacity:number};
export type IllustrationLabel = {x:number; y:number; text:string; opacity:number; accent:boolean};
export type IllustrationFrame = {
  opacity:number;
  figures:IllustrationFigure[];
  lines:IllustrationLine[];
  halos:IllustrationHalo[];
  labels:IllustrationLabel[];
};

// Zero velocity/acceleration at each end. Timing is in seconds, not scene frames.
export const smoothProgress = (elapsed:number, duration:number):number => {
  const t=Math.max(0,Math.min(1,elapsed/duration));
  return t*t*t*(10+t*(-15+6*t));
};

export function archetypeForMotif(motif: DiagramIllustration): SceneArchetype {
  switch (motif) {
    case 'attention-concentration': return 'causal-relation';
    case 'ranked-rewards': return 'contrast';
    case 'digital-reach': return 'causal-relation';
    case 'branching-tree': return 'data-quantity';
    case 'lineage-convergence': return 'resonance';
    case 'tolerance-boundary': return 'contrast';
    case 'social-division': return 'scenery';
  }
}

/** A 1000×240 canvas. Every element retains its own reveal clock; later cues
 * never reset already-visible people/lines. Timings are design choices informed
 * by local reference observation, not claimed measurements of the source curves. */
export function illustrationFrame(motif:DiagramIllustration, time:number, reveal:number[], seconds:number, transitions=true):IllustrationFrame {
  const result:IllustrationFrame={opacity:transitions ? smoothProgress(time,.35)*(1-smoothProgress(time-(seconds-.45),.45)):1, figures:[],lines:[],halos:[],labels:[]};
  const start=(stage:number)=>reveal[stage] ?? Number.POSITIVE_INFINITY;
  const progress=(at:number,duration=.7)=>transitions ? smoothProgress(time-at,duration):(time>=at?1:0);
  const figure=(x:number,y:number,height:number,at:number,accent=false,alpha=1)=>{
    const p=progress(at);
    result.figures.push({x,y:y+12*(1-p),height,opacity:p*alpha,accent});
  };
  const line=(x1:number,y1:number,x2:number,y2:number,at:number,width=1.6,alpha=.45)=>{
    const p=progress(at,.85);
    result.lines.push({x1,y1,x2:x1+(x2-x1)*p,y2:y1+(y2-y1)*p,width,opacity:p*alpha});
  };
  const halo=(x:number,y:number,rx:number,ry:number,at:number)=>{
    const p=progress(at,.95);
    result.halos.push({x,y,rx:rx*(.88+.12*p),ry:ry*(.88+.12*p),opacity:.13*p});
  };
  const label=(x:number,y:number,text:string,at:number,accent=false)=>result.labels.push({x,y,text,accent,opacity:progress(at)});

  if(motif==='attention-concentration'){
    // A stagger gives viewers time to read the audience before attention converges.
    const crowd=[100,190,280,370,460,550];
    crowd.forEach((x,i)=>figure(x,212,94+(i%2)*10,start(0)+i*.09,false,.7));
    const focus=start(1);
    halo(810,126,125,100,start(2));
    crowd.forEach((x,i)=>line(x+24,157,771,139,focus+.24+i*.06));
    figure(810,212,174,focus,true);
  }else if(motif==='ranked-rewards'){
    // Same human proportions; the expanding receiving line represents attention,
    // not a measured income scale or a change in the person's physical size.
    halo(705,130,112,93,start(1)+.2);
    line(225,214,440,214,start(0),2,.5);
    line(575,214,845,214,start(1)+.15,3,.8);
    figure(335,211,154,start(0),false,.82);
    figure(705,211,154,start(1),true);
    label(335,29,'2',start(0)+.25);
    label(705,29,'1',start(1)+.25,true);
  }else if(motif==='digital-reach'){
    // A signal arrives before each listener emerges. Wave arcs are replaced by
    // a single expanding light field, avoiding late-stage pops and visual clutter.
    figure(180,212,166,start(0),true);
    halo(180,126,100,90,start(2));
    [560,675,790,905].forEach((x,i)=>{
      const at=start(1)+i*.18;
      const y=205-(i%2)*15;
      line(220,130,x-23,y-54,at,1.6,.5);
      figure(x,y,98+(i%2)*8,at+.4,false,.82);
    });
  }else if(motif==='branching-tree'){
    // 名字絶滅（分枝過程）: 祖先から世代交代を経て、途絶える家系と残存する家系の分岐を表す。
    figure(500,92,60,start(0),true);
    halo(500,62,45,24,start(0)+.15);
    label(500,14,'祖先',start(0)+.2,true);
    const gen1=[280,500,720];
    gen1.forEach((x,i)=>{
      const at=start(1)+i*.12;
      line(500,92,x,140,at,2,.6);
      figure(x,182,54,at+.3,i===1,.8);
    });
    // 世代2: 左右は途絶え、中央の家系だけが分枝して残る
    const at2=start(2);
    label(280,206,'途絶',at2+.15,false);
    label(720,206,'途絶',at2+.15,false);
    line(500,182,430,214,at2+.15,2.2,.7);
    line(500,182,570,214,at2+.25,2.2,.7);
    figure(430,238,50,at2+.4,true);
    figure(570,238,50,at2+.5,true);
    halo(500,210,140,24,at2+.3);
    label(500,240,'残存と集中',at2+.55,true);
  }else if(motif==='lineage-convergence'){
    // 名字の収斂（余韻）: 多様な名字が世代交代を通じて極少数の名字へ収斂する情景。
    [100,180,260,340].forEach((x,i)=>{
      const at=start(0)+i*.08;
      figure(x,190-(i%2)*18,48,at,false,.55);
      line(x+15,165-(i%2)*18,690,130,start(1)+i*.1,1.5,.45);
    });
    label(220,32,'無数の名字',start(0)+.2,false);
    label(500,32,'収斂の過程',start(1)+.2,true);
    figure(750,212,160,start(2),true);
    halo(750,130,120,95,start(2)+.15);
    label(750,32,'集約された姓',start(2)+.25,true);
  }else if(motif==='tolerance-boundary'){
    // 寛容のパラドックス（対比・境界）: 開かれた社会と不寛容を排除する境界線の防壁。
    [180,280,380].forEach((x,i)=>{
      figure(x,212,120+(i%2)*15,start(0)+i*.1,false,.85);
    });
    halo(280,135,160,85,start(0)+.2);
    label(280,30,'寛容な圏域',start(0)+.2,false);
    // 境界線（中央の防壁）
    line(540,20,540,225,start(1),3.5,.85);
    halo(540,130,25,75,start(1)+.15);
    label(540,30,'防衛境界',start(1)+.25,true);
    // 外部の不寛容要素の排除
    figure(820,212,155,start(2),true);
    line(770,125,565,125,start(2)+.15,2.4,.7);
    halo(820,130,80,75,start(2)+.2);
    label(820,30,'不寛容の排除',start(2)+.25,true);
  }else if(motif==='social-division'){
    // 社会的分断（情景・対比）: 共通の基盤から二つの極端な集団へと分断が進む情景。
    [450,550].forEach((x,i)=>{
      figure(x,212,110,start(0)+i*.1,false,.75);
    });
    label(500,30,'共通の社会基盤',start(0)+.2,false);
    // 中央の分断線
    line(500,45,500,225,start(1),3,.85);
    // 左右への二極化
    [180,280].forEach((x,i)=>{
      figure(x,212,125,start(1)+i*.1,false,.85);
    });
    [720,820].forEach((x,i)=>{
      figure(x,212,125,start(1)+i*.1,true,.85);
    });
    label(230,30,'集団A',start(1)+.25,false);
    label(770,30,'集団B',start(1)+.25,true);
    halo(230,135,90,75,start(2));
    halo(770,135,90,75,start(2));
    line(330,135,460,135,start(2)+.1,1.8,.4);
    line(540,135,670,135,start(2)+.1,1.8,.4);
    label(500,135,'深まる分断',start(2)+.25,true);
  }
  return result;
}
