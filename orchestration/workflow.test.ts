import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {initializeRun,getRun,submitArtifact,sha256,type Manifest,type Kind} from './workflow.ts';
import type {AnalysisContract,Evaluation,ImprovementTasks,MetricAxis,QualityAxis} from './contracts.ts';

function fixture(t:{after:(fn:()=>void)=>void},urlOnly=false){
 const dir=mkdtempSync(join(tmpdir(),'workflow-test-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const reference=join(dir,'original.mp4');writeFileSync(reference,'unit-test bytes; not a decoded video');
 const root=join(dir,'run');let m=initializeRun(root,urlOnly?{url:'https://www.youtube.com/watch?v=example',rights:'test fixture'}:{reference,rights:'test fixture',sourceType:'synthetic'});
 const file=(path:string,content='fixture')=>{writeFileSync(join(root,path),content);return {path,sha256:sha256(join(root,path))};};
 const frame={id:'frame',...file('frame.png'),frame:0,description:'Mock frame metadata, no real decoding in unit test'};
 const ref=m.reference?{id:'reference',...m.reference,frame:null,description:'Reference bytes'}:null;
 const analysis:AnalysisContract={schema_version:'1',artifact_id:'analysis-1',source_id:m.source_id,source_url:m.source_url,source_type:m.source_type,analysis_status:urlOnly?'unavailable':'complete',video_metadata:urlOnly?{width:null,height:null,fps:null,frame_count:null,duration_seconds:null,has_audio:null}:{width:10,height:10,fps:1,frame_count:2,duration_seconds:2,has_audio:false},scenes:urlOnly?[]:[{id:'s1',start_frame:0,end_frame:1,description:null}],objects:urlOnly?[]:[{id:'o1',scene_id:'s1',description:null}],animations:[],timestamps:[],motion_parameters:[],visual_style:{description:null},evidence:ref?[ref,frame]:[],confidence:null,limitations:urlOnly?['URL-only unavailable']:[],rights_note:m.rights_note,lab_analysis_path:null};
 let n=0;
 const submit=(role:string,kind:Kind,data:unknown)=>{const path=join(root,`input-${n++}.json`);writeFileSync(path,JSON.stringify(data));m=submitArtifact(root,role,kind,path);return m;};
 const implementation=(revision:number)=>({artifact_id:`impl-${revision}`,reference_id:m.source_id,analysis_id:analysis.artifact_id,revision,files:[file(`source-${revision}.tsx`)],rationale:'fixture implementation',tasks_id:revision?`tasks-${revision-1}`:null});
 const render=(revision:number)=>({artifact_id:`render-${revision}`,reference_id:m.source_id,analysis_id:analysis.artifact_id,implementation_id:`impl-${revision}`,revision,video:file(`video-${revision}.mp4`)});
 const evaluation=(revision:number,error:number):Evaluation=>({schema_version:'1',artifact_id:`eval-${revision}`,reference_id:m.source_id,generated_video_id:`render-${revision}`,evaluation_version:revision+1,comparison_type:'direct_frames',metrics:(['position','size','color','start_time','end_time','displacement','speed_change','frame_change'] as MetricAxis[]).map(axis=>({id:axis,axis,value:error,unit:'normalized test error',threshold:1,pass:error<=1,basis:'measured',evidence_ids:['frame']})),qualitative_findings:(['naturalness','readability','consistency','tempo','clarity'] as QualityAxis[]).map(axis=>({axis,score:null,reason:'Not visually reviewed',frame_evidence_ids:[],reviewer:null})),differences:[],evidence:[ref!,frame,{id:'generated',path:`video-${revision}.mp4`,sha256:sha256(join(root,`video-${revision}.mp4`)),frame:null,description:'Rendered bytes'}],confidence:null,improvement_candidates:[],limitations:[],threshold_profile:'unit-test'});
 const tasks=(revision:number):ImprovementTasks=>({schema_version:'1',artifact_id:`tasks-${revision}`,evaluation_id:`eval-${revision}`,reference_id:m.source_id,generated_video_id:`render-${revision}`,tasks:[{task_id:`task-${revision}`,owner:'animation-refiner',priority:'P1',target_component:'Reproduction',problem:'error above threshold',evidence:['frame'],expected_behavior:'less error',acceptance_criteria:['error <= 1'],status:'ready'}]});
 const begin=()=>submit('video-analysis-director','analysis',analysis);
 const cycle=(revision:number,error:number)=>{submit(revision?'animation-refiner':'remotion-developer','implementation',implementation(revision));submit('render-engineer','render',render(revision));return submit('quality-evaluator','evaluation',evaluation(revision,error));};
 return {root,dir,analysis,file,submit,implementation,render,evaluation,tasks,begin,cycle,get m(){return m;}};
}

test('file handoff preserves all revisions, passes fidelity, waits for real quality then completes',t=>{
 const f=fixture(t);f.begin();assert.equal(f.cycle(0,3).status,'needs_tasks');
 f.submit('improvement-planner','tasks',f.tasks(0));assert.equal(f.cycle(1,0.5).status,'awaiting_quality');
 const reviewed=f.evaluation(1,0.5);reviewed.artifact_id='eval-reviewed';reviewed.qualitative_findings.forEach(q=>{q.score=4;q.reviewer='unit-test reviewer';q.frame_evidence_ids=['frame'];q.reason='Test of reviewed quality gate';});
 assert.equal(f.submit('quality-evaluator','evaluation',reviewed).status,'complete');
 const m=getRun(f.root);assert.equal(m.revision,1);assert.equal(m.artifacts.filter(a=>a.kind==='render').length,2);assert.equal(m.history.length,m.sequence+1);
 assert.throws(()=>f.submit('quality-evaluator','evaluation',reviewed),/Wrong stage/);
});
test('URL-only reference is recorded honestly and stops without rendering',t=>{
 const f=fixture(t,true);assert.equal(f.begin().status,'stop_inconclusive');assert.throws(()=>f.submit('remotion-developer','implementation',f.implementation(0)),/Wrong stage/);
});
test('wrong role, stale reference, duplicate ID, missing code and out of order are rejected',t=>{
 const f=fixture(t);assert.throws(()=>f.submit('quality-evaluator','analysis',f.analysis),/Wrong stage/);
 const bad={...f.analysis,source_id:'wrong'};assert.throws(()=>f.submit('video-analysis-director','analysis',bad),/source or rights/);f.begin();
 assert.throws(()=>f.submit('render-engineer','render',f.render(0)),/Wrong stage/);
 assert.throws(()=>f.submit('remotion-developer','implementation',{...f.implementation(0),artifact_id:'analysis-1'}),/Duplicate artifact/);
 assert.throws(()=>f.submit('remotion-developer','implementation',{...f.implementation(0),files:[]}),/snapshots required/);
 assert.equal(getRun(f.root).status,'awaiting_implementation');
});
test('stale evaluation/version/tasks and missing evidence bindings cannot advance',t=>{
 const f=fixture(t);f.begin();f.submit('remotion-developer','implementation',f.implementation(0));f.submit('render-engineer','render',f.render(0));
 const e=f.evaluation(0,3);assert.throws(()=>f.submit('quality-evaluator','evaluation',{...e,generated_video_id:'old-render'}),/references or version/);
 assert.throws(()=>f.submit('quality-evaluator','evaluation',{...e,evaluation_version:2}),/references or version/);
 assert.throws(()=>f.submit('quality-evaluator','evaluation',{...e,evidence:e.evidence.filter(x=>x.id!=='generated')}),/bind the reference/);
 f.submit('quality-evaluator','evaluation',e);
 assert.throws(()=>f.submit('improvement-planner','tasks',{...f.tasks(0),evaluation_id:'old-evaluation'}),/stale evaluation/);
 const tasks=f.tasks(0);tasks.tasks[0]!.evidence=['missing'];assert.throws(()=>f.submit('improvement-planner','tasks',tasks),/current evaluation evidence/);
});
test('no improvement or regression stops the loop without retry',t=>{
 const f=fixture(t);f.begin();f.cycle(0,3);f.submit('improvement-planner','tasks',f.tasks(0));assert.equal(f.cycle(1,3).status,'stop_no_improvement');
 assert.throws(()=>f.submit('improvement-planner','tasks',f.tasks(1)),/Wrong stage/);
});
test('two improvements maximum even if each iteration improves',t=>{
 const f=fixture(t);f.begin();f.cycle(0,5);f.submit('improvement-planner','tasks',f.tasks(0));f.cycle(1,4);f.submit('improvement-planner','tasks',f.tasks(1));assert.equal(f.cycle(2,3).status,'stop_limit');
 assert.equal(getRun(f.root).artifacts.filter(a=>a.kind==='render').length,3);
});
test('unknown metrics never pass fidelity and cannot cause a retry',t=>{
 const f=fixture(t);f.begin();f.submit('remotion-developer','implementation',f.implementation(0));f.submit('render-engineer','render',f.render(0));
 const e=f.evaluation(0,0);e.metrics[0]={...e.metrics[0]!,value:null,pass:null,basis:'unknown',evidence_ids:[]};assert.equal(f.submit('quality-evaluator','evaluation',e).status,'stop_inconclusive');
});
test('tampered code, reference, evidence and manifest fail hash/history checks',t=>{
 const f=fixture(t);f.begin();f.submit('remotion-developer','implementation',f.implementation(0));
 writeFileSync(join(f.root,'source-0.tsx'),'changed');assert.throws(()=>getRun(f.root),/Hash mismatch/);writeFileSync(join(f.root,'source-0.tsx'),'fixture');
 writeFileSync(join(f.root,'frame.png'),'changed');assert.throws(()=>getRun(f.root),/Hash mismatch/);writeFileSync(join(f.root,'frame.png'),'fixture');
 const m=JSON.parse(readFileSync(join(f.root,'manifest.json'),'utf8'));m.status='complete';writeFileSync(join(f.root,'manifest.json'),JSON.stringify(m));assert.throws(()=>getRun(f.root),/differs from immutable history/);
});
test('absolute, parent traversal and symlink evidence rejected; external artifact rejected',t=>{
 const f=fixture(t);const bad=structuredClone(f.analysis);bad.evidence[1]!.path='../original.mp4';assert.throws(()=>f.submit('video-analysis-director','analysis',bad),/unsafe path/);
 bad.evidence[1]!.path=join(f.dir,'original.mp4');assert.throws(()=>f.submit('video-analysis-director','analysis',bad),/unsafe path/);
 symlinkSync(join(f.root,'frame.png'),join(f.root,'linked.png'));bad.evidence[1]!.path='linked.png';assert.throws(()=>f.submit('video-analysis-director','analysis',bad),/Symlink/);
 const external=join(f.dir,'outside.json');writeFileSync(external,JSON.stringify(f.analysis));assert.throws(()=>submitArtifact(f.root,'video-analysis-director','analysis',external),/Unsafe relative path/);
});
test('single-writer lock prevents race and is never removed by a second writer',t=>{
 const f=fixture(t);mkdirSync(join(f.root,'.writer-lock'));assert.throws(()=>f.begin(),/Run is locked/);assert.throws(()=>getRun(f.root),/Run is locked/);
 assert.throws(()=>f.begin(),/Run is locked/);rmSync(join(f.root,'.writer-lock'),{recursive:true});assert.equal(f.begin().status,'awaiting_implementation');
});
test('threshold changes cannot fabricate progress and review cannot alter metrics',t=>{
 const f=fixture(t);f.begin();f.cycle(0,3);f.submit('improvement-planner','tasks',f.tasks(0));f.submit('animation-refiner','implementation',f.implementation(1));f.submit('render-engineer','render',f.render(1));
 const e=f.evaluation(1,2);e.metrics.forEach(m=>{m.threshold=3;m.pass=true;});assert.throws(()=>f.submit('quality-evaluator','evaluation',e),/comparable/);
 f.submit('quality-evaluator','evaluation',f.evaluation(1,0.5));const review=f.evaluation(1,0.1);review.artifact_id='bad-review';assert.throws(()=>f.submit('quality-evaluator','evaluation',review),/preserve measured/);
});
test('init refuses overwrites, rights omissions and inconsistent source type',t=>{
 const f=fixture(t);assert.throws(()=>initializeRun(f.root,{reference:join(f.dir,'original.mp4'),rights:'fixture'}),/EEXIST/);
 assert.throws(()=>initializeRun(join(f.dir,'bad'),{url:'https://www.youtube.com/watch?v=x',rights:''}),/Nonempty/);
 assert.throws(()=>initializeRun(join(f.dir,'bad'),{url:'https://www.youtube.com/watch?v=x',rights:'fixture',sourceType:'local'}),/source type/);
});
test('CLI validates artifacts and rejects unexpected arguments without mutation',t=>{
 const f=fixture(t);const path=join(f.root,'contract.json');writeFileSync(path,JSON.stringify(f.analysis));
 const cli=new URL('./cli.ts',import.meta.url).pathname;
 const result=spawnSync(process.execPath,[cli,'validate','analysis',path],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/"valid": true/);
 const invalid=spawnSync(process.execPath,[cli,'status',f.root,'--unused','x'],{encoding:'utf8'});assert.equal(invalid.status,1);assert.match(invalid.stderr,/Unknown option/);
});
