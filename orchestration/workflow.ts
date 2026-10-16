import {createHash, randomUUID} from 'node:crypto';
import {copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync, constants} from 'node:fs';
import {dirname, isAbsolute, relative, resolve} from 'node:path';
import {parse,type Evaluation,safeRelativePath} from './contracts.ts';

export type Kind = 'analysis' | 'implementation' | 'render' | 'evaluation' | 'tasks';
type FileRef = {path:string;sha256:string};
type Artifact = FileRef & {kind:Kind;artifact_id:string;revision:number;files:FileRef[]};
export type Manifest = {
  schema_version:'1'; run_id:string; source_id:string; source_type:'local'|'synthetic'|'youtube';
  source_url:string|null; rights_note:string; reference:FileRef|null;
  revision:number; status:string; next_role:string|null; sequence:number;
  artifacts:Artifact[]; history:FileRef[];
};
export type Implementation = {artifact_id:string;reference_id:string;analysis_id:string;revision:number;files:FileRef[];rationale:string;tasks_id:string|null};
export type Render = {artifact_id:string;reference_id:string;analysis_id:string;implementation_id:string;revision:number;video:FileRef};
const workflow = JSON.parse(readFileSync(new URL('./workflow.json',import.meta.url),'utf8')) as {
 max_improvements:number;quality_minimum:number;comparison_epsilon:number;stages:Record<string,{role:string;kind:Kind}>;
};
export function sha256(path:string):string {return createHash('sha256').update(readFileSync(path)).digest('hex');}
function json(path:string):unknown {return JSON.parse(readFileSync(path,'utf8'));}
function encode(value:unknown):string {return JSON.stringify(value,null,2)+'\n';}
function fail(message:string):never {throw new Error(message);}
/** Reject symlinks anywhere, even ones that currently point inside the run. */
export function resolveRunFile(root:string,path:string):string {
 if (!safeRelativePath(path) || isAbsolute(path)) fail(`Unsafe relative path: ${path}`);
 const base=realpathSync(root); let current=base;
 for(const part of path.split('/')) {current=resolve(current,part); if(lstatSync(current).isSymbolicLink()) fail(`Symlink is not allowed: ${path}`);}
 const actual=realpathSync(current);
 if(relative(base,actual).startsWith('..') || !lstatSync(actual).isFile()) fail(`Not a run file: ${path}`);
 return actual;
}
function verifyFile(root:string,ref:FileRef):void {
 if(!ref || typeof ref.path!=='string' || !/^[a-f0-9]{64}$/.test(ref.sha256)) fail('Invalid file reference');
 if(sha256(resolveRunFile(root,ref.path))!==ref.sha256) fail(`Hash mismatch: ${ref.path}`);
}
function object(value:unknown):Record<string,unknown> {if(!value||typeof value!=='object'||Array.isArray(value)) fail('Object required');return value as Record<string,unknown>;}
function text(value:unknown):string {if(typeof value!=='string'||!value.trim()) fail('Nonempty string required');return value;}
function strictKeys(value:Record<string,unknown>,keys:string[]):void {if(Object.keys(value).length!==keys.length||keys.some(k=>!(k in value))) fail(`Required exact fields: ${keys.join(', ')}`);}
function latest(m:Manifest,kind:Kind):Artifact {const item=m.artifacts.findLast(x=>x.kind===kind); if(!item) fail(`Missing ${kind}`);return item;}
function checkedManifest(root:string):Manifest {
 const m=json(resolve(root,'manifest.json')) as Manifest;
 if(m.schema_version!=='1'||!Number.isInteger(m.sequence)||m.sequence<0||!Array.isArray(m.history)||m.history.length!==m.sequence+1) fail('Invalid manifest');
 for(const h of m.history) verifyFile(root,h);
 const saved=json(resolveRunFile(root,m.history.at(-1)!.path)) as Manifest;
 // Each snapshot excludes its own hash to avoid a circular digest.
 if(encode({...m,history:m.history.slice(0,-1)})!==encode(saved)) fail('Manifest differs from immutable history');
 if(m.reference) verifyFile(root,m.reference);
 for(const a of m.artifacts) {verifyFile(root,a);for(const f of a.files) verifyFile(root,f);}
 return m;
}
function commit(root:string,m:Manifest):Manifest {
 const path=`history/${String(m.sequence).padStart(4,'0')}.json`;
 writeFileSync(resolve(root,path),encode(m),{flag:'wx'});
 m.history.push({path,sha256:sha256(resolve(root,path))});
 const temp=resolve(root,`.manifest-${randomUUID()}.tmp`);
 writeFileSync(temp,encode(m),{flag:'wx'});renameSync(temp,resolve(root,'manifest.json'));return m;
}
function lock<T>(root:string,fn:()=>T):T {
 const dir=resolve(root,'.writer-lock');
 try {mkdirSync(dir);} catch {fail('Run is locked. Confirm no writer is active; investigate interruption before manually removing .writer-lock.');}
 try {return fn();}finally{rmSync(dir,{recursive:true});}
}
export function initializeRun(root:string,options:{reference?:string;url?:string;rights:string;sourceType?:'local'|'synthetic'|'youtube'}):Manifest {
 text(options.rights);
 if(!options.reference&&!options.url) fail('Local reference or URL required');
 if(options.url) {const u=new URL(options.url);if(u.protocol!=='https:'||!['youtube.com','www.youtube.com','youtu.be'].includes(u.hostname)) fail('Only HTTPS YouTube URLs accepted');}
 if(options.sourceType==='synthetic'&&!options.reference) fail('Synthetic source requires local reference');
 if(options.sourceType==='youtube'&&!options.url) fail('YouTube source requires URL');
 if(options.sourceType&&options.sourceType!=='youtube'&&options.url) fail('URL must use YouTube source type');
 if(options.reference&&!lstatSync(options.reference).isFile()) fail('Reference must be a file');
 mkdirSync(dirname(resolve(root)),{recursive:true});mkdirSync(root);
 return lock(root,()=>{
  mkdirSync(resolve(root,'source'));mkdirSync(resolve(root,'history'));mkdirSync(resolve(root,'artifacts'));
  let reference:FileRef|null=null;
  if(options.reference){const path='source/reference.mp4';copyFileSync(options.reference,resolve(root,path),constants.COPYFILE_EXCL);reference={path,sha256:sha256(resolve(root,path))};}
  const m:Manifest={schema_version:'1',run_id:`run-${randomUUID()}`,source_id:`source-${randomUUID()}`,source_type:options.sourceType??(options.url?'youtube':'local'),source_url:options.url??null,rights_note:options.rights,reference,revision:0,status:'awaiting_analysis',next_role:'video-analysis-director',sequence:0,artifacts:[],history:[]};
  return commit(root,m);
 });
}
export function getRun(root:string):Manifest {if(existsSync(resolve(root,'.writer-lock'))) fail('Run is locked; status may be incomplete');return checkedManifest(root);}
function setStatus(m:Manifest,status:string):void {m.status=status;m.next_role=workflow.stages[status]?.role??null;}
function outcome(root:string,m:Manifest,e:Evaluation):string {
 const axes=['position','size','color','start_time','end_time','displacement','speed_change','frame_change'];
 if(e.comparison_type!=='direct_frames'||e.metrics.length!==axes.length||axes.some(axis=>!e.metrics.some(x=>x.axis===axis&&x.basis==='measured'&&x.value!==null))) return 'stop_inconclusive';
 const measured=e.metrics.filter(x=>x.basis==='measured'&&x.value!==null);
 if(measured.some(x=>x.threshold<=0||x.value!<0)) fail('Measured errors must be nonnegative and thresholds positive');
 const previous=m.artifacts.findLast(x=>x.kind==='evaluation');
 if(previous && m.status==='awaiting_quality') {
  const before=parse('evaluation',json(resolveRunFile(root,previous.path)));
  if(encode(e.metrics)!==encode(before.metrics)||e.threshold_profile!==before.threshold_profile) fail('Quality-only review must preserve measured metrics and thresholds');
 }else if(previous){
  const before=parse('evaluation',json(resolveRunFile(root,previous.path)));
  const loss=(value:number,threshold:number)=>Math.max(0,value/threshold-1);
  let improved=false;
  for(const old of before.metrics.filter(x=>x.basis==='measured'&&x.value!==null)){
   const now=measured.find(x=>x.id===old.id&&x.axis===old.axis);
   if(!now||now.threshold!==old.threshold||now.unit!==old.unit||e.threshold_profile!==before.threshold_profile) fail('Evaluation metric set, units and thresholds must remain comparable');
   const delta=loss(now.value!,now.threshold)-loss(old.value!,old.threshold);
   if(delta>workflow.comparison_epsilon) return 'stop_no_improvement';
   if(delta < -workflow.comparison_epsilon) improved=true;
  }
  if(!improved) return 'stop_no_improvement';
 }
 if(measured.every(x=>x.value!<=x.threshold)){
  const quality=['naturalness','readability','consistency','tempo','clarity'];
  return quality.every(axis=>e.qualitative_findings.some(q=>q.axis===axis&&q.score!==null&&q.score>=workflow.quality_minimum&&q.reviewer&&q.frame_evidence_ids.length>0))?'complete':'awaiting_quality';
 }
 return m.revision>=workflow.max_improvements?'stop_limit':'needs_tasks';
}
export function submitArtifact(root:string,role:string,kind:Kind,artifactPath:string):Manifest {
 return lock(root,()=>{
  const m=checkedManifest(root);const step=workflow.stages[m.status];
  if(!step||step.role!==role||step.kind!==kind) fail(`Wrong stage or role: ${m.status}; expected ${step?.role??'no further submission'}/${step?.kind??'-'}`);
  const input=resolveRunFile(root,relative(resolve(root),resolve(artifactPath)));
  const raw=json(input);const value=object(raw);const id=text(value.artifact_id);
  if(m.artifacts.some(a=>a.artifact_id===id)||id===m.source_id) fail(`Duplicate artifact ID: ${id}`);
  let files:FileRef[]=[];let status:string;let revision=m.revision;
  if(kind==='analysis'){
   const a=parse('analysis',raw);
   if(a.source_id!==m.source_id||a.source_type!==m.source_type||a.source_url!==m.source_url||a.rights_note!==m.rights_note) fail('Analysis source or rights does not match manifest');
   files=a.evidence.map(x=>({path:x.path,sha256:x.sha256}));
   if(m.reference&&!files.some(f=>f.path===m.reference!.path&&f.sha256===m.reference!.sha256)) fail('Analysis evidence must bind the run reference');
   if(a.lab_analysis_path&&!files.some(f=>f.path===a.lab_analysis_path)) fail('Lab analysis needs hashed evidence');
   status=m.reference&&a.analysis_status!=='unavailable'&&a.scenes.length>0&&a.objects.length>0&&a.evidence.some(x=>x.frame!==null)?'awaiting_implementation':'stop_inconclusive';
  }else if(kind==='implementation'){
   strictKeys(value,['artifact_id','reference_id','analysis_id','revision','files','rationale','tasks_id']);
   const a=value as unknown as Implementation;
   const refining=m.status==='awaiting_refinement'; revision=m.revision+(refining?1:0);
   if(a.reference_id!==m.source_id||a.analysis_id!==latest(m,'analysis').artifact_id||a.revision!==revision||revision>workflow.max_improvements) fail('Implementation reference/analysis/revision mismatch');
   if(a.tasks_id!==(refining?latest(m,'tasks').artifact_id:null)) fail('Implementation must reference current tasks');
   text(a.rationale);if(!Array.isArray(a.files)||!a.files.length) fail('Implementation file snapshots required');files=a.files;
   status='awaiting_render';
  }else if(kind==='render'){
   strictKeys(value,['artifact_id','reference_id','analysis_id','implementation_id','revision','video']);
   const r=value as unknown as Render;
   if(r.reference_id!==m.source_id||r.analysis_id!==latest(m,'analysis').artifact_id||r.implementation_id!==latest(m,'implementation').artifact_id||r.revision!==m.revision) fail('Render references or revision mismatch');
   files=[r.video];status='awaiting_evaluation';
  }else if(kind==='evaluation'){
   const e=parse('evaluation',raw);
   if(e.reference_id!==m.source_id||e.generated_video_id!==latest(m,'render').artifact_id||e.evaluation_version!==m.revision+1) fail('Evaluation references or version mismatch');
   files=e.evidence.map(x=>({path:x.path,sha256:x.sha256}));
   const rendered=object(json(resolveRunFile(root,latest(m,'render').path))) as unknown as Render;
   if(!m.reference||![m.reference,rendered.video].every(required=>files.some(f=>f.path===required.path&&f.sha256===required.sha256))) fail('Evaluation evidence must bind the reference and generated video');
   status=outcome(root,m,e);
  }else if(kind==='tasks'){
   const t=parse('tasks',raw);
   const e=parse('evaluation',json(resolveRunFile(root,latest(m,'evaluation').path)));
   if(t.reference_id!==m.source_id||t.generated_video_id!==latest(m,'render').artifact_id||t.evaluation_id!==e.artifact_id) fail('Tasks reference stale evaluation');
   if(!t.tasks.length||t.tasks.some(x=>x.status!=='ready'||x.evidence.some(id=>!e.evidence.some(y=>y.id===id)))) fail('Tasks must be ready and reference current evaluation evidence');
   const priorTaskIds=m.artifacts.filter(a=>a.kind==='tasks').flatMap(a=>parse('tasks',json(resolveRunFile(root,a.path))).tasks.map(t=>t.task_id));
   if(t.tasks.some(t=>priorTaskIds.includes(t.task_id))) fail('Duplicate task ID across revisions');
   status='awaiting_refinement';
  }else return fail('Unknown artifact kind');
  for(const f of files) verifyFile(root,f);
  const path=`artifacts/${String(m.sequence+1).padStart(4,'0')}-${kind}.json`;
  writeFileSync(resolve(root,path),encode(raw),{flag:'wx'});
  m.artifacts.push({kind,artifact_id:id,revision,path,sha256:sha256(resolve(root,path)),files});
  m.revision=revision;m.sequence++;setStatus(m,status);return commit(root,m);
 });
}
