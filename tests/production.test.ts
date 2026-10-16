// 本人が担う工程（T104、ADR-018）。題材の選択→考察→台本承認→制作→完成動画の承認。
// 記録者: デモ案件はtest-agent（人ではない）。本番形式の試験は一時ディレクトリだけで、架空の人名「テスト利用者」を使う（実在の本人の入力ではない）。
import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync,readFileSync,writeFileSync,unlinkSync,mkdirSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {createHash} from 'node:crypto';import {createServer} from 'node:http';import type {AddressInfo} from 'node:net';import {spawnSync} from 'node:child_process';
import {createProject,selectTopic,addReflection,attachScript,reviewScript,projectState,assertRenderable,linkRender,injectReflection,splitCues,isAgentName,modeOf,readScript,authorshipLabel,REFLECTION_MAX_CHARS,READ_CHARS_PER_SECOND} from '../src/production.ts';
import {approvalOf,recordReview,publishReadiness,workflowStatus,reviewBundle} from '../src/review.ts';
import {listJobs} from '../src/jobs.ts';
import {lintPlan} from '../src/lint.ts';
import {loadPlan,validatePlanV2,REFLECTION_PLACEHOLDER} from '../src/plan.ts';
import {buildMetadata} from '../src/metadata.ts';
import {createHandler} from '../src/commands/serve.ts';
const sha=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
const candidates=()=>JSON.parse(readFileSync('fixtures/topic-candidates-demo.json','utf8'));
const draft=()=>JSON.parse(readFileSync('fixtures/draft-general-demo.json','utf8'));
const T='test-agent';
const H='テスト利用者';
const REFL='値札の変化は目に入りやすいので、家計全体と分けて見るようにしたいと考えました。これは試験用の文です。';
const chars=(t:string)=>[...t].length;
function tmp(fn:(root:string)=>Promise<void>|void){return async()=>{const root=mkdtempSync(join(tmpdir(),'prod-'));try{await fn(root)}finally{rmSync(root,{recursive:true,force:true})}}}
// 承認済みの台本まで進める（demo=falseは本番形式。一時ディレクトリでのみ使う）。
function ready(root:string,demo=true){const by=demo?T:H;const id=createProject(root,candidates(),{demo,by:T});selectTopic(root,id,'price-index',by);addReflection(root,id,REFL,by);const s=attachScript(root,id,draft(),T,{draft:'fixtures/draft-general-demo.json'});reviewScript(root,id,'approve',s.hash,'',by);return {id,s,by}}
// 制作ジョブ（動画の代わりに小さなファイル）を作り、案件の現在の台本に結び付ける。
function fakeRender(root:string,id:string,jobId:string){
 const st=projectState(root,id);const d=join(root,jobId);mkdirSync(d,{recursive:true});const mp4=Buffer.from('fake-mp4-'+jobId);writeFileSync(join(d,'sample.mp4'),mp4);writeFileSync(join(d,'subtitles.vtt'),'WEBVTT\n');
 writeFileSync(join(d,'thumbnail-a.png'),Buffer.from('fake-thumb-a'));writeFileSync(join(d,'thumbnail-b.png'),Buffer.from('fake-thumb-b'));writeFileSync(join(d,'thumbnail-c.png'),Buffer.from('fake-thumb-c'));
 writeFileSync(join(d,'metadata.json'),JSON.stringify(buildMetadata(readScript(root,id,st.script!),{sources:'',stance:''})));
 writeFileSync(join(d,'job.json'),JSON.stringify({id:jobId,kind:'production-job',status:'completed',createdAt:new Date().toISOString(),inputHash:'in',outputHash:sha(mp4),mode:st.mode,project:id,scriptHash:st.script!.hash,scriptVersion:st.script!.version,events:[],thumbnails:[{file:'thumbnail-a.png',ok:true,issues:[]},{file:'thumbnail-b.png',ok:true,issues:[]},{file:'thumbnail-c.png',ok:true,issues:[]}],thumbnailQuality:{ok:true,canProceed:true,allPassed:true,selectedVariant:'a',reasons:[]}}));
 linkRender(root,id,jobId,st.script!.hash,st.script!.version);return d;
}
const approveVideo=(d:string,by=T)=>recordReview(d,'approve','',approvalOf(d).currentHash!,by);

