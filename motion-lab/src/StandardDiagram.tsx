// 通常図解の情報を省略せず表示する。meterの値はnative同様、相対方向として扱う。
import React from 'react';
import {diagramStepProgress} from './diagram-timing.ts';
import type {Diagram} from '../../src/plan.ts';

type StandardDiagram = Extract<Diagram, {type: 'compare' | 'number' | 'meter'}>;
const fontFamily = '"Hiragino Sans", "Noto Sans JP", sans-serif';
const panel: React.CSSProperties = {background: 'rgba(15, 23, 42, 0.8)', border: '2px solid #475569', borderRadius: 16, padding: 24, boxSizing: 'border-box', overflowWrap: 'anywhere'};

export const StandardDiagram: React.FC<{diagram: StandardDiagram; frame: number; fps?: number; seconds?: number; transitions?: boolean}> = ({diagram: d, frame, fps = 30, seconds = 4, transitions = true}) => {
  if (d.type === 'compare') {
    const columns: [string, string[]][] = [[d.left, d.leftItems], [d.right, d.rightItems]];
    return <div style={{display: 'flex', gap: 32, width: '100%', fontFamily, color: '#f8fafc'}}>
      {columns.map(([label, items], side) =>
        <div key={side} data-side={side === 0 ? 'left' : 'right'} data-diagram-step={side} style={{...panel, opacity: diagramStepProgress(d, side, frame, fps, seconds, transitions), flex: 1, minWidth: 0}}>
          <div style={{color: '#60a5fa', fontSize: 28, fontWeight: 700, borderBottom: '1px solid #475569', paddingBottom: 12}}>{label}</div>
          <ul style={{fontSize: 24, lineHeight: 1.5, margin: '16px 0 0', paddingLeft: 28}}>
            {items.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </div>)}
    </div>;
  }
  if (d.type === 'number') {
    return <div data-diagram-step={0} style={{...panel, opacity: diagramStepProgress(d, 0, frame, fps, seconds, transitions), display: 'flex', alignItems: 'center', gap: 32, width: '100%', fontFamily, color: '#f8fafc'}}>
      <div data-field="value" style={{fontSize: 64, fontWeight: 700, color: '#60a5fa', flex: '0 0 32%'}}>{d.value}</div>
      <div style={{flex: 1, minWidth: 0}}>
        <div data-field="label" style={{fontSize: 32, fontWeight: 700}}>{d.label}</div>
        {d.note !== undefined && <div data-field="note" style={{fontSize: 24, color: '#cbd5e1', marginTop: 16}}>{d.note}</div>}
      </div>
    </div>;
  }
  const mean = d.bars.reduce((sum, b) => sum + b.value, 0) / d.bars.length;
  const rows = [...d.bars, {label: d.total, value: mean}];
  return <div style={{...panel, width: '100%', fontFamily, color: '#f8fafc'}}>
    <div style={{marginLeft: '28%', marginRight: '16%', display: 'flex', justifyContent: 'space-between', fontSize: 24, color: '#cbd5e1', marginBottom: 8}}>
      <span>減少 ←</span><span>変化なし</span><span>→ 増加</span>
    </div>
    {rows.map((row, i) => {
      const total = i === d.bars.length;
      const progress = diagramStepProgress(d, i, frame, fps, seconds, transitions);
      const length = Math.abs(row.value) * 50 * progress;
      // nativeの文言閾値を維持。小さい非ゼロ値も棒の符号はそのまま描く。
      const direction = Math.abs(row.value) < 0.15 ? '変わらない' : row.value > 0 ? '上がった' : '下がった';
      return <div key={i} data-diagram-step={i} data-row={total ? 'aggregate' : 'bar'} data-direction={row.value < 0 ? 'negative' : row.value > 0 ? 'positive' : 'zero'} style={{opacity: progress, display: 'flex', alignItems: 'center', gap: 16, minHeight: 40, borderTop: total ? '1px solid #64748b' : undefined, marginTop: total ? 8 : 0, paddingTop: total ? 8 : 0}}>
        <div style={{width: '26%', fontSize: 24, color: total ? '#60a5fa' : '#f8fafc', fontWeight: total ? 700 : 400}}>{row.label}</div>
        <div style={{position: 'relative', flex: 1, height: 24, background: 'rgba(255,255,255,0.05)'}}>
          <div data-zero-axis="true" style={{position: 'absolute', left: '50%', width: 2, top: -5, bottom: -5, background: '#cbd5e1'}} />
          <div data-meter-fill="true" style={{position: 'absolute', left: `${row.value < 0 ? 50 - length : 50}%`, width: `${length}%`, height: '100%', background: total ? '#60a5fa' : '#94a3b8', borderRadius: 4}} />
        </div>
        <div style={{width: '14%', fontSize: 24, color: total ? '#60a5fa' : '#cbd5e1', opacity: progress}}>{direction}</div>
      </div>;
    })}
  </div>;
};
