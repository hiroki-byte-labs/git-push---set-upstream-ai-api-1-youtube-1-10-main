// Only sampled frames emit measurements. Range rectangles measure browser text layout,
// not an estimate from character counts. Coordinates are output pixels, top-left origin.
import React, {useLayoutEffect, useRef} from 'react';
import {AbsoluteFill, continueRender, delayRender, useCurrentFrame, useCurrentScale, useVideoConfig} from 'remotion';
import type {RemotionSceneProps} from './remotion-plan.ts';

export const LayoutProbe: React.FC<{root: React.RefObject<HTMLDivElement | null>; scene: RemotionSceneProps; frames?: number[]; disabled?: boolean}> = ({root, scene, frames, disabled}) => {
  const local = useCurrentFrame();
  const frame = scene.startFrame + local;
  const viewportScale = useCurrentScale();
  const {width, height} = useVideoConfig();
  const sampled = !disabled && frames?.includes(frame);
  useLayoutEffect(() => {
    const handle = delayRender('layout fonts and DOM');
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled && sampled && root.current) {
        const origin = root.current.getBoundingClientRect();
        const rect = (r: DOMRect) => [(r.x - origin.x) / viewportScale, (r.y - origin.y) / viewportScale, r.width / viewportScale, r.height / viewportScale];
        const records = [];
        for (const zone of root.current.querySelectorAll<HTMLElement>('[data-layout-zone]')) {
          const walker = document.createTreeWalker(zone, NodeFilter.SHOW_TEXT);
          let node: Node | null;
          while ((node = walker.nextNode())) {
            if (!node.textContent?.trim()) continue;
            const parent = node.parentElement!;
            let opacity = 1;
            for (let el: HTMLElement | null = parent; el && el !== root.current; el = el.parentElement) opacity *= Number(getComputedStyle(el).opacity);
            if (opacity <= 0) continue;
            const style = getComputedStyle(parent);
            const range = document.createRange(); range.selectNodeContents(node);
            const lines = [...range.getClientRects()].map(rect);
            if (!lines.length) continue;
            const drawn = rect(range.getBoundingClientRect());
            records.push({text: node.textContent, zone: zone.dataset.layoutZone, box: rect(zone.getBoundingClientRect()), drawn,
              lines, pixelSize: parseFloat(style.fontSize) * (parent instanceof SVGGraphicsElement ? Math.hypot(parent.getScreenCTM()!.a, parent.getScreenCTM()!.b) / viewportScale : width / 1920), foreground: parent instanceof SVGElement ? style.fill : style.color, opacity,
              parentBox: rect(parent.getBoundingClientRect()), fontFamily: style.fontFamily});
          }
        }
        console.log('T155_LAYOUT:' + JSON.stringify({frame, scene: scene.index, width, height, records}));
      }
      continueRender(handle);
    });
    return () => {cancelled = true; continueRender(handle);};
  }, [frame, sampled, root, scene.index, viewportScale, width, height]);
  return null;
};

export const MeasuredCanvas: React.FC<React.PropsWithChildren<{scene: RemotionSceneProps; frames?: number[]; disabled?: boolean; width: number}>> = ({scene, frames, disabled, width, children}) => {
  const root = useRef<HTMLDivElement>(null);
  return <AbsoluteFill ref={root} data-layout-root style={{width: 1920, height: 1080, transform: `scale(${width / 1920})`, transformOrigin: 'top left'}}>
    {frames && <LayoutProbe root={root} scene={scene} frames={frames} disabled={disabled} />}
    {children}
  </AbsoluteFill>;
};