test('題材候補の検証と案件の作成（デモ/本番のID・最初の工程）',tmp(root=>{
 for(const bad of [{schema:1,candidates:[]},{schema:1,candidates:[{id:'a',title:'t',hook:'h',concept:'c'},{id:'a',title:'t',hook:'h',concept:'c'}]},{schema:1,candidates:[{id:'a',title:'',hook:'h',concept:'c'}]},{schema:1,candidates:[{id:'a',title:'t',hook:'h',concept:'c',sources:[{title:'x',url:'http://example.org'}]}]},{candidates:[{id:'a',title:'t',hook:'h',concept:'c'}]}])assert.throws(()=>createProject(root,bad,{demo:true,by:T}),/候補/);
 const d=createProject(root,candidates(),{demo:true,by:T});assert.match(d,/^production-demo-[a-f0-9]{8}$/);
 const p=createProject(root,candidates(),{by:T});assert.match(p,/^production-[a-f0-9]{8}$/);
 const st=projectState(root,d);assert.equal(st.mode,'demo');assert.equal(st.stage,'topic-selection');assert.match(st.missing[0],/題材が未選択/);assert.equal(projectState(root,p).mode,'production');
}));

test('選択: 候補外のIDを拒否、未選択のまま考察へ進めない',tmp(root=>{
 const id=createProject(root,candidates(),{demo:true,by:T});
 assert.throws(()=>addReflection(root,id,REFL,T),/先に題材/);
 assert.throws(()=>selectTopic(root,id,'not-listed',T),/候補にない/);
 selectTopic(root,id,'price-index',T);assert.equal(projectState(root,id).stage,'reflection');
}));

test('考察: 空白・未入力の目印・長すぎる文を拒否。整形版は本人執筆の版が元で、同一扱いしない',tmp(root=>{
 const id=createProject(root,candidates(),{demo:true,by:T});selectTopic(root,id,'price-index',T);
 assert.throws(()=>addReflection(root,id,'  \n　',T),/空/);
 assert.throws(()=>addReflection(root,id,`考察 ${REFLECTION_PLACEHOLDER}`,T),/目印/);
 assert.throws(()=>addReflection(root,id,'あ'.repeat(REFLECTION_MAX_CHARS+1),T),/長すぎる/);
 assert.throws(()=>addReflection(root,id,REFL,T,{assistedFrom:1}),/本人執筆/);
 const v1=addReflection(root,id,REFL,T);assert.equal(v1.authorship,'self');assert.equal(v1.sha256,sha(REFL));
 const v2=addReflection(root,id,REFL.replace('考えました','考えています'),'Claude Code',{assistedFrom:1});assert.deepEqual([v2.authorship,v2.basedOn],['assisted',1]);
 assert.throws(()=>addReflection(root,id,REFL,'Claude Code',{assistedFrom:2}),/本人執筆/);
 assert.equal(projectState(root,id).reflection!.authorship,'assisted');
 assert.equal(authorshipLabel('production',v1),'本人執筆');assert.match(authorshipLabel('production',v2),/整形版（元v1/);assert.match(authorshipLabel('demo',v1),/デモ用の仮文/);
}));

test('本番の案件では本人の工程をエージェント名で記録できない（デモはtest-agentで可）',tmp(root=>{
 assert.ok(['test-agent','Claude Code','codex','GPT-6','gemini','helper-bot','エージェント'].every(isAgentName));assert.ok(!isAgentName(H));
 const id=createProject(root,candidates(),{by:T});
 assert.throws(()=>selectTopic(root,id,'price-index','test-agent'),/エージェント名/);assert.throws(()=>selectTopic(root,id,'price-index','Claude Code'),/エージェント名/);
 selectTopic(root,id,'price-index',H);
 assert.throws(()=>addReflection(root,id,REFL,'codex'),/エージェント名/);
 addReflection(root,id,REFL,H);addReflection(root,id,REFL+'（整形）','Claude Code',{assistedFrom:1});
 const s=attachScript(root,id,draft(),'Claude Code');
 assert.throws(()=>reviewScript(root,id,'approve',s.hash,'','claude'),/エージェント名/);
 reviewScript(root,id,'approve',s.hash,'',H);assert.equal(projectState(root,id).scriptState,'approved');
}));

