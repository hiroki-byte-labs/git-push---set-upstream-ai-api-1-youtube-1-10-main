import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {checkReadability,MIN_FONT_720} from '../src/readability.ts';
import {parseSampleArgs} from '../src/commands/sample.ts';
const rec=(o:any)=>({file:'a.png',role:'字幕',text:'テスト',size:29,pixelSize:29,contrast:12,...o});
function withReport(recs:any[],fn:(d:string)=>void){const d=mkdtempSync(join(tmpdir(),'rd-'));try{writeFileSync(join(d,'render-report.json'),JSON.stringify(recs));fn(d)}finally{rmSync(d,{recursive:true,force:true})}}
test('見やすさ（T091）: 合格、小さい文字、低コントラスト',()=>{withReport([rec({})],d=>{const r=checkReadability(d,1);assert.equal(r.ok,true);assert.equal(r.minFont720,29)});withReport([rec({size:12,pixelSize:12}),rec({contrast:3.2})],d=>{const r=checkReadability(d,1);assert.equal(r.ok,false);assert.equal(r.issues.length,2);assert.match(r.issues[0],/16pt未満/);assert.match(r.issues[1],/3\.20/)})});
test('見やすさ（T091）: 1080pは720p換算で判定',()=>{withReport([rec({size:20,pixelSize:30})],d=>{assert.equal(checkReadability(d,1.5).minFont720,20)});assert.equal(MIN_FONT_720,16)});
test('--resolutionの引数（T091）',()=>{assert.deepEqual(parseSampleArgs(['--resolution','1080']),{resolution:1080});assert.throws(()=>parseSampleArgs(['--resolution','4k']),/不明/)});
