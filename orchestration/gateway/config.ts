// agentctl共通: パス、登録簿・方針の読込み、ID、時刻。LLMは使わない。
import {createHash,randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export type Provider='claude'|'codex'|'antigravity'|'gemini-api'|'local'|'mock';
export type Product='claude'|'codex'|'antigravity';
export type Initiator=Product|'human'|'gateway'|'unknown';
export type Difficulty='L0'|'L1'|'L2'|'L3'|'L4';
export type Tier='none'|'light'|'standard'|'high';
export type Quality='low'|'normal'|'high'|'critical';
export type AuthMode='subscription'|'api_key'|'none'|'unknown';
export type Route='program'|'cli'|'api'|'native_subagent'|'interactive';
export type Method='measured'|'estimated'|'unavailable';
export type FailureCause='capability'|'quality'|'transient'|'auth'|'budget'|'policy'|'input'|'tooling'|'model_mismatch'|'unknown';
export type ExecutionStatus='planned'|'approved'|'running'|'completed'|'failed'|'rejected'|'unmetered'|'cancelled';
export type MeteringStatus='measured'|'partial'|'unavailable'|'missing'|'not_applicable'|'included_in_parent';
export type TaskType='program'|'extraction'|'classification'|'summarization'|'analysis'|'implementation'|'design'|'review'|'video_analysis'|'animation'|'render'|'orchestration'|'general';

export type Pricing={currency:string;input_per_mtok:number|null;output_per_mtok:number|null;cache_read_per_mtok:number|null;cache_write_per_mtok:number|null;confirmed_at:string;basis:string};
export type ModelEntry={provider:Provider;model_id:string;tier:Tier;selectable:boolean;reasoning_default:string|null;reasoning_levels:string[];capabilities:string[];aliases:Record<string,string>;source:string;pricing:Pricing|null};
// 製品内サブエージェントの能力（確認した版つき）。Hookはこの能力で判断する。
// model_override: enforced=モデルを指定でき実機で確認済み、unverified=指定する引数はあるが実機で未確認、unsupported=指定できない（子は親か定義のモデル）。
// child_usage: measured=子単独の使用量を取れる、included_in_parent=親の集計に含まれる、unavailable=取れない。
export type NativeSubagents={supported:boolean;model_override:'enforced'|'unverified'|'unsupported';model_param:string|null;child_usage:'measured'|'included_in_parent'|'unavailable';verified_version:string|null;verified_at:string|null;basis:string};
export type Registry={schema_version:'1';verified_at:string;providers:Record<string,{cli:string|null;version_seen?:string|null;default_auth:AuthMode;auth_modes:Record<string,{verified:boolean;basis:string;env?:string[]}>;native_subagents:NativeSubagents}>;models:ModelEntry[]};
export type Policy={
 schema_version:'1';version:string;description:string;
 difficulty_tiers:Record<Difficulty,Tier>;l3_start_tier:Record<Quality,Tier>;quality_floor:Record<Quality,Tier>;
 l4_review:{required:boolean;prefer_other_provider:boolean};
 task_types:Record<TaskType,{default_difficulty:Difficulty;providers:string[];capabilities:string[]}>;
 agents:Record<string,{task_type:TaskType;difficulty:Difficulty}>;
 prompt_rules:{id:string;pattern:string;task_type:TaskType;difficulty:Difficulty}[];
 prompt_bumps:{id:string;pattern:string;delta:number}[];
 estimates_total_tokens:Record<string,number>;
 limits:{max_retries:number;max_escalations:number;max_depth:number;approval_ttl_seconds:number;timeout_seconds:Record<Difficulty,number>};
 escalation:{escalate_on:FailureCause[];retry_same_on:FailureCause[];stop_on:FailureCause[]};
 auth:{allow_api_billing:boolean;api_billing_requires_human_approval:boolean};
 native_subagents:{enforce_model:boolean;missing_model:'inject'|'deny'|'allow';mismatch:'deny'|'allow'};
 metering:{required_when_audit:boolean};
 llm_classifier:{enabled:boolean;note:string};
 optimizer:{min_samples_per_group:number;trigger_every_n_executions:number;min_pass_rate:number;max_pass_rate_drop:number;regression_min_samples:number};
 overrides?:{task_type:TaskType;difficulty:Difficulty;tier:Tier;proposal_id:string;reason:string}[];
};

export const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export const TIERS:Tier[]=['none','light','standard','high'];
export const DIFFICULTIES:Difficulty[]=['L0','L1','L2','L3','L4'];
// テストやCIは環境変数で保存先を分ける。既定はリポジトリのdata/（Git管理外）と、リポジトリ外の鍵ディレクトリ。
export function paths(){
 const data=resolve(process.env.AGENTCTL_DATA_DIR??join(ROOT,'data'));
 const keyDir=resolve(process.env.AGENTCTL_KEY_DIR??join(homedir(),'.config','agentctl'));
 const registryDir=resolve(process.env.AGENTCTL_REGISTRY_DIR??join(ROOT,'orchestration','model-registry'));
 return {root:ROOT,data,db:join(data,'telemetry.db'),runs:join(data,'runs'),proposals:join(data,'optimizer'),policyHistory:join(data,'policy-history'),keyDir,key:join(keyDir,'approval.key'),registry:join(registryDir,'models.json'),policy:join(registryDir,'routing-policy.json'),schemas:join(ROOT,'schemas')};
}
export const sha256=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
export function readJson<T>(path:string):T{return JSON.parse(readFileSync(path,'utf8')) as T}
export function loadRegistry():Registry{return readJson<Registry>(paths().registry)}
export function loadPolicy():{policy:Policy;sha256:string}{const raw=readFileSync(paths().policy);return {policy:JSON.parse(raw.toString()) as Policy,sha256:sha256(raw)}}
// 時刻順に並ぶ短いID（36進の時刻 + 乱数）。
export function newId(prefix:'tsk'|'exe'|'rdc'|'use'|'evl'|'apr'|'prp'):string{return `${prefix}_${Date.now().toString(36).padStart(9,'0')}${randomBytes(6).toString('hex')}`}
export const now=()=>new Date().toISOString();
export function fail(message:string):never{throw new Error(message)}
export function tierIndex(t:Tier){return TIERS.indexOf(t)}
export function maxTier(a:Tier,b:Tier):Tier{return tierIndex(a)>=tierIndex(b)?a:b}
// 機密を含まない短い要約だけを残す（本文は保存しない）。
export function redact(text:string,max=160){return text.replace(/(sk-[A-Za-z0-9_-]{8,}|AIza[0-9A-Za-z_-]{20,}|ghp_[A-Za-z0-9]{20,}|(?:api[_-]?key|token|secret|password)\s*[=:]\s*\S+)/gi,'<redacted>').slice(0,max)}