test('台本: 考察が未入力なら作れない、考察の場面はちょうど1つ、本人の考察がそのまま入る',tmp(root=>{
 const id=createProject(root,candidates(),{demo:true,by:T});
 assert.throws(()=>attachScript(root,id,draft(),T),/題材が未選択/);
 selectTopic(root,id,'price-index',T);
 assert.throws(()=>attachScript(root,id,draft(),T),/考察が未入力/);
 addReflection(root,id,REFL,T);
 assert.throws(()=>attachScript(root,id,JSON.parse(readFileSync('fixtures/sample-general.json','utf8')),T),/ちょうど1つ/);
 const two=draft();two.scenes.splice(6,0,{...two.scenes[5]});assert.throws(()=>attachScript(root,id,two,T),/ちょうど1つ/);
 const s=attachScript(root,id,draft(),T,{draft:'fixtures/draft-general-demo.json'});
 const plan=readScript(root,id,s);const scene=plan.scenes.find(x=>x.role==='reflection')!;
 assert.equal(scene.narration,REFL);assert.equal(scene.cues.map(c=>c.text).join(''),REFL);assert.ok(scene.cues.every(c=>chars(c.text)<=55));
 assert.equal(scene.cues.reduce((n,c)=>n+c.seconds,0),scene.seconds);assert.equal(scene.seconds,Math.max(4,Math.ceil(chars(REFL)/READ_CHARS_PER_SECOND)));
 assert.deepEqual(plan.production,{mode:'demo',project:id});assert.equal(lintPlan(plan).ok,true);
 const st=projectState(root,id);assert.equal(st.stage,'script-review');assert.equal(st.scriptState,'pending');assert.match(st.missing.join(),/台本が未承認/);
}));

test('考察の分割と尺: 長い文は55字以内のcueへ、本文は変えない',()=>{
 const long='物価のニュースを見ても、自分の生活とのつながりが分からなかったので、まずよく買う品を三つ選んで値段を記録することから始めてみようと考えました。記録してみると、上がった品と変わらない品があることに気づきました。全体の指数と自分の買い物は同じではないと分かりました。';
 const cues=splitCues(long);assert.ok(cues.length>=3);assert.ok(cues.every(c=>chars(c)<=55&&chars(c)>0));assert.equal(cues.join(''),long);
 const plan=injectReflection(draft(),long);const s=plan.scenes.find((x:any)=>x.role==='reflection');
 assert.equal(s.seconds,Math.ceil(chars(long)/READ_CHARS_PER_SECOND));assert.equal(validatePlanV2(plan).scenes.length,draft().scenes.length);
 assert.throws(()=>injectReflection({scenes:[]},long),/ちょうど1つ/);
});

test('下書きのまま（考察が未入力）はlintのerrorで制作しない',()=>{
 const r=lintPlan(loadPlan(draft()));assert.equal(r.ok,false);assert.ok(r.findings.some(f=>f.rule==='reflection-missing'&&f.level==='error'));
});

test('考察に禁止表現・出典のない数値があれば、台本を確認に回さない',tmp(root=>{
 const id=createProject(root,candidates(),{demo:true,by:T});selectTopic(root,id,'price-index',T);
 addReflection(root,id,'この方法なら必ず儲かると思いました。',T);assert.throws(()=>attachScript(root,id,draft(),T),/安全検査/);
 addReflection(root,id,'物価が20%上がると困ると思いました。',T);assert.throws(()=>attachScript(root,id,draft(),T),/unsourced-number/);
 assert.equal(projectState(root,id).scriptState,'none');
}));

test('台本の確認: 版の不一致・理由なしの差戻しを拒否。差戻し中は制作できず、承認後に制作できる',tmp(root=>{
 const id=createProject(root,candidates(),{demo:true,by:T});selectTopic(root,id,'price-index',T);addReflection(root,id,REFL,T);const s=attachScript(root,id,draft(),T);
 assert.throws(()=>reviewScript(root,id,'approve',sha('other'),'',T),/異なる/);
 assert.throws(()=>reviewScript(root,id,'reject',s.hash,' ',T),/理由/);
 reviewScript(root,id,'reject',s.hash,'考察の位置を前に',T);
 const st=projectState(root,id);assert.equal(st.scriptState,'rejected');assert.equal(st.stage,'script-review');
 assert.throws(()=>assertRenderable(root,id),/差戻し中/);
 reviewScript(root,id,'approve',s.hash,'',T);assert.equal(projectState(root,id).stage,'render');assert.equal(assertRenderable(root,id).state.script!.hash,s.hash);
}));

