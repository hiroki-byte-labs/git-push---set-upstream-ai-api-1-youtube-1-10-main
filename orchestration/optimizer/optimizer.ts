// Routing Optimizer: 実績からモデル別の費用対効果を分析し、ルーティング方針の改善案を出す。
// 最優先の指標は「品質を満たしたタスク1件当たりの総コスト」（失敗・再試行・上位切替えの費用を含む）。
// 実績不足では提案しない。方針の変更はPM（Codex）の確認後だけ適用し、旧版を保存して復元できる。
import {copyFileSync,existsSync,mkdirSync,readFileSync,renameSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fail,loadPolicy,newId,now,paths,sha256,tierIndex,type Difficulty,type Policy,type TaskType,type Tier} from '../gateway/config.ts';
import {logEvent,tx,type DB} from '../telemetry/db.ts';

export type Strategy={task_type:TaskType;difficulty:Difficulty;start_provider:string;start_model:string;start_tier:Tier;
 tasks:number;evaluated:number;passed:number;pass_rate:number|null;completion_rate:number;attempts:number;retry_rate:number;escalation_rate:number;
 total_tokens:number;api_usd:number|null;cost_known:boolean;cost_per_task_usd:number|null;cost_per_pass_usd:number|null;tokens_per_pass:number|null;avg_duration_ms:number|null;avg_score:number|null};
