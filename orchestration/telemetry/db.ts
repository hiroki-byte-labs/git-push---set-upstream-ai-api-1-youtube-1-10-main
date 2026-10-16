// 計測DB（SQLite、node:sqlite）。プロンプト本文・APIキー・動画の内容は保存しない。
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {paths} from '../gateway/config.ts';

export const SCHEMA_VERSION=1;
const DDL=`
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tasks(
 task_id TEXT PRIMARY KEY,parent_task_id TEXT,title TEXT NOT NULL,task_type TEXT NOT NULL,difficulty TEXT,quality_requirement TEXT NOT NULL,
 initiator TEXT NOT NULL,agent_name TEXT,audit INTEGER NOT NULL,origin TEXT NOT NULL,prompt_sha256 TEXT,prompt_chars INTEGER,created_at TEXT NOT NULL,json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS decisions(
 decision_id TEXT PRIMARY KEY,task_id TEXT NOT NULL,execution_id TEXT NOT NULL,provider TEXT,model_id TEXT,reasoning_level TEXT,tier TEXT,route TEXT,
 auth_mode TEXT,difficulty TEXT NOT NULL,difficulty_source TEXT NOT NULL,task_type TEXT NOT NULL,routing_reason TEXT NOT NULL,used_llm INTEGER NOT NULL,
 policy_version TEXT NOT NULL,escalation_from TEXT,escalation_cause TEXT,requires_human_approval INTEGER NOT NULL,created_at TEXT NOT NULL,json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS approvals(
 approval_id TEXT PRIMARY KEY,execution_id TEXT NOT NULL,decision_id TEXT NOT NULL,provider TEXT NOT NULL,model_id TEXT,initiator TEXT NOT NULL,issuer TEXT NOT NULL,
 issued_at TEXT NOT NULL,expires_at TEXT NOT NULL,consumed_at TEXT,token_sha256 TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS human_approvals(
 decision_id TEXT PRIMARY KEY,approved_by TEXT NOT NULL,reason TEXT NOT NULL,approved_at TEXT NOT NULL,expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS executions(
 execution_id TEXT PRIMARY KEY,task_id TEXT NOT NULL,parent_task_id TEXT,parent_execution_id TEXT,decision_id TEXT,initiator TEXT NOT NULL,agent_name TEXT,
 provider TEXT,model_id TEXT,reasoning_level TEXT,task_type TEXT NOT NULL,difficulty TEXT,routing_reason TEXT,status TEXT NOT NULL,managed INTEGER NOT NULL,
 route TEXT,auth_mode TEXT NOT NULL,start_time TEXT,end_time TEXT,duration_ms INTEGER,retry_count INTEGER NOT NULL DEFAULT 0,escalation_count INTEGER NOT NULL DEFAULT 0,
 artifacts_json TEXT NOT NULL DEFAULT '[]',test_results_json TEXT NOT NULL DEFAULT '[]',metering_status TEXT NOT NULL,
 session_product TEXT,session_id TEXT,agent_id TEXT,tool_use_id TEXT,error_cause TEXT,error_message TEXT,updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS executions_task ON executions(task_id);
CREATE INDEX IF NOT EXISTS executions_session ON executions(session_product,session_id);
CREATE TABLE IF NOT EXISTS usage(
 usage_id TEXT PRIMARY KEY,execution_id TEXT NOT NULL,provider TEXT NOT NULL,model_id TEXT,source_kind TEXT NOT NULL,dedupe_key TEXT NOT NULL UNIQUE,
 session_id TEXT,cumulative INTEGER NOT NULL,input_total INTEGER,input_uncached INTEGER,cache_read INTEGER,cache_write INTEGER,output_total INTEGER,
 reasoning INTEGER,total INTEGER,methods_json TEXT NOT NULL,billing_mode TEXT NOT NULL,api_equivalent_usd REAL,api_equivalent_method TEXT NOT NULL,
 provider_reported_usd REAL,actual_billed_usd REAL,actual_billed_method TEXT NOT NULL,recorded_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS usage_execution ON usage(execution_id);
CREATE TABLE IF NOT EXISTS cumulative_snapshots(
 provider TEXT NOT NULL,session_id TEXT NOT NULL,model_id TEXT NOT NULL,input_total INTEGER,cache_read INTEGER,cache_write INTEGER,output_total INTEGER,
 reasoning INTEGER,updated_at TEXT NOT NULL,PRIMARY KEY(provider,session_id,model_id));
CREATE TABLE IF NOT EXISTS evaluations(
 evaluation_id TEXT PRIMARY KEY,execution_id TEXT NOT NULL,task_id TEXT NOT NULL,evaluator_kind TEXT NOT NULL,evaluator_name TEXT NOT NULL,
 passed INTEGER,score REAL,failure_cause TEXT,independent INTEGER NOT NULL,created_at TEXT NOT NULL,json TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS evaluations_execution ON evaluations(execution_id);
CREATE TABLE IF NOT EXISTS sessions(
 product TEXT NOT NULL,session_id TEXT NOT NULL,model_id TEXT,managed_execution_id TEXT,current_task_id TEXT,current_execution_id TEXT,
 transcript_path TEXT,transcript_offset INTEGER NOT NULL DEFAULT 0,started_at TEXT NOT NULL,last_seen_at TEXT NOT NULL,PRIMARY KEY(product,session_id));
CREATE TABLE IF NOT EXISTS events(
 id INTEGER PRIMARY KEY AUTOINCREMENT,at TEXT NOT NULL,kind TEXT NOT NULL,product TEXT,session_id TEXT,execution_id TEXT,detail_json TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS events_kind ON events(kind);
CREATE TABLE IF NOT EXISTS proposals(
 proposal_id TEXT PRIMARY KEY,created_at TEXT NOT NULL,status TEXT NOT NULL,base_policy_version TEXT NOT NULL,base_policy_sha256 TEXT NOT NULL,
 reviewed_by TEXT,reviewed_at TEXT,review_note TEXT,json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS policy_changes(
 id INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL,from_version TEXT NOT NULL,to_version TEXT NOT NULL,from_sha256 TEXT NOT NULL,to_sha256 TEXT NOT NULL,
 proposal_id TEXT,approved_by TEXT,backup_path TEXT NOT NULL,reason TEXT NOT NULL,applied_at TEXT NOT NULL);
`;
export type DB=DatabaseSync;
export function openDb(path=paths().db):DB{
 mkdirSync(dirname(path),{recursive:true});
 // 複数の製品のHookが同時に書くため、待機時間を最初に設定してからWALにする
 // （逆順だとWALへの切替え自体がロック中に即失敗する。2026-10-11にCodexのHookで発生）。
 const db=new DatabaseSync(path,{timeout:5000});
 db.exec('PRAGMA busy_timeout=5000;PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;');
 db.exec(DDL);
 db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING').run('schema_version',String(SCHEMA_VERSION));
 return db;
}
export function tx<T>(db:DB,fn:()=>T):T{
 db.exec('BEGIN IMMEDIATE');
 try{const r=fn();db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}
}
export function logEvent(db:DB,kind:string,detail:Record<string,unknown>,ref:{product?:string|null;session_id?:string|null;execution_id?:string|null}={}){
 db.prepare('INSERT INTO events(at,kind,product,session_id,execution_id,detail_json) VALUES(?,?,?,?,?,?)').run(new Date().toISOString(),kind,ref.product??null,ref.session_id??null,ref.execution_id??null,JSON.stringify(detail));
}