test('承認後の変更で台本承認が失効: 考察の更新・題材の変更・台本ファイルの変更/欠落',tmp(root=>{
 {const {id,s}=ready(root);addReflection(root,id,REFL+'追記。',T);const st=projectState(root,id);assert.equal(st.scriptState,'stale');assert.match(st.scriptReason,/考察が更新/);assert.throws(()=>assertRenderable(root,id),/考察が更新/);
  assert.throws(()=>reviewScript(root,id,'approve',s.hash,'',T),/確認できる台本がない/);
  const s2=attachScript(root,id,draft(),T);assert.notEqual(s2.hash,s.hash);const st2=projectState(root,id);assert.equal(st2.scriptState,'pending');assert.match(st2.scriptReason,/以前の承認は失効/);
  assert.equal(readScript(root,id,s2).scenes.find(x=>x.role==='reflection')!.narration,REFL+'追記。');}
 {const {id}=ready(root);selectTopic(root,id,'real-wage',T);assert.equal(projectState(root,id).scriptState,'stale');assert.match(projectState(root,id).scriptReason,/題材/)}
 {const {id,s}=ready(root);writeFileSync(join(root,id,s.file),readFileSync(join(root,id,s.file),'utf8').replace('ニュースの','ネットの'));assert.equal(projectState(root,id).scriptState,'broken');assert.throws(()=>assertRenderable(root,id),/一致しない/)}
 {const {id,s}=ready(root);unlinkSync(join(root,id,s.file));assert.equal(projectState(root,id).scriptState,'broken');assert.equal(projectState(root,id).stage,'script')}
}));

test('運用記録（events・メモ・更新時刻）の追記だけでは台本承認は失効しない',tmp(root=>{
 const {id,s}=ready(root);const path=join(root,id,'job.json');const j=JSON.parse(readFileSync(path,'utf8'));
 writeFileSync(path,JSON.stringify({...j,events:[...j.events,'viewed','note-added'],note:'運用メモ',updatedAt:new Date().toISOString()}));
 const st=projectState(root,id);assert.equal(st.scriptState,'approved');assert.equal(st.script!.hash,s.hash);
}));

test('制作の開始条件: 未選択・考察未入力・台本未作成を不足として並べて拒否する',tmp(root=>{
 const id=createProject(root,candidates(),{demo:true,by:T});
 assert.throws(()=>assertRenderable(root,id),(e:any)=>/題材が未選択/.test(e.message)&&/考察が未入力/.test(e.message)&&/台本が未作成/.test(e.message));
}));

test('完成動画: 台本の版に結び付き、台本が変わると失効し承認も拒否する',tmp(root=>{
 const {id,s}=ready(root);const d=fakeRender(root,id,'price-index-draft-aaaaaaaa');
 const a=approvalOf(d);assert.equal(a.state,'pending');assert.equal(a.bundle!.script,s.hash);assert.equal(a.mode,'demo');assert.equal(a.project,id);
 assert.equal(workflowStatus(root,id).stage,'video-review');
 approveVideo(d);assert.equal(approvalOf(d).state,'approved');assert.equal(workflowStatus(root,id).stage,'done');
 addReflection(root,id,REFL+'追記。',T);const s2=attachScript(root,id,draft(),T);reviewScript(root,id,'approve',s2.hash,'',T);
 const old=approvalOf(d);assert.equal(old.state,'expired');assert.match(old.reason,/台本が変わった/);
 assert.throws(()=>approveVideo(d),/承認できない/);
 const w=workflowStatus(root,id);assert.equal(w.stage,'render');assert.match(w.missing.join(),/未制作/);
}));