type Row={task_id:string;task_type:TaskType;difficulty:Difficulty;provider:string;model_id:string;tier:Tier};
// タスクごとに「最初に選ばれたモデル」を戦略とし、そのタスクの全実行（再試行・上位切替え・失敗を含む）の費用を合計する。
export function analyze(db:DB,since?:string):Strategy[]{
 const firsts=db.prepare(`SELECT t.task_id,t.task_type,d.difficulty,d.provider,d.model_id,d.tier FROM tasks t
  JOIN decisions d ON d.decision_id=(SELECT d2.decision_id FROM decisions d2 WHERE d2.task_id=t.task_id ORDER BY d2.created_at,d2.decision_id LIMIT 1)
  WHERE t.origin='gateway' AND d.provider IS NOT NULL AND d.provider!='local' AND (? IS NULL OR t.created_at>=?)`).all(since??null,since??null) as Row[];
 const groups=new Map<string,Row[]>();
 for(const r of firsts){const k=[r.task_type,r.difficulty,r.provider,r.model_id].join('|');(groups.get(k)??groups.set(k,[]).get(k)!).push(r)}
 const out:Strategy[]=[];
 for(const rows of groups.values()){
  let evaluated=0,passed=0,completed=0,attempts=0,retries=0,escalated=0,tokens=0,usd=0,costKnown=true,dur=0,durN=0,score=0,scoreN=0;
  for(const r of rows){
   const ex=db.prepare("SELECT execution_id,status,retry_count,escalation_count,duration_ms FROM executions WHERE task_id=? AND status NOT IN ('planned','cancelled')").all(r.task_id) as {execution_id:string;status:string;retry_count:number;escalation_count:number;duration_ms:number|null}[];
   attempts+=ex.length;if(ex.some(e=>e.retry_count>0))retries++;if(ex.some(e=>e.escalation_count>0))escalated++;
   const final=ex.at(-1);if(final?.status==='completed')completed++;
   for(const e of ex){
    const u=db.prepare('SELECT COALESCE(SUM(total),0) AS t,SUM(api_equivalent_usd) AS c,SUM(CASE WHEN api_equivalent_usd IS NULL AND total IS NOT NULL THEN 1 ELSE 0 END) AS unknown,COUNT(*) AS n FROM usage WHERE execution_id=?').get(e.execution_id) as {t:number;c:number|null;unknown:number;n:number};
    tokens+=u.t;usd+=u.c??0;if(u.unknown>0||(u.n>0&&u.c===null))costKnown=false;
    if(e.duration_ms!==null){dur+=e.duration_ms;durN++}
   }
   // 品質の合否はタスクの最終実行の評価で判定する。評価がなければ未評価（合格に数えない）。
   const ev=final?db.prepare('SELECT passed,score FROM evaluations WHERE execution_id=? ORDER BY created_at DESC').all(final.execution_id) as {passed:number|null;score:number|null}[]:[];
   const verdicts=ev.filter(x=>x.passed!==null);
   if(verdicts.length){evaluated++;if(final?.status==='completed'&&verdicts.every(x=>x.passed===1))passed++}
   for(const x of ev)if(x.score!==null){score+=x.score;scoreN++}
  }
  const r0=rows[0]!,n=rows.length;
  out.push({task_type:r0.task_type,difficulty:r0.difficulty,start_provider:r0.provider,start_model:r0.model_id,start_tier:r0.tier,tasks:n,evaluated,passed,pass_rate:evaluated?passed/evaluated:null,completion_rate:completed/n,attempts,
   retry_rate:retries/n,escalation_rate:escalated/n,total_tokens:tokens,api_usd:costKnown?round(usd):null,cost_known:costKnown,cost_per_task_usd:costKnown?round(usd/n):null,cost_per_pass_usd:costKnown&&passed?round(usd/passed):null,
   tokens_per_pass:passed?Math.round(tokens/passed):null,avg_duration_ms:durN?Math.round(dur/durN):null,avg_score:scoreN?score/scoreN:null});
 }
 return out.sort((a,b)=>a.task_type.localeCompare(b.task_type)||a.difficulty.localeCompare(b.difficulty)||tierIndex(a.start_tier)-tierIndex(b.start_tier));
}
const round=(x:number)=>Math.round(x*1e6)/1e6;
export type Change={task_type:TaskType;difficulty:Difficulty;from_tier:Tier;to_tier:Tier;reason:string;evidence:{current:Strategy|null;candidate:Strategy}};
export type Proposal={proposal_id:string;created_at:string;base_policy_version:string;base_policy_sha256:string;status:'proposed'|'no_change';min_samples:number;changes:Change[];insufficient:{task_type:string;difficulty:string;model:string;evaluated:number}[];notes:string[];strategies:Strategy[]};
function currentTier(policy:Policy,t:TaskType,d:Difficulty):Tier{
 const ov=policy.overrides?.find(o=>o.task_type===t&&o.difficulty===d);
 return ov?ov.tier:d==='L3'?policy.l3_start_tier.normal:policy.difficulty_tiers[d];
}
// 比較は同じ（種別・難易度）の中で、評価済みタスクが基準数以上ある戦略どうしだけで行う。
export function propose(db:DB,opts:{minSamples?:number;since?:string}={}):Proposal{
 const {policy,sha256:psha}=loadPolicy(),min=opts.minSamples??policy.optimizer.min_samples_per_group;
 const strategies=analyze(db,opts.since),changes:Change[]=[],insufficient:Proposal['insufficient']=[],notes:string[]=[];
 const groups=new Map<string,Strategy[]>();
 for(const s of strategies){const k=`${s.task_type}|${s.difficulty}`;(groups.get(k)??groups.set(k,[]).get(k)!).push(s)}
 for(const list of groups.values()){
  const enough=list.filter(s=>s.evaluated>=min);
  for(const s of list.filter(s=>s.evaluated<min))insufficient.push({task_type:s.task_type,difficulty:s.difficulty,model:`${s.start_provider}:${s.start_model}`,evaluated:s.evaluated});
  if(enough.length<2)continue;
  const {task_type:t,difficulty:d}=list[0]!,cur=currentTier(policy,t,d);
  const current=enough.find(s=>s.start_tier===cur)??null;
  // 費用が比較可能か（全戦略でAPI相当額が算出できる、または同一製品内のトークン比較）。
  // 費用は単価が分かる戦略どうしでだけ比べる。トークン数はモデルごとに単価が違うため費用の代わりにしない
  // （2026-10-12の実測で、同じ製品内でも軽量モデルの方がトークンが多く出て誤った提案になった）。
  const comparable=enough.every(s=>s.cost_known)?'usd':null;
  if(!comparable){notes.push(`${t}/${d}: 単価が未確認のモデル（${enough.filter(s=>!s.cost_known).map(s=>s.start_model).join(', ')}）があり費用を比較できないため提案しない（トークン数は費用の代わりにしない）`);continue}
  const cost=(s:Strategy)=>comparable==='usd'?s.cost_per_pass_usd:s.tokens_per_pass;
  const ok=enough.filter(s=>(s.pass_rate??0)>=policy.optimizer.min_pass_rate&&cost(s)!==null);
  if(!ok.length){notes.push(`${t}/${d}: 合格率 ${policy.optimizer.min_pass_rate} 以上の戦略がない`);continue}
  const best=ok.reduce((a,b)=>cost(a)!<=cost(b)!?a:b);
  if(best.start_tier===cur)continue;
  if(current&&(current.pass_rate??0)>=policy.optimizer.min_pass_rate&&cost(current)!==null&&cost(current)!<=cost(best)!)continue;
  const unit=comparable==='usd'?'USD':'tokens';
  changes.push({task_type:t,difficulty:d,from_tier:cur,to_tier:best.start_tier,
   reason:`合格1件当たり ${cost(best)} ${unit}（合格率 ${best.pass_rate?.toFixed(2)}、評価${best.evaluated}件）${current?`。現行 ${cur} は ${cost(current)??'算出不可'} ${unit}・合格率 ${current.pass_rate?.toFixed(2)}`:`。現行 ${cur} は実績不足`}`,evidence:{current,candidate:best}});
 }
 if(!strategies.length)notes.push('分析対象の実行がない');
 const p:Proposal={proposal_id:newId('prp'),created_at:now(),base_policy_version:policy.version,base_policy_sha256:psha,status:changes.length?'proposed':'no_change',min_samples:min,changes,insufficient,notes,strategies};
 mkdirSync(paths().proposals,{recursive:true});
 writeFileSync(join(paths().proposals,`${p.proposal_id}.json`),JSON.stringify(p,null,2)+'\n');
 writeFileSync(join(paths().proposals,`${p.proposal_id}.md`),renderReport(p));
 db.prepare('INSERT INTO proposals(proposal_id,created_at,status,base_policy_version,base_policy_sha256,json) VALUES(?,?,?,?,?,?)').run(p.proposal_id,p.created_at,p.status,p.base_policy_version,p.base_policy_sha256,JSON.stringify(p));
 logEvent(db,'optimizer_proposal',{proposal_id:p.proposal_id,changes:changes.length,insufficient:insufficient.length},{});
 return p;
}
export function renderReport(p:Proposal):string{
 const rows=p.strategies.map(s=>`| ${s.task_type} | ${s.difficulty} | ${s.start_provider}:${s.start_model} (${s.start_tier}) | ${s.tasks} | ${s.evaluated} | ${s.pass_rate===null?'-':s.pass_rate.toFixed(2)} | ${s.retry_rate.toFixed(2)} | ${s.escalation_rate.toFixed(2)} | ${s.total_tokens} | ${s.cost_per_task_usd??'-'} | ${s.cost_per_pass_usd??'-'} | ${s.avg_duration_ms??'-'} |`);
 return [`# ルーティング改善レポート ${p.proposal_id}`,'',`- 作成: ${p.created_at} / 基準方針: ${p.base_policy_version}`,`- 状態: ${p.status}（判定に必要な評価済みタスク数: 各戦略 ${p.min_samples} 件以上）`,
  '- 費用はAPI相当額の推定（購読枠の実請求額ではない）。合格は最終実行の評価がすべて合格のもの。未評価は合格に数えない。','',
  '## 戦略別の実績（最初に選ばれたモデル単位）','','| 種別 | 難易度 | 開始モデル | タスク | 評価済 | 合格率 | 再試行率 | 上位切替率 | 総トークン | 費用/タスク | 費用/合格 | 平均時間ms |','|---|---|---|---|---|---|---|---|---|---|---|---|',...rows,'',
  '## 改善案','',...(p.changes.length?p.changes.map(c=>`- ${c.task_type}/${c.difficulty}: ${c.from_tier} → ${c.to_tier}。${c.reason}`):['- なし（変更しない）']),'',
  '## 実績不足（提案の対象外）','',...(p.insufficient.length?p.insufficient.map(i=>`- ${i.task_type}/${i.difficulty} ${i.model}: 評価済み ${i.evaluated} 件`):['- なし']),'',
  '## 補足','',...(p.notes.length?p.notes.map(n=>`- ${n}`):['- なし']),'',
  '適用には PM（Codex project-orchestrator）または人の確認が必要: `agentctl optimize review <id> --decision approve --reviewer <名前>` → `agentctl optimize apply <id>`。',''].join('\n');
}
// PMの確認を記録する。呼出し元の確認（人の端末またはCodexのセッション）はCLIとHookが行う。
export function review(db:DB,proposalId:string,decision:'approve'|'reject',reviewer:string,note:string){
 const p=db.prepare('SELECT status FROM proposals WHERE proposal_id=?').get(proposalId) as {status:string}|undefined;
 if(!p)fail(`提案がない: ${proposalId}`);if(p.status!=='proposed')fail(`確認できる状態ではない: ${p.status}`);
 db.prepare('UPDATE proposals SET status=?,reviewed_by=?,reviewed_at=?,review_note=? WHERE proposal_id=?').run(decision==='approve'?'approved':'rejected',reviewer,now(),note,proposalId);
 logEvent(db,'optimizer_review',{proposal_id:proposalId,decision,reviewer},{});
}
function writePolicy(next:Policy){
 const {policy:path}=paths(),tmp=`${path}.${process.pid}.tmp`;
 writeFileSync(tmp,JSON.stringify(next,null,2)+'\n');renameSync(tmp,path);
}
function backup(policySha:string,version:string):string{
 mkdirSync(paths().policyHistory,{recursive:true});
 const dest=join(paths().policyHistory,`${version}.${policySha.slice(0,12)}.json`);
 if(!existsSync(dest))copyFileSync(paths().policy,dest);
 return dest;
}
function nextVersion(v:string):string{const today=now().slice(0,10),m=/^(\d{4}-\d{2}-\d{2})\.(\d+)$/.exec(v);return m&&m[1]===today?`${today}.${Number(m[2])+1}`:`${today}.1`}
export function apply(db:DB,proposalId:string){
 return tx(db,()=>{
  const row=db.prepare('SELECT * FROM proposals WHERE proposal_id=?').get(proposalId) as {status:string;json:string;base_policy_sha256:string;reviewed_by:string|null}|undefined;
  if(!row)fail(`提案がない: ${proposalId}`);
  if(row.status!=='approved'||!row.reviewed_by)fail(`PMの承認がない提案は適用しない（状態: ${row.status}）`);
  const {policy,sha256:cur}=loadPolicy();
  if(cur!==row.base_policy_sha256)fail('提案作成後に方針が変わったため適用しない（提案を作り直す）');
  const p=JSON.parse(row.json) as Proposal;
  const bak=backup(cur,policy.version);
  const overrides=[...(policy.overrides??[]).filter(o=>!p.changes.some(c=>c.task_type===o.task_type&&c.difficulty===o.difficulty)),...p.changes.map(c=>({task_type:c.task_type,difficulty:c.difficulty,tier:c.to_tier,proposal_id:p.proposal_id,reason:c.reason.slice(0,300)}))];
  const next={...policy,version:nextVersion(policy.version),overrides};
  writePolicy(next);
  const after=sha256(readFileSync(paths().policy));
  db.prepare('INSERT INTO policy_changes(kind,from_version,to_version,from_sha256,to_sha256,proposal_id,approved_by,backup_path,reason,applied_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run('apply',policy.version,next.version,cur,after,proposalId,row.reviewed_by,bak,`${p.changes.length}件の変更`,now());
  db.prepare("UPDATE proposals SET status='applied' WHERE proposal_id=?").run(proposalId);
  logEvent(db,'policy_applied',{proposal_id:proposalId,from:policy.version,to:next.version},{});
  return {from:policy.version,to:next.version,backup:bak};
 });
}
// 直前（または指定版）の方針へ戻す。戻す前の版も保存する。
export function rollback(db:DB,opts:{to?:string;by:string;reason:string}){
 return tx(db,()=>{
  const {policy,sha256:cur}=loadPolicy();
  const change=opts.to?db.prepare("SELECT * FROM policy_changes WHERE from_version=? AND kind='apply' ORDER BY id DESC LIMIT 1").get(opts.to):db.prepare("SELECT * FROM policy_changes WHERE kind='apply' AND to_sha256=? ORDER BY id DESC LIMIT 1").get(cur);
  const c=change as {from_version:string;from_sha256:string;backup_path:string;proposal_id:string|null}|undefined;
  if(!c)fail(opts.to?`版 ${opts.to} の保存がない`:'現在の方針はoptimizerの適用で作られていないため、自動で戻せない');
  if(!existsSync(c.backup_path)||sha256(readFileSync(c.backup_path))!==c.from_sha256)fail(`保存した旧版が見つからないか改変されている: ${c.backup_path}`);
  const bak=backup(cur,policy.version);
  copyFileSync(c.backup_path,paths().policy);
  db.prepare('INSERT INTO policy_changes(kind,from_version,to_version,from_sha256,to_sha256,proposal_id,approved_by,backup_path,reason,applied_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run('rollback',policy.version,c.from_version,cur,c.from_sha256,c.proposal_id,opts.by,bak,opts.reason,now());
  if(c.proposal_id)db.prepare("UPDATE proposals SET status='rolled_back' WHERE proposal_id=?").run(c.proposal_id);
  logEvent(db,'policy_rolled_back',{from:policy.version,to:c.from_version,by:opts.by},{});
  return {from:policy.version,to:c.from_version};
 });
}
// 最後に適用した変更の前後で、変更対象（種別・難易度）の合格率を比べる。劣化していれば復元を勧める（autoなら復元する）。
export function checkRegression(db:DB,opts:{auto?:boolean;by?:string}={}){
 const {policy}=loadPolicy();
 const c=db.prepare("SELECT * FROM policy_changes WHERE kind='apply' ORDER BY id DESC LIMIT 1").get() as {applied_at:string;proposal_id:string;to_version:string}|undefined;
 if(!c)return {status:'no_change_applied' as const};
 if(policy.version!==c.to_version)return {status:'not_current' as const,current:policy.version};
 const p=JSON.parse((db.prepare('SELECT json FROM proposals WHERE proposal_id=?').get(c.proposal_id) as {json:string}).json) as Proposal;
 const rate=(t:string,d:string,after:boolean)=>{
  const rows=db.prepare(`SELECT e.execution_id,e.status,(SELECT MIN(passed) FROM evaluations v WHERE v.execution_id=e.execution_id) AS passed FROM executions e JOIN tasks k ON k.task_id=e.task_id
   WHERE k.origin='gateway' AND k.task_type=? AND e.difficulty=? AND e.status IN ('completed','failed','unmetered') AND ${after?'e.updated_at>=?':'e.updated_at<?'}`).all(t,d,c.applied_at) as {status:string;passed:number|null}[];
  const ev=rows.filter(r=>r.passed!==null||r.status==='failed');
  return {n:ev.length,rate:ev.length?ev.filter(r=>r.status==='completed'&&r.passed===1).length/ev.length:null};
 };
 const results=p.changes.map(ch=>{const before=rate(ch.task_type,ch.difficulty,false),after=rate(ch.task_type,ch.difficulty,true);
  const degraded=after.n>=policy.optimizer.regression_min_samples&&before.rate!==null&&after.rate!==null&&before.rate-after.rate>policy.optimizer.max_pass_rate_drop;
  return {task_type:ch.task_type,difficulty:ch.difficulty,before,after,degraded}});
 const degraded=results.some(r=>r.degraded);
 let rolledBack=null;
 if(degraded&&opts.auto)rolledBack=rollback(db,{by:opts.by??'optimizer-auto',reason:'適用後の合格率低下を検知'});
 logEvent(db,'optimizer_regression_check',{degraded,results},{});
 return {status:degraded?'degraded' as const:'ok' as const,results,rolled_back:rolledBack};
}
