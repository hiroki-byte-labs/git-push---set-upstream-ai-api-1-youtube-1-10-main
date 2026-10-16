import {readFileSync,writeFileSync} from 'node:fs';
import {loadPlan} from './plan.ts';
import type {Plan} from './plan.ts';
export {validateV1 as validatePlan} from './plan.ts';
export type {Plan} from './plan.ts';
export interface ScriptProvider{kind:string; create():Promise<Plan>}
export interface AudioProvider{kind:string;create(plan:Plan,path:string):Promise<void>}
export interface VisualProvider{kind:string;render(plan:Plan,dir:string):Promise<void>}
export interface Publisher{kind:string;publish():Promise<never>}
// 台本ファイル（v1/v2）を読む模擬の台本接続。sample --plan で任意のファイルを指定できる（T041）。
export class FixtureScript implements ScriptProvider{kind='mock.fixture';path:string;constructor(path='fixtures/sample.json'){this.path=path}async create(){return loadPlan(JSON.parse(readFileSync(this.path,'utf8')))}}
// 自作の正弦波。ナレーションを模擬する確認音であり、音声合成APIではない。
export class CueAudio implements AudioProvider{kind='mock.sine-cues';async create(plan:Plan,path:string){
 const rate=24000,total=plan.scenes.reduce((n,s)=>n+s.seconds,0),count=rate*total,buf=Buffer.alloc(44+count*2);
 buf.write('RIFF');buf.writeUInt32LE(36+count*2,4);buf.write('WAVEfmt ',8);buf.writeUInt32LE(16,16);buf.writeUInt16LE(1,20);buf.writeUInt16LE(1,22);buf.writeUInt32LE(rate,24);buf.writeUInt32LE(rate*2,28);buf.writeUInt16LE(2,32);buf.writeUInt16LE(16,34);buf.write('data',36);buf.writeUInt32LE(count*2,40);
 let start=0;plan.scenes.forEach((s,k)=>{for(let j=0;j<rate*s.seconds;j++){const t=j/rate;const a=t<0.7?0.16*Math.sin(Math.PI*t/0.7)**2:0;buf.writeInt16LE(Math.round(32767*a*Math.sin(2*Math.PI*(330+k*55)*t)),44+2*(start+j))}start+=s.seconds*rate});writeFileSync(path,buf);
}}
export class DisabledPublisher implements Publisher{kind='disabled';async publish():Promise<never>{throw Error('投稿は未実装・未承認です')}}
export {RemotionVisual} from './remotion-visual.ts';