test('デモの承認は本番に転用できない。旧ジョブ（modeなし）もデモ扱い',tmp(root=>{
 const {id}=ready(root);const d=fakeRender(root,id,'price-index-draft-bbbbbbbb');approveVideo(d);
 const r=publishReadiness(d);assert.equal(r.ok,false);assert.ok(r.reasons.some(x=>/デモ/.test(x)));
 const path=join(d,'job.json');writeFileSync(path,JSON.stringify({...JSON.parse(readFileSync(path,'utf8')),mode:'production'}));
 assert.equal(approvalOf(d).state,'expired');assert.match(approvalOf(d).reason,/デモ\/本番/);assert.equal(publishReadiness(d).ok,false);
 const legacy=join(root,'old-demo-cccccccc');mkdirSync(legacy);const mp4=Buffer.from('x');writeFileSync(join(legacy,'sample.mp4'),mp4);writeFileSync(join(legacy,'job.json'),JSON.stringify({id:'old-demo-cccccccc',status:'completed',createdAt:new Date().toISOString(),inputHash:'in',outputHash:sha(mp4)}));
 assert.equal(modeOf(JSON.parse(readFileSync(join(legacy,'job.json'),'utf8'))),'demo');assert.ok(!('script' in reviewBundle(legacy)),'既存ジョブの一式に台本の版を加えない');
 approveVideo(legacy);assert.equal(approvalOf(legacy).state,'approved');assert.ok(publishReadiness(legacy).reasons.some(x=>/旧ジョブ/.test(x)));
 const list=listJobs(root);assert.equal(list.find(j=>j.id===id)!.mode,'demo');assert.equal(list.find(j=>j.id==='old-demo-cccccccc')!.mode,'demo');
}));

test('本番形式（一時ディレクトリ・架空の人名）: 全工程と動画承認で公開前判定が可。動画承認もエージェント名は拒否',tmp(root=>{
 const {id}=ready(root,false);const d=fakeRender(root,id,'price-index-draft-dddddddd');
 assert.equal(approvalOf(d).mode,'production');assert.equal(publishReadiness(d).ok,false);
 assert.throws(()=>approveVideo(d,'claude'),/エージェント名/);
 approveVideo(d,H);assert.deepEqual(publishReadiness(d),{ok:true,reasons:[]});
}));

