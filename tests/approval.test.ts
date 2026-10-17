// 承認は確認対象一式（動画・採用タイトル・概要欄・タグ・チャプター・字幕・サムネイル案すべて）の版に結び付く（T095）。
// 記録者はtest-agent。人の承認ではない。
import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,unlinkSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';import {createServer} from 'node:http';import type {AddressInfo} from 'node:net';
import {approvalOf,recordReview} from '../src/review.ts';
import {buildMetadata,reviseTitle} from '../src/metadata.ts';
import {loadPlan} from '../src/plan.ts';
import {createHandler} from '../src/commands/serve.ts';
const sha=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
const R='test-agent';
function fixture(fn:(dir:string,root:string)=>Promise<void>|void){return async()=>{const root=mkdtempSync(join(tmpdir(),'approval-'));try{await fn(bundleJob(root,'demo-abcdef01'),root)}finally{rmSync(root,{recursive:true,force:true})}}}
function bundleJob(root:string,id:string){
 const d=join(root,id);mkdirSync(d,{recursive:true});const mp4=Buffer.from('fake-mp4');writeFileSync(join(d,'sample.mp4'),mp4);
 writeFileSync(join(d,'subtitles.vtt'),'WEBVTT\n\n00:00.000 --> 00:02.000\n字幕\n');
 const plan=loadPlan(JSON.parse(readFileSync('fixtures/sample-v2.json','utf8')));writeFileSync(join(d,'plan.json'),JSON.stringify(plan));
 writeFileSync(join(d,'metadata.json'),JSON.stringify(buildMetadata(plan,{sources:'出典: なし',stance:'免責'}),null,2));
 const thumbs=['a','b','c'].map(v=>{writeFileSync(join(d,`thumbnail-${v}.png`),'png-'+v);return {file:`thumbnail-${v}.png`,ok:true,issues:[],sha256:sha('png-'+v)}});
 writeFileSync(join(d,'job.json'),JSON.stringify({id,status:'completed',createdAt:new Date().toISOString(),inputHash:'in',outputHash:sha(mp4),thumbnails:thumbs}));
 return d;
}
const approve=(d:string)=>recordReview(d,'approve','test-agentの動作確認',approvalOf(d).currentHash!,R);
const meta=(d:string)=>JSON.parse(readFileSync(join(d,'metadata.json'),'utf8'));
const setMeta=(d:string,patch:any)=>writeFileSync(join(d,'metadata.json'),JSON.stringify({...meta(d),...patch},null,2));

test('承認後にタイトルを見直すと失効する',fixture(d=>{approve(d);assert.equal(approvalOf(d).state,'approved');reviseTitle(d,'判断の前に確かめる3つのこと','試験',R);assert.equal(approvalOf(d).state,'expired')}));
for(const [name,change] of [
 ['概要欄',(d:string)=>setMeta(d,{description:meta(d).description+'\n追記'})],
 ['タグ',(d:string)=>setMeta(d,{tags:['別のタグ']})],
 ['チャプター',(d:string)=>setMeta(d,{chapters:[{time:'00:00',title:'別'}]})],
 ['字幕',(d:string)=>writeFileSync(join(d,'subtitles.vtt'),'WEBVTT\n\n00:00.000 --> 00:02.000\n変更\n')],
 ['サムネイルの1案',(d:string)=>writeFileSync(join(d,'thumbnail-b.png'),'changed')],
 ['サムネイルの欠落',(d:string)=>unlinkSync(join(d,'thumbnail-c.png'))],
 ['字幕の欠落',(d:string)=>unlinkSync(join(d,'subtitles.vtt'))],
 ['metadata.jsonの欠落',(d:string)=>unlinkSync(join(d,'metadata.json'))],
 ['動画',(d:string)=>writeFileSync(join(d,'sample.mp4'),'changed')],
] as const) test(`承認後の変更で失効する: ${name}`,fixture(d=>{approve(d);change(d);assert.equal(approvalOf(d).state,'expired')}));
test('確認対象外の変更（見直し履歴・検査記録・job.jsonの付帯情報・候補タイトル・再計算）では失効しない',fixture(d=>{
 const h=approvalOf(d).currentHash;assert.equal(approvalOf(d).currentHash,h,'再計算で版が変わらない');approve(d);
 writeFileSync(join(d,'metadata-revisions.json'),'[]');writeFileSync(join(d,'lint.json'),'{"errors":0}');writeFileSync(join(d,'media-check.json'),'{}');writeFileSync(join(d,'plan.json'),'{}');
 const j=JSON.parse(readFileSync(join(d,'job.json'),'utf8'));writeFileSync(join(d,'job.json'),JSON.stringify({...j,note:'運用メモ',updatedAt:new Date().toISOString()}));
 setMeta(d,{titles:[...meta(d).titles,'未採用の候補'],issues:['表示用の検査結果']});
 assert.equal(approvalOf(d).state,'approved');assert.equal(approvalOf(d).currentHash,h);
}));
test('変更前の版での承認は記録しない（CLI/関数）',fixture(d=>{const old=approvalOf(d).currentHash!;setMeta(d,{description:'変更'});assert.throws(()=>recordReview(d,'approve','',old,R),/異なる/);assert.equal(approvalOf(d).state,'pending')}));
test('動画だけのハッシュ（旧形式の版）では承認できない',fixture(d=>{assert.throws(()=>recordReview(d,'approve','',sha('fake-mp4'),R),/異なる/)}));
test('旧形式の承認（動画のハッシュのみ）は一式へ拡張せず再確認を求める',fixture(d=>{
 writeFileSync(join(d,'review.json'),JSON.stringify([{decision:'approve',note:'旧',outputHash:sha('fake-mp4'),inputHash:'in',at:new Date().toISOString(),reviewer:R}]));
 const a=approvalOf(d);assert.equal(a.state,'expired');assert.match(a.reason,/旧形式/);
}));
test('確認画面: 表示した版で承認、旧画面の版・動画だけのハッシュは409',fixture(async (d,root)=>{
 const handler=createHandler(root);const srv=createServer((req,res)=>{req.headers.host='127.0.0.1:4173';handler(req,res)});await new Promise<void>(r=>srv.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
 const post=(fields:Record<string,string>)=>fetch(base+'/job/demo-abcdef01/review',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({decision:'approve',note:'',...fields}).toString(),redirect:'manual'});
 try{
  const page=await (await fetch(base+'/job/demo-abcdef01')).text();const shown=page.match(/name="bundleHash" value="([a-f0-9]{64})"/)?.[1];assert.equal(shown,approvalOf(d).currentHash);
  assert.ok(page.includes(meta(d).selectedTitle));
  reviseTitle(d,'判断の前に確かめる3つのこと','試験',R);
  assert.equal((await post({bundleHash:shown!})).status,409);
  assert.equal((await post({outputHash:sha('fake-mp4')})).status,409);
  assert.equal(approvalOf(d).state,'pending');
  const fresh=(await (await fetch(base+'/job/demo-abcdef01')).text()).match(/name="bundleHash" value="([a-f0-9]{64})"/)![1];
  assert.equal((await post({bundleHash:fresh})).status,303);assert.equal(approvalOf(d).state,'approved');
 }finally{srv.close()}
}));
