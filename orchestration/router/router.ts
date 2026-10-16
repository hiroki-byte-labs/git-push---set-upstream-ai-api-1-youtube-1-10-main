// Model Router: ルールベースでモデルを選ぶ純粋関数。LLMは呼ばない（llm_classifierは既定で無効）。
// 実行中の親モデルは変更できない前提で、選んだモデルは別のCLI/API実行または製品内サブエージェントへ委譲する。
import {DIFFICULTIES,TIERS,maxTier,newId,now,tierIndex,type AuthMode,type Difficulty,type FailureCause,type Initiator,type ModelEntry,type Policy,type Provider,type Quality,type Registry,type Route,type TaskType,type Tier} from '../gateway/config.ts';

export type Task={
 schema_version:'1';task_id:string|null;parent_task_id:string|null;title:string;task_type:TaskType;difficulty:Difficulty|null;quality_requirement:Quality;
 initiator:Initiator;agent_name:string|null;required_capabilities:string[];preferred_provider:Provider|null;
 budget:{max_usd:number|null;max_total_tokens:number|null;max_retries:number;max_escalations:number};
 input:{prompt_file:string|null;program:{argv:string[]}|null;workdir:string|null;permission_profile:'read_only'|'workspace_write';mock?:Record<string,unknown>};
 expected_artifacts:string[];test_command:string[]|null;audit:boolean;
};
export type Selected={provider:Provider;model_id:string|null;reasoning_level:string|null;tier:Tier;route:Route;auth_mode:AuthMode};
export type Decision={
 schema_version:'1';decision_id:string;task_id:string;parent_task_id:string|null;execution_id:string;policy_version:string;policy_sha256:string;
 task_type:TaskType;difficulty:Difficulty;difficulty_source:'explicit'|'rule'|'llm'|'default';quality_requirement:Quality;
 selected:Selected|null;review:{required:boolean;provider:Provider|null;model_id:string|null};
 candidates:{provider:Provider;model_id:string;tier:Tier;eligible:boolean;reasons:string[]}[];
 checks:{available:boolean;capable:boolean;within_budget:boolean|null;quality_expected:boolean;permitted:boolean};
 estimate:{total_tokens:number|null;api_equivalent_usd:number|null;billing:'subscription_quota'|'api_billing'|'none'};
 escalation:{from_decision_id:string|null;attempt:number;cause:FailureCause|null};
 routing_reason:string;rule_ids:string[];used_llm:boolean;requires_human_approval:boolean;human_approval_reason:string|null;created_at:string;
};
// 実行環境の状態（認証の有無など）。Routerは外部を調べず、呼出し側が渡す。
export type Env={authenticated:Partial<Record<Provider,AuthMode[]>>;allowMock:boolean;route?:Route;restrictProvider?:Provider|null};
export type RouteInput={task:Task&{task_id:string};execution_id:string;policy:Policy;policy_sha256:string;registry:Registry;env:Env;escalation?:{from:Decision;cause:FailureCause};minTier?:Tier};