test('確認画面（HTTP）: 案件ページ、選択・考察・台本承認の送信、古い版と本番のエージェント名は409',tmp(async root=>{
 const id=createProject(root,candidates(),{demo:true,by:T});const prod=createProject(root,candidates(),{by:T});
 const handler=createHandler(root);const srv=createServer((req,res)=>{req.headers.host='127.0.0.1:4173';handler(req,res)});await new Promise<void>(r=>srv.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
 const post=(pid:string,sub:string,fields:Record<string,string>,headers:Record<string,string>={})=>fetch(`${base}/job/${pid}/${sub}`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',...headers},body:new URLSearchParams(fields).toString(),redirect:'manual'});
 try{
  const page=await (await fetch(`${base}/job/${id}`)).text();assert.match(page,/題材の選択待ち/);assert.match(page,/デモ案件/);assert.match(page,/ニュースの「物価」と自分の買い物/);
  assert.equal((await post(id,'select',{candidateId:'price-index',by:T},{Origin:'https://evil.example'})).status,403);
  assert.equal((await post(id,'select',{candidateId:'nope',by:T})).status,409);
  assert.equal((await post(id,'select',{candidateId:'price-index',by:T})).status,303);
  assert.equal((await post(id,'reflection',{text:'<script>alert(1)</script>'+REFL,by:T})).status,303);
  const page2=await (await fetch(`${base}/job/${id}`)).text();assert.ok(page2.includes('&lt;script&gt;')&&!page2.includes('<script>alert'));
  addReflection(root,id,REFL,T);const s=attachScript(root,id,draft(),T);
  const page3=await (await fetch(`${base}/job/${id}`)).text();const shown=page3.match(/name="scriptHash" value="([a-f0-9]{64})"/)![1];assert.equal(shown,s.hash);assert.match(page3,/本人の考察/);
  assert.equal((await post(id,'script-review',{decision:'approve',scriptHash:sha('old'),by:T})).status,409);
  assert.equal((await post(id,'script-review',{decision:'approve',scriptHash:shown,by:T})).status,303);assert.equal(projectState(root,id).scriptState,'approved');
  const denied=await post(prod,'select',{candidateId:'price-index',by:'Claude Code'});assert.equal(denied.status,409);assert.match(await denied.text(),/エージェント名/);
  const d=fakeRender(root,id,'price-index-draft-eeeeeeee');const vpage=await (await fetch(`${base}/job/price-index-draft-eeeeeeee`)).text();assert.match(vpage,/デモ/);assert.match(vpage,/公開前の判定: 不可/);
  const list=await (await fetch(`${base}/`)).text();assert.match(list,/制作案件/);assert.match(list,/完成動画の確認待ち/);
  assert.equal(approvalOf(d).state,'pending');
 }finally{srv.close()}
}));

test('CLI: produce の入口で、未入力なら制作を拒否し不足を表示する',tmp(root=>{
 const cli=resolve('src/cli.ts');const run=(...a:string[])=>spawnSync(process.execPath,[cli,'produce',...a],{cwd:root,encoding:'utf8'});
 const made=run('new','--candidates',resolve('fixtures/topic-candidates-demo.json'),'--by',T,'--demo');assert.equal(made.status,0,made.stderr);
 const id=made.stdout.match(/作成: (production-demo-[a-f0-9]{8})/)![1];assert.match(made.stdout,/題材の選択待ち/);
 const refused=run('render',id);assert.equal(refused.status,1);assert.match(refused.stderr,/制作を開始できない/);assert.match(refused.stderr,/題材が未選択/);assert.match(refused.stderr,/考察が未入力/);
 assert.equal(run('select',id,'--candidate','nope','--by',T).status,1);
 assert.equal(run('select',id,'--candidate','price-index','--by',T).status,0);
 assert.match(run('render',id).stderr,/考察が未入力/);
 assert.equal(run('reflection',id,'--text',REFL,'--by',T).status,0);
 const sc=run('script',id,'--plan',resolve('fixtures/draft-general-demo.json'),'--by',T);assert.equal(sc.status,0,sc.stderr);const hash=sc.stdout.match(/台本の版: ([a-f0-9]{64})/)![1];
 const r1=run('render',id);assert.equal(r1.status,1);assert.match(r1.stderr,/台本が未承認/);
 assert.equal(run('script-review',id,'approve','--hash',hash,'--by',T).status,1);
 assert.equal(run('fact-check',id,'--by',T).status,0);
 assert.equal(run('script-review',id,'approve','--hash',hash,'--by',T).status,0);
 const st=run('status',id);assert.match(st.stdout,/制作待ち/);assert.match(st.stdout,/デモ用の仮文（本人の考察ではない）/);assert.doesNotMatch(st.stdout,/本人執筆/);
 assert.match(run('render',id,'--plan','x.json').stderr,/--plan は指定できない/);
}));

test('T118: produce script は --plan 省略時に確定構成（fixtures/draft-price-index.json）を既定として使う',tmp(root=>{
 const cli=resolve('src/cli.ts');const run=(...a:string[])=>spawnSync(process.execPath,[cli,'produce',...a],{cwd:root,encoding:'utf8'});
 const made=run('new','--candidates',resolve('fixtures/topic-candidates-demo.json'),'--by',T,'--demo');assert.equal(made.status,0);
 const id=made.stdout.match(/作成: (production-demo-[a-f0-9]{8})/)![1];
 assert.equal(run('select',id,'--candidate','price-index','--by',T).status,0);
 assert.equal(run('reflection',id,'--text',REFL,'--by',T).status,0);
 const sc=run('script',id,'--by',T);assert.equal(sc.status,0,sc.stderr);
 const hash=sc.stdout.match(/台本の版: ([a-f0-9]{64})/)![1];
 const p=readScript(join(root,'outputs'),id,projectState(join(root,'outputs'),id).script!);
 assert.deepEqual([...new Set(p.scenes.map(s=>s.chapter))],['導入','身近な例','仕組み','本人の考察','活かし方']);
 assert.equal(p.scenes.filter(s=>s.role==='reflection').length,1);
 assert.ok(p.scenes.some(s=>s.diagram.type==='meter'));
 assert.equal(run('fact-check',id,'--by',T).status,0);
 assert.equal(run('script-review',id,'approve','--hash',hash,'--by',T).status,0);
 assert.equal(projectState(join(root,'outputs'),id).stage,'render');
}));