export function classifyDifficulty(task:Task,policy:Policy):{difficulty:Difficulty;source:Decision['difficulty_source'];rules:string[]}{
 if(task.difficulty)return {difficulty:task.difficulty,source:'explicit',rules:['D-explicit']};
 if(task.input.program)return {difficulty:'L0',source:'rule',rules:['D-program']};
 const agent=task.agent_name?policy.agents[task.agent_name]:undefined;
 if(agent)return {difficulty:agent.difficulty,source:'rule',rules:[`D-agent:${task.agent_name}`]};
 const t=policy.task_types[task.task_type];
 if(t&&task.task_type!=='general')return {difficulty:t.default_difficulty,source:'rule',rules:[`D-type:${task.task_type}`]};
 return {difficulty:'L2',source:'default',rules:['D-default']};
}
// 対話セッションのプロンプトから種別と難易度を推定する（正規表現のみ。本文は保存しない）。
export function classifyPrompt(prompt:string,policy:Policy):{task_type:TaskType;difficulty:Difficulty;rules:string[];source:'rule'|'default'}{
 const hit=policy.prompt_rules.find(r=>new RegExp(r.pattern,'i').test(prompt));
 let d:Difficulty=hit?.difficulty??'L2';const rules=[hit?hit.id:'P-default'];
 for(const b of policy.prompt_bumps)if(new RegExp(b.pattern,'i').test(prompt)){d=DIFFICULTIES[Math.min(4,Math.max(1,DIFFICULTIES.indexOf(d)+b.delta))]!;rules.push(b.id)}
 return {task_type:hit?.task_type??'general',difficulty:d,rules,source:hit?'rule':'default'};
}
function startTier(d:Difficulty,q:Quality,policy:Policy,taskType:TaskType):Tier{
 const ov=policy.overrides?.find(o=>o.task_type===taskType&&o.difficulty===d);
 let t=ov?ov.tier:d==='L3'?policy.l3_start_tier[q]:policy.difficulty_tiers[d];
 if(d!=='L0')t=maxTier(t,policy.quality_floor[q]);
 return t;
}
function providerOrder(task:Task,policy:Policy):Provider[]{
 const base=task.preferred_provider?[task.preferred_provider]:(policy.task_types[task.task_type]?.providers??['initiator']);
 const out:Provider[]=[];
 for(const p of base){const v=(p==='initiator'?(['codex','claude','antigravity'].includes(task.initiator)?task.initiator:null):p) as Provider|null;if(v&&!out.includes(v))out.push(v)}
 return out;
}
export function route(input:RouteInput):Decision{
 const {task,policy,registry,env}=input;
 const cls=classifyDifficulty(task,policy);
 const rules=[...cls.rules],caps=[...new Set([...(policy.task_types[task.task_type]?.capabilities??[]),...task.required_capabilities])];
 const attempt=input.escalation?input.escalation.from.escalation.attempt+1:0;
 let tier=startTier(cls.difficulty,task.quality_requirement,policy,task.task_type);
 if(policy.overrides?.some(o=>o.task_type===task.task_type&&o.difficulty===cls.difficulty))rules.push(`R-override:${task.task_type}/${cls.difficulty}`);
 if(input.minTier)tier=maxTier(tier,input.minTier);
 const base={schema_version:'1' as const,decision_id:newId('rdc'),task_id:task.task_id,parent_task_id:task.parent_task_id,execution_id:input.execution_id,policy_version:policy.version,policy_sha256:input.policy_sha256,
  task_type:task.task_type,difficulty:cls.difficulty,difficulty_source:cls.source,quality_requirement:task.quality_requirement,used_llm:false,created_at:now(),
  escalation:{from_decision_id:input.escalation?.from.decision_id??null,attempt,cause:input.escalation?.cause??null}};
 // L0: LLMを使わない。
 if(cls.difficulty==='L0'){
  const ok=!!task.input.program;rules.push('R-L0-program');
  return {...base,selected:ok?{provider:'local',model_id:null,reasoning_level:'none',tier:'none',route:'program',auth_mode:'none'}:null,review:{required:false,provider:null,model_id:null},candidates:[],
   checks:{available:ok,capable:ok,within_budget:true,quality_expected:ok,permitted:ok},estimate:{total_tokens:0,api_equivalent_usd:0,billing:'none'},
   routing_reason:ok?'L0: プログラムだけで処理する（LLMを使わない）':'L0にはinput.programが必要',rule_ids:rules,requires_human_approval:false,human_approval_reason:null};
 }
 rules.push(`R-tier:${cls.difficulty}->${tier}`);
 const estTokens=policy.estimates_total_tokens[cls.difficulty]??null;
 const order=(env.restrictProvider?[env.restrictProvider]:providerOrder(task,policy)).filter(p=>p!=='local');
 const routeKind:Route=env.route??'cli';
 const candidates:Decision['candidates']=[];
 const evalModel=(m:ModelEntry)=>{
  const reasons:string[]=[];
  const prov=registry.providers[m.provider];
  if(!m.selectable)reasons.push('自動選択の対象外');
  if(m.provider==='mock'&&!env.allowMock)reasons.push('テスト専用');
  if(!caps.every(c=>m.capabilities.includes(c)))reasons.push(`能力不足: ${caps.filter(c=>!m.capabilities.includes(c)).join(',')}`);
  const auths=env.authenticated[m.provider]??[];
  const auth:AuthMode|undefined=auths.includes('subscription')?'subscription':auths.includes('none')?'none':auths.includes('api_key')?'api_key':undefined;
  if(!auth)reasons.push('認証済みの実行経路なし');
  if(auth==='api_key'&&(!policy.auth.allow_api_billing||!prov?.auth_modes.api_key))reasons.push('API課金は方針で無効（routing-policy.json auth.allow_api_billing）');
  const usd=estTokens!==null&&m.pricing?.input_per_mtok!=null&&m.pricing.output_per_mtok!=null?Math.round(estTokens*(0.8*m.pricing.input_per_mtok+0.2*m.pricing.output_per_mtok))/1e6:null;
  if(auth==='api_key'&&task.budget.max_usd!==null&&(usd===null||usd>task.budget.max_usd))reasons.push(usd===null?'単価不明のため予算判定不可':`予算超過見込み: $${usd} > $${task.budget.max_usd}`);
  if(task.budget.max_total_tokens!==null&&estTokens!==null&&estTokens>task.budget.max_total_tokens)reasons.push(`トークン上限未満の見込みなし: ${estTokens} > ${task.budget.max_total_tokens}`);
  candidates.push({provider:m.provider,model_id:m.model_id,tier:m.tier,eligible:!reasons.length,reasons});
  return {ok:!reasons.length,auth:auth??'unknown' as AuthMode,usd};
 };
 // 指定tierから始め、候補がなければ上位tierだけを探す（下位へは自動で下げない＝品質要求を守る）。
 let selected:Selected|null=null,est:{usd:number|null;auth:AuthMode}={usd:null,auth:'unknown'};
 for(let ti=tierIndex(tier);ti<TIERS.length&&!selected;ti++){
  for(const p of order){
   for(const m of registry.models.filter(x=>x.provider===p&&x.tier===TIERS[ti])){
    const r=evalModel(m);
    if(r.ok&&!selected){selected={provider:m.provider,model_id:m.model_id,reasoning_level:m.reasoning_default,tier:m.tier,route:m.provider==='gemini-api'?'api':routeKind,auth_mode:r.auth};est={usd:r.usd,auth:r.auth};if(ti>tierIndex(tier))rules.push(`R-tier-up:${TIERS[ti]}`)}
   }
  }
 }
 // L4は別の製品（なければ別モデル）の高性能モデルで独立レビューする。
 let review:Decision['review']={required:false,provider:null,model_id:null};
 if(cls.difficulty==='L4'&&policy.l4_review.required&&selected){
  const pool=registry.models.filter(m=>m.tier==='high'&&m.selectable&&(m.provider!=='mock'||env.allowMock)&&(env.authenticated[m.provider]??[]).length&&!(m.provider===selected!.provider&&m.model_id===selected!.model_id));
  const other=pool.find(m=>m.provider!==selected!.provider)??pool[0];
  review={required:true,provider:other?.provider??null,model_id:other?.model_id??null};rules.push('R-L4-review');
 }
 const apiBilling=selected?.auth_mode==='api_key';
 const humanReason=apiBilling&&policy.auth.api_billing_requires_human_approval?'従量課金のAPIを使うため人の承認が必要':null;
 const reason=selected?`${cls.difficulty}/${task.task_type}/品質${task.quality_requirement} → ${selected.tier}枠の ${selected.provider}:${selected.model_id}（${order.join('>')}の順で最初に条件を満たしたモデル）`:`条件を満たすモデルがありません（${order.join(',')||'製品なし'}、${tier}以上）`;
 return {...base,selected,review,candidates,
  checks:{available:!!selected,capable:!!selected,within_budget:selected?(apiBilling?est.usd!==null&&(task.budget.max_usd===null||est.usd<=task.budget.max_usd):true):null,quality_expected:!!selected&&tierIndex(selected.tier)>=tierIndex(policy.quality_floor[task.quality_requirement]),permitted:!!selected},
  estimate:{total_tokens:estTokens,api_equivalent_usd:est.usd,billing:apiBilling?'api_billing':'subscription_quota'},
  routing_reason:reason,rule_ids:rules,requires_human_approval:!!humanReason,human_approval_reason:humanReason};
}
// 失敗原因に応じて、同じモデルで再試行・上位へ切替え・停止を決める。回数は方針と課題の小さい方で制限する（無制限の再試行はしない）。
export type Next={action:'retry_same'|'escalate'|'stop';reason:string};
export function nextAction(cause:FailureCause,state:{retries:number;escalations:number;tier:Tier},task:Task,policy:Policy):Next{
 const maxRetries=Math.min(task.budget.max_retries,policy.limits.max_retries),maxEsc=Math.min(task.budget.max_escalations,policy.limits.max_escalations);
 if(policy.escalation.retry_same_on.includes(cause))return state.retries<maxRetries?{action:'retry_same',reason:`一時的な失敗（${cause}）のため同じモデルで再試行 ${state.retries+1}/${maxRetries}`}:{action:'stop',reason:`再試行の上限 ${maxRetries} に達した`};
 if(policy.escalation.escalate_on.includes(cause)){
  if(state.tier==='high')return {action:'stop',reason:'すでに最上位の枠で失敗した'};
  return state.escalations<maxEsc?{action:'escalate',reason:`能力・品質の不足（${cause}）のため上位の枠へ切替え ${state.escalations+1}/${maxEsc}`}:{action:'stop',reason:`上位への切替え上限 ${maxEsc} に達した`};
 }
 return {action:'stop',reason:`原因 ${cause} は再試行・切替えで解決しないため停止`};
}
export function nextTier(t:Tier):Tier{return TIERS[Math.min(TIERS.length-1,tierIndex(t)+1)]!}
