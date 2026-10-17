// 3製品のHook入力（各公式仕様の形式）を共通処理へ流す結合テスト。実際の製品がこの入力を送るかは実機試験で別に確認する。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {sandbox,writeJsonl} from './helpers.ts';
import {handle} from '../hooks/hook.ts';
import {mint} from '../gateway/approval.ts';
import {newId,now} from '../gateway/config.ts';

const {db,env,dir}=sandbox();
const H=(product:'claude'|'codex'|'antigravity',event:string,payload:Record<string,unknown>,e:NodeJS.ProcessEnv=env)=>{const r=handle(product,event,JSON.stringify(payload),e);return r.stdout?JSON.parse(r.stdout):null};
const denied=(o:Record<string,any>|null)=>o?.hookSpecificOutput?.permissionDecision==='deny'||o?.decision==='deny';
const one=(sql:string,...a:(string|number)[])=>db.prepare(sql).get(...a) as Record<string,any>;

test('TEST-001: Codexで通常タスクを開始するとModel Routerの選択が記録される', ()=>{
 H('codex','SessionStart',{session_id:'cx-1',model:'gpt-6-astra',source:'startup',cwd:dir});
 const o=H('codex','UserPromptSubmit',{session_id:'cx-1',turn_id:'t1',model:'gpt-6-astra',prompt:'READMEを要約して'});
 assert.match(o.hookSpecificOutput.additionalContext,/L1\/summarization 推奨 antigravity:gemini-3.8-flash-low（現在 gpt-6-astra）/);
 assert.match(o.hookSpecificOutput.additionalContext,/別製品.*agentctl run/);
 const s=one("SELECT current_execution_id FROM sessions WHERE product='codex' AND session_id='cx-1'");
 const e=one('SELECT e.*,d.model_id AS rec,d.used_llm FROM executions e JOIN decisions d ON d.decision_id=e.decision_id WHERE e.execution_id=?',s.current_execution_id);
 assert.deepEqual([e.initiator,e.model_id,e.rec,e.route,e.used_llm,e.managed],['codex','gpt-6-astra','gemini-3.8-flash-low','interactive',0,0]);
 assert.equal(one('SELECT prompt_chars,prompt_sha256 IS NOT NULL AS h FROM tasks WHERE task_id=?',e.task_id).h,1,'本文ではなくハッシュだけ保存');
 assert.ok(!readFileSync(join(env.AGENTCTL_DATA_DIR!,'telemetry.db')).includes(Buffer.from('READMEを要約して')),'DBにプロンプト本文がない');
});
test('TEST-002: Claude Codeで通常タスクを開始するとRouterとToken Monitorが適用される', ()=>{
 const tr=join(dir,'claude-main.jsonl');
 writeJsonl(tr,[{type:'user',message:{content:'x'}},{type:'assistant',message:{id:'msg_a',model:'claude-opus-5-5',usage:{input_tokens:3,cache_read_input_tokens:1000,cache_creation_input_tokens:200,output_tokens:40}}}]);
 H('claude','SessionStart',{session_id:'cl-1',model:'claude-opus-5-5',transcript_path:tr,source:'startup'});
 H('claude','UserPromptSubmit',{session_id:'cl-1',prompt:'この関数のバグを修正して',transcript_path:tr});
 H('claude','Stop',{session_id:'cl-1',transcript_path:tr,stop_hook_active:false});
 const e=one("SELECT e.execution_id,e.status,e.metering_status,d.model_id AS rec FROM executions e JOIN decisions d ON d.decision_id=e.decision_id WHERE e.session_product='claude' AND e.session_id='cl-1' AND e.agent_name='main'");
 assert.deepEqual([e.status,e.metering_status,e.rec],['completed','measured','claude-sonnet-5-5']);
 assert.equal(one('SELECT SUM(total) AS t FROM usage WHERE execution_id=?',e.execution_id).t,1243);
 // 2回目のStopで同じトランスクリプトを再読しても二重計上しない
 H('claude','Stop',{session_id:'cl-1',transcript_path:tr,stop_hook_active:false});
 assert.equal(one('SELECT SUM(total) AS t FROM usage WHERE execution_id=?',e.execution_id).t,1243);
});
test('セッション開始のHookを観測できなかった対話は、トランスクリプトの実モデルで補う', ()=>{
 const tr=join(dir,'claude-nostart.jsonl');
 writeJsonl(tr,[{type:'assistant',message:{id:'msg_ns',model:'claude-opus-5-5',usage:{input_tokens:1,cache_read_input_tokens:10,cache_creation_input_tokens:0,output_tokens:2}}}]);
 H('claude','UserPromptSubmit',{session_id:'cl-ns',prompt:'ログを要約して',transcript_path:tr});
 const exe=one("SELECT current_execution_id FROM sessions WHERE product='claude' AND session_id='cl-ns'").current_execution_id;
 assert.equal(one('SELECT model_id FROM executions WHERE execution_id=?',exe).model_id,null);
 H('claude','Stop',{session_id:'cl-ns',transcript_path:tr,stop_hook_active:false});
 assert.equal(one('SELECT model_id FROM executions WHERE execution_id=?',exe).model_id,'claude-opus-5-5');
 assert.equal(one("SELECT model_id FROM sessions WHERE product='claude' AND session_id='cl-ns'").model_id,'claude-opus-5-5');
});
test('TEST-003: Antigravityの対話: 会話記録から使用量を実測し、実行ループの終了ごとにタスクを区切り、直前の発言で分類する', ()=>{
 const tr=join(dir,'agy-ag1.jsonl');
 writeJsonl(tr,[{step_index:0,source:'USER_EXPLICIT',type:'USER_INPUT',content:'ログを要約して'},{step_index:1,type:'PLANNER_RESPONSE',input_tokens:100,cache_read_tokens:40,output_tokens:5}]);
 H('antigravity','PreInvocation',{conversationId:'ag-1',modelName:'Gemini 3.8 Flash (High)',transcriptPath:tr,invocationNum:1,initialNumSteps:0});
 const s=one("SELECT current_execution_id,model_id FROM sessions WHERE product='antigravity' AND session_id='ag-1'");
 assert.equal(s.model_id,'gemini-3.8-flash-high','表示名を登録簿IDへ正規化');
 const first=s.current_execution_id;
 assert.deepEqual(Object.values(one('SELECT d.difficulty,d.task_type FROM executions e JOIN decisions d ON d.decision_id=e.decision_id WHERE e.execution_id=?',first)),['L1','summarization'],'発言で分類');
 const stop=H('antigravity','Stop',{conversationId:'ag-1',modelName:'Gemini 3.8 Flash (High)',transcriptPath:tr,executionNum:1,terminationReason:'model_stop',fullyIdle:true});
 assert.equal(stop.decision,'stop');
 assert.deepEqual(Object.values(one('SELECT status,metering_status FROM executions WHERE execution_id=?',first)),['completed','measured']);
 assert.equal(one('SELECT SUM(total) AS t FROM usage WHERE execution_id=?',first).t,105);
 assert.equal(one("SELECT current_execution_id FROM sessions WHERE product='antigravity' AND session_id='ag-1'").current_execution_id,null,'次の発言は新しいタスク');
 writeJsonl(tr,[{step_index:0,source:'USER_EXPLICIT',type:'USER_INPUT',content:'ログを要約して'},{step_index:1,type:'PLANNER_RESPONSE',input_tokens:100,cache_read_tokens:40,output_tokens:5},{step_index:2,source:'USER_EXPLICIT',type:'USER_INPUT',content:'この関数のバグを修正して'},{step_index:3,type:'PLANNER_RESPONSE',input_tokens:300,cache_read_tokens:100,output_tokens:9}]);
 H('antigravity','PreInvocation',{conversationId:'ag-1',modelName:'Gemini 3.8 Flash (High)',transcriptPath:tr,invocationNum:2});
 const second=one("SELECT current_execution_id FROM sessions WHERE product='antigravity' AND session_id='ag-1'").current_execution_id;
 assert.notEqual(second,first);
 assert.equal(one('SELECT d.task_type FROM executions e JOIN decisions d ON d.decision_id=e.decision_id WHERE e.execution_id=?',second).task_type,'implementation');
 H('antigravity','Stop',{conversationId:'ag-1',transcriptPath:tr,executionNum:2,fullyIdle:true});
 assert.equal(one('SELECT SUM(total) AS t FROM usage WHERE execution_id=?',second).t,309,'前のターンの分を重ねて数えない');
 assert.ok(!readFileSync(join(env.AGENTCTL_DATA_DIR!,'telemetry.db')).includes(Buffer.from('バグを修正')),'発言の本文は保存しない');
 const keys=JSON.parse(one("SELECT detail_json FROM events WHERE kind='agy_payload_keys' AND session_id='ag-1'").detail_json);
 assert.ok(keys.keys.includes('conversationId'));
});
test('TEST-004: Codexのサブエージェント起動を識別し、子の使用量を親子関係つきで記録する', ()=>{
 H('codex','SessionStart',{session_id:'cx-2',model:'gpt-6-astra',source:'startup'});
 H('codex','UserPromptSubmit',{session_id:'cx-2',model:'gpt-6-astra',prompt:'実装して'});
 const o=H('codex','PreToolUse',{session_id:'cx-2',model:'gpt-6-astra',tool_name:'spawn_agent',tool_use_id:'call-1',tool_input:{agent_type:'explorer',message:'探して'}});
 const selected=o.hookSpecificOutput.updatedInput.model as 'gpt-6-luna'|'gpt-6.1-sol'|'gpt-6-astra';
 assert.ok(['gpt-6-luna','gpt-6.1-sol','gpt-6-astra'].includes(selected));assert.equal(o.hookSpecificOutput.updatedInput.reasoning_effort,undefined,'新しいspawn_agentにない引数は入れない');
 H('codex','SubagentStart',{session_id:'cx-2',agent_id:'th-child',agent_type:'explorer',model:selected});
 const ro=join(dir,'rollout-child.jsonl');
 writeJsonl(ro,[{type:'session_meta',payload:{id:'th-child',parent_thread_id:'th-main'}},{type:'turn_context',payload:{model:selected}},{type:'token_usage_record',payload:{thread_id:'th-child',response_id:'r9',usage:{input_tokens:500,cached_input_tokens:100,output_tokens:50,reasoning_output_tokens:5}}}]);
 H('codex','SubagentStop',{session_id:'cx-2',agent_id:'th-child',agent_type:'explorer',agent_transcript_path:ro,stop_hook_active:false});
 const parent=one("SELECT current_execution_id FROM sessions WHERE product='codex' AND session_id='cx-2'").current_execution_id;
 const c=one("SELECT * FROM executions WHERE agent_id='th-child'");
 assert.deepEqual([c.parent_execution_id,c.model_id,c.status,c.metering_status,c.managed,c.route],[parent,selected,'completed','measured',1,'native_subagent']);
 assert.equal(one('SELECT total FROM usage WHERE execution_id=?',c.execution_id).total,550);
 // 明示的に違うモデルを指定した起動は拒否
 assert.ok(denied(H('codex','PreToolUse',{session_id:'cx-2',tool_name:'spawn_agent',tool_use_id:'call-2',tool_input:{agent_type:'explorer',model:'gpt-6-astra'}})));
});
test('Codexの名前空間付きspawn_agent（collaboration）も判定し、modelだけを入れる', ()=>{
 H('codex','SessionStart',{session_id:'cx-ns',model:'gpt-6-astra',source:'startup'});
 H('codex','UserPromptSubmit',{session_id:'cx-ns',model:'gpt-6-astra',prompt:'探して'});
 for(const name of ['collaborationspawn_agent','collaboration.spawn_agent','collaboration__spawn_agent']){
  const o=H('codex','PreToolUse',{session_id:'cx-ns',tool_name:name,tool_use_id:`ns-${name}`,tool_input:{task_name:'t1',agent_type:'explorer',fork_turns:0,message:'m'}});
  assert.deepEqual({...o.hookSpecificOutput.updatedInput,model:undefined},{task_name:'t1',agent_type:'explorer',fork_turns:0,message:'m',model:undefined},name);
  assert.ok(['gpt-6-luna','gpt-6.1-sol','gpt-6-astra'].includes(o.hookSpecificOutput.updatedInput.model),name);
 }
 assert.equal(H('codex','PreToolUse',{session_id:'cx-ns',tool_name:'collaboration.wait_agent',tool_input:{timeout_ms:1}}),null);
 assert.equal(one("SELECT COUNT(*) AS n FROM events WHERE kind='agent_tool_seen' AND session_id='cx-ns'").n,1,'ツール名だけを記録');
});
test('Codex: モデル指定は確認済み（enforced）のため、子が別のモデルで起動したら失敗にして子のツールを拒否する', ()=>{
 H('codex','SessionStart',{session_id:'cx-en',model:'gpt-6.1-sol',source:'startup'});
 H('codex','UserPromptSubmit',{session_id:'cx-en',model:'gpt-6.1-sol',prompt:'実装して'});
 const pre=H('codex','PreToolUse',{session_id:'cx-en',tool_name:'collaborationspawn_agent',tool_use_id:'en-1',tool_input:{task_name:'t',agent_type:'explorer',fork_turns:0,message:'m'}});
 const actual=pre.hookSpecificOutput.updatedInput.model==='gpt-6.1-sol'?'gpt-6-luna':'gpt-6.1-sol';
 H('codex','SubagentStart',{session_id:'cx-en',agent_id:'th-en',agent_type:'explorer',model:actual});
 const c=one("SELECT * FROM executions WHERE agent_id='th-en'");
 assert.deepEqual([c.status,c.error_cause,c.managed],['failed','model_mismatch',1]);
 assert.ok(denied(H('codex','PreToolUse',{session_id:'cx-en',agent_id:'th-en',tool_name:'Bash',tool_input:{command:'ls'}})));
});
test('能力が未確認（unverified）の製品では、子が別のモデルで起動しても止めずに記録する', ()=>{
 const reg=join(env.AGENTCTL_REGISTRY_DIR!,'models.json'),orig=readFileSync(reg,'utf8');
 const j=JSON.parse(orig);j.providers.codex.native_subagents.model_override='unverified';writeFileSync(reg,JSON.stringify(j));
 try{
  H('codex','SessionStart',{session_id:'cx-nv',model:'gpt-6.1-sol',source:'startup'});
  H('codex','UserPromptSubmit',{session_id:'cx-nv',model:'gpt-6.1-sol',prompt:'実装して'});
  const pre=H('codex','PreToolUse',{session_id:'cx-nv',tool_name:'collaborationspawn_agent',tool_use_id:'nv-1',tool_input:{task_name:'t',agent_type:'explorer',fork_turns:0,message:'m'}});
  const actual=pre.hookSpecificOutput.updatedInput.model==='gpt-6.1-sol'?'gpt-6-luna':'gpt-6.1-sol';
  H('codex','SubagentStart',{session_id:'cx-nv',agent_id:'th-nv',agent_type:'explorer',model:actual});
  const c=one("SELECT * FROM executions WHERE agent_id='th-nv'");
  assert.deepEqual([c.status,c.model_id,c.managed],['running',actual,1]);
  assert.equal(one("SELECT COUNT(*) AS n FROM events WHERE kind='subagent_model_not_applied' AND execution_id=?",c.execution_id).n,1);
  assert.equal(H('codex','PreToolUse',{session_id:'cx-nv',agent_id:'th-nv',tool_name:'Bash',tool_input:{command:'ls'}}),null,'子のツールは止めない');
 }finally{writeFileSync(reg,orig)}
});
test('TEST-005: Claude Codeのサブエージェントは親子関連付けと計測ができ、承認と異なるモデルを検知する', ()=>{
 H('claude','SessionStart',{session_id:'cl-2',model:'claude-opus-5-5',source:'startup'});
 H('claude','UserPromptSubmit',{session_id:'cl-2',prompt:'ファイルを探して'});
 const o=H('claude','PreToolUse',{session_id:'cl-2',tool_name:'Agent',tool_use_id:'tu-1',tool_input:{subagent_type:'Explore',description:'d',prompt:'p'}});
 const selected=o.hookSpecificOutput.updatedInput.model as 'haiku'|'sonnet'|'opus';
 assert.ok(['haiku','sonnet','opus'].includes(selected));
 assert.equal(o.hookSpecificOutput.updatedInput.prompt,'p','他の入力は保持');
 H('claude','SubagentStart',{session_id:'cl-2',agent_id:'ag-x',agent_type:'Explore'});
 const at=join(dir,'agent-ag-x.jsonl');
 const canonical={haiku:'claude-haiku-5-5',sonnet:'claude-sonnet-5-5',opus:'claude-opus-5-5'}[selected];
 writeJsonl(at,[{type:'assistant',isSidechain:true,message:{id:'msg_s1',model:canonical,usage:{input_tokens:10,cache_read_input_tokens:90,cache_creation_input_tokens:0,output_tokens:5}}}]);
 // サブエージェント内のツール呼出しにもHookが掛かる（agent_idつき）
 assert.ok(denied(H('claude','PreToolUse',{session_id:'cl-2',agent_id:'ag-x',agent_type:'Explore',tool_name:'Bash',tool_input:{command:'claude -p hi'}})));
 H('claude','SubagentStop',{session_id:'cl-2',agent_id:'ag-x',agent_type:'Explore',agent_transcript_path:at,stop_hook_active:false});
 H('claude','PostToolUse',{session_id:'cl-2',tool_name:'Agent',tool_use_id:'tu-1',tool_input:{},tool_response:{status:'completed'}});
 const c=one("SELECT * FROM executions WHERE agent_id='ag-x'");
 const parent=one("SELECT current_execution_id FROM sessions WHERE product='claude' AND session_id='cl-2'").current_execution_id;
 assert.deepEqual([c.parent_execution_id,c.model_id,c.status,c.metering_status],[parent,canonical,'completed','measured']);
 assert.equal(one('SELECT SUM(total) AS t FROM usage WHERE execution_id=?',c.execution_id).t,105);
 assert.equal(one('SELECT COUNT(*) AS n FROM approvals WHERE execution_id=? AND issuer=?',c.execution_id,'hook').n,1,'子の承認が実行ID・モデルに紐付く');
 // 失敗した子のあとは、上限内で1段上の枠を許す
 const failed=H('claude','PreToolUse',{session_id:'cl-2',tool_name:'Agent',tool_use_id:'tu-2',tool_input:{subagent_type:'Explore',description:'d',prompt:'p'}}).hookSpecificOutput.updatedInput.model;
 H('claude','PostToolUse',{session_id:'cl-2',tool_name:'Agent',tool_use_id:'tu-2',tool_input:{},tool_response:{is_error:true}});
 const up=H('claude','PreToolUse',{session_id:'cl-2',tool_name:'Agent',tool_use_id:'tu-3',tool_input:{subagent_type:'Explore',description:'d',prompt:'p'}});
 assert.notEqual(up.hookSpecificOutput.updatedInput.model,failed);
 assert.ok(['sonnet','opus'].includes(up.hookSpecificOutput.updatedInput.model));
});
test('TEST-006: Antigravityのサブエージェント: モデルを指定できないため、推奨が親のモデルと同じなら許可、違えば拒否してagentctl runへ案内', ()=>{
 H('antigravity','PreInvocation',{conversationId:'ag-2',modelName:'gemini-3.8-flash-high',invocationNum:1});
 const no=H('antigravity','PreToolUse',{conversationId:'ag-2',modelName:'gemini-3.8-flash-high',toolCall:{name:'invoke_subagent',args:{agentName:'motion-analyst',task:'x'}},stepIdx:7});
 assert.equal(no.decision,'deny');assert.match(no.reason,/親のモデル gemini-3\.8-flash-high.*推奨は gemini-3\.8-flash-medium.*agentctl run/);
 assert.equal(one("SELECT COUNT(*) AS n FROM executions WHERE session_id='ag-2' AND route='native_subagent'").n,0,'拒否した子は記録しない');
 assert.deepEqual(JSON.parse(one("SELECT detail_json FROM events WHERE kind='spawn_args' AND session_id='ag-2'").detail_json).keys,['agentName','task'],'引数は項目名だけ記録');
 H('antigravity','PreInvocation',{conversationId:'ag-4',modelName:'gemini-3.8-flash-medium',invocationNum:1});
 H('antigravity','PreToolUse',{conversationId:'ag-4',modelName:'gemini-3.8-flash-medium',toolCall:{name:'invoke_subagent',args:{Subagents:[{Name:'x',Prompt:'秘密の本文'}],toolAction:'a',toolSummary:'s'}},stepIdx:1});
 const sa=JSON.parse(one("SELECT detail_json FROM events WHERE kind='spawn_args' AND session_id='ag-4'").detail_json);
 assert.deepEqual([sa.keys,sa.subagent_keys,sa.subagents],[['Subagents','toolAction','toolSummary'],['Name','Prompt'],1],'実機のinvoke_subagentの形。値は記録しない');
 assert.ok(!JSON.stringify(sa).includes('秘密の本文'));
 H('antigravity','PreInvocation',{conversationId:'ag-3',modelName:'Gemini 3.8 Flash (Medium)',invocationNum:1});
 const ok=H('antigravity','PreToolUse',{conversationId:'ag-3',modelName:'Gemini 3.8 Flash (Medium)',toolCall:{name:'invoke_subagent',args:{agentName:'motion-analyst',task:'x'}},stepIdx:8});
 assert.equal(ok.decision,'allow');
 const c=one("SELECT * FROM executions WHERE session_product='antigravity' AND session_id='ag-3' AND route='native_subagent'");
 const parent=one("SELECT current_execution_id FROM sessions WHERE product='antigravity' AND session_id='ag-3'").current_execution_id;
 assert.deepEqual([c.parent_execution_id,c.agent_name,c.model_id,c.task_type,c.status],[parent,'motion-analyst','gemini-3.8-flash-medium','video_analysis','approved']);
 H('antigravity','PostToolUse',{conversationId:'ag-3',toolCall:{name:'invoke_subagent',args:{}},stepIdx:8});
 const done=one('SELECT status,metering_status FROM executions WHERE execution_id=?',c.execution_id);
 assert.deepEqual([done.status,done.metering_status],['completed','unavailable'],'子単独の使用量は取れないことを明示');
});
test('Antigravityの対話中のサブエージェント: 子の会話を親の未着手の子に結び付け、入れ子として止めず、子の会話記録から実測する', ()=>{
 H('antigravity','PreInvocation',{conversationId:'agp',modelName:'gemini-3.8-flash-medium',invocationNum:1});
 const ok=H('antigravity','PreToolUse',{conversationId:'agp',modelName:'gemini-3.8-flash-medium',toolCall:{name:'invoke_subagent',args:{Subagents:[{}],toolAction:'a',toolSummary:'s'}},stepIdx:4});
 assert.equal(ok.decision,'allow');
 const child=one("SELECT execution_id FROM executions WHERE session_id='agp' AND route='native_subagent'").execution_id;
 const tr=join(dir,'agy-child.jsonl');writeJsonl(tr,[{step_index:0,type:'SYSTEM_MESSAGE'},{step_index:1,type:'PLANNER_RESPONSE',input_tokens:1000,cache_read_tokens:0,output_tokens:10}]);
 const cenv={...env,ANTIGRAVITY_CONVERSATION_ID:'agp'};
 const pre=H('antigravity','PreInvocation',{conversationId:'agc',modelName:'gemini-3.8-flash-medium',transcriptPath:tr,invocationNum:1},cenv);
 assert.deepEqual(pre,{},'入れ子として止めない（停止や拒否の指示を返さない）');
 assert.equal(one("SELECT agent_id FROM executions WHERE execution_id=?",child).agent_id,'agc');
 assert.equal(one("SELECT COUNT(*) AS n FROM executions WHERE session_id='agc'").n,0,'子の会話で別の対話タスクを作らない');
 H('antigravity','Stop',{conversationId:'agc',transcriptPath:tr,executionNum:1,fullyIdle:true},cenv);
 H('antigravity','PostToolUse',{conversationId:'agp',toolCall:{name:'invoke_subagent',args:{}},stepIdx:4});
 const c=one('SELECT status,metering_status FROM executions WHERE execution_id=?',child);
 assert.deepEqual([c.status,c.metering_status],['completed','measured']);
 assert.equal(one('SELECT SUM(total) AS t,COUNT(*) AS n FROM usage WHERE execution_id=?',child).t,1010);
 assert.equal(JSON.parse(one("SELECT detail_json FROM events WHERE kind='agy_payload_keys' AND session_id='agc'").detail_json).env_conversation_is_self,false);
});
test('Antigravityの対話中のサブエージェント（実機の順序）: 親のStopで親の会話記録の子IDから結び付け、子の使用量を移して実測する', ()=>{
 const ptr=join(dir,'agy-parent2.jsonl'),ctr=join(dir,'agy-child2.jsonl');
 writeJsonl(ptr,[{step_index:0,type:'USER_INPUT',content:'x'},{step_index:1,type:'PLANNER_RESPONSE',input_tokens:500,cache_read_tokens:0,output_tokens:5}]);
 H('antigravity','PreInvocation',{conversationId:'agp2',modelName:'gemini-3.8-flash-medium',transcriptPath:ptr,invocationNum:1});
 assert.equal(H('antigravity','PreToolUse',{conversationId:'agp2',modelName:'gemini-3.8-flash-medium',toolCall:{name:'invoke_subagent',args:{Subagents:[{}],toolAction:'a',toolSummary:'s'}},stepIdx:2}).decision,'allow');
 const child=one("SELECT execution_id FROM executions WHERE session_id='agp2' AND route='native_subagent'").execution_id;
 H('antigravity','PostToolUse',{conversationId:'agp2',toolCall:{name:'invoke_subagent',args:{}},stepIdx:2});
 // 子の会話: 環境変数は子自身のID。独立の対話タスクとして記録される。
 writeJsonl(ctr,[{step_index:0,type:'SYSTEM_MESSAGE'},{step_index:1,type:'PLANNER_RESPONSE',input_tokens:1000,cache_read_tokens:0,output_tokens:10},{step_index:2,type:'PLANNER_RESPONSE',input_tokens:2000,cache_read_tokens:0,output_tokens:20}]);
 const self={...env,ANTIGRAVITY_CONVERSATION_ID:'00000000-0000-4000-8000-0000000000c2'};
 const cid='00000000-0000-4000-8000-0000000000c2';
 H('antigravity','PreInvocation',{conversationId:cid,modelName:'gemini-3.8-flash-medium',transcriptPath:ctr,invocationNum:1},self);
 H('antigravity','Stop',{conversationId:cid,transcriptPath:ctr,executionNum:1,fullyIdle:true},self);
 assert.equal(one("SELECT COUNT(*) AS n FROM executions WHERE session_id=? AND route='interactive'",cid).n,1);
 // 親のStop: 会話記録に子の会話IDがある。子の会話記録は既定の場所（HOME配下）に置く。
 const home=join(dir,'home2'),cpath=`${home}/.gemini/antigravity-cli/brain/${cid}/.system_generated/logs/transcript.jsonl`;
 mkdirSync(dirname(cpath),{recursive:true});writeJsonl(cpath,readFileSync(ctr,'utf8').trim().split('\n').map(l=>JSON.parse(l)));
 writeJsonl(ptr,[{step_index:0,type:'USER_INPUT',content:'x'},{step_index:1,type:'PLANNER_RESPONSE',input_tokens:500,cache_read_tokens:0,output_tokens:5},
  {step_index:2,source:'MODEL',type:'GENERIC',content:`Created the following subagents:\n{\n  "conversationId":  "${cid}",\n  "logAbsoluteUri":  "file:///x"\n}`}]);
 const oldHome=process.env.HOME;process.env.HOME=home;
 try{H('antigravity','Stop',{conversationId:'agp2',transcriptPath:ptr,executionNum:1,fullyIdle:true});H('antigravity','Stop',{conversationId:'agp2',transcriptPath:ptr,executionNum:2,fullyIdle:true})}finally{process.env.HOME=oldHome}
 const c=one('SELECT agent_id,status,metering_status,model_id FROM executions WHERE execution_id=?',child);
 assert.deepEqual([c.agent_id,c.status,c.metering_status,c.model_id],[cid,'completed','measured','gemini-3.8-flash-medium']);
 assert.equal(one('SELECT SUM(total) AS t FROM usage WHERE execution_id=?',child).t,3030,'子の全ステップを1回だけ計上（2回目のStopでも増えない）');
 const orphan=one("SELECT parent_execution_id,metering_status FROM executions WHERE session_id=? AND route='interactive'",cid);
 assert.deepEqual([orphan.parent_execution_id,orphan.metering_status],[child,'included_in_parent']);
 assert.equal(one("SELECT COUNT(*) AS n FROM usage u JOIN executions e ON e.execution_id=u.execution_id WHERE e.session_id=? AND e.route='interactive'",cid).n,0,'独立の対話側に使用量を残さない');
 assert.equal(one("SELECT COUNT(*) AS n FROM events WHERE kind='agy_child_session_bound' AND execution_id=?",child).n,1);
});
test('Antigravity: 拒否しないコマンドは常に許可し、AI CLIの直接起動は拒否する', ()=>{
 const run=(c:string)=>H('antigravity','PreToolUse',{conversationId:'allow-1',modelName:'gemini-3.8-flash-low',toolCall:{name:'run_command',args:{CommandLine:c}},stepIdx:1});
 assert.deepEqual(run('ls -la'),{decision:'allow'});
 assert.deepEqual(run('node --test orchestration/tests/router.test.ts'),{decision:'allow'});
 assert.equal(run('codex exec "x"').decision,'deny');
 assert.equal(run('rm .agents/hooks.json').decision,'deny');
});
test('TEST-014: Hookの無効化・設定変更を拒否し、拒否を記録する', ()=>{
 const tries:[string,string,Record<string,unknown>][]=[
  ['claude','Edit',{file_path:join(process.cwd(),'.claude/settings.json'),old_string:'a',new_string:'b'}],
  ['claude','Write',{file_path:'.claude/settings.local.json',content:'{"disableAllHooks":true}'}],
  ['claude','Bash',{command:'claude --bare -p x'}],
  ['codex','apply_patch',{input:'*** Begin Patch\n*** Update File: .codex/hooks.json\n*** End Patch'}],
  ['codex','Bash',{command:'codex -c features.hooks=false exec x'}],
  ['antigravity','run_command',{CommandLine:'rm .agents/hooks.json'}],
  ['claude','Read',{file_path:`${process.env.HOME}/.config/agentctl/approval.key`}],
 ];
 for(const [p,tool,input] of tries){
  const payload=p==='antigravity'?{conversationId:'tamper',toolCall:{name:tool,args:input}}:{session_id:'tamper',tool_name:tool,tool_input:input};
  assert.ok(denied(H(p as 'claude',`PreToolUse`,payload)),`${p} ${tool} ${JSON.stringify(input)}`);
 }
 assert.ok(one("SELECT COUNT(*) AS n FROM events WHERE kind LIKE 'deny_%' AND session_id='tamper'").n>=7);
 // 人が保守モードで起動したセッションだけはHook設定を編集できる（鍵は不可）
 assert.ok(!denied(H('claude','PreToolUse',{session_id:'maint',tool_name:'Edit',tool_input:{file_path:'.claude/settings.json'}},{...env,AGENTCTL_MAINTENANCE:'1'})));
 assert.ok(denied(H('claude','PreToolUse',{session_id:'maint',tool_name:'Read',tool_input:{file_path:`${process.env.HOME}/.config/agentctl/approval.key`}},{...env,AGENTCTL_MAINTENANCE:'1'})));
});
test('TEST-015: ルーティングなしのCLI直接起動を拒否し、入れ子の未承認セッションも止める', ()=>{
 for(const [p,cmd] of [['claude','codex exec "x"'],['codex','claude -p hi'],['antigravity','gemini -p x'],['claude','curl https://generativelanguage.googleapis.com/v1beta/models/x:generateContent']] as const){
  const payload=p==='antigravity'?{conversationId:'d1',toolCall:{name:'run_command',args:{CommandLine:cmd}}}:{session_id:'d1',tool_name:p==='codex'?'exec_command':'Bash',tool_input:{command:cmd}};
  assert.ok(denied(H(p,'PreToolUse',payload)),cmd);
 }
 assert.ok(!denied(H('claude','PreToolUse',{session_id:'d1',tool_name:'Bash',tool_input:{command:'scripts/agentctl run --task t.json'}})));
 // 親セッションのBashから起動された別のCLIセッション（Hookの環境変数で判定）
 const nested={...env,AGENTCTL_PARENT_SESSION:'claude:parent-1'};
 H('codex','SessionStart',{session_id:'nest-1',model:'gpt-6-luna'},nested);
 const b=H('codex','UserPromptSubmit',{session_id:'nest-1',prompt:'x'},nested);
 assert.equal(b.decision,'block');assert.match(b.reason,/入れ子/);
 assert.ok(denied(H('codex','PreToolUse',{session_id:'nest-1',tool_name:'Bash',tool_input:{command:'ls'}},nested)));
 const fromAgy={...env,ANTIGRAVITY_CONVERSATION_ID:'agy-parent'};
 H('claude','SessionStart',{session_id:'nest-2',model:'claude-haiku-5-5'},fromAgy);
 assert.equal(H('claude','UserPromptSubmit',{session_id:'nest-2',prompt:'x'},fromAgy).decision,'block');
});
test('改善案の確認・適用はCodexのPMだけHookを通す（approveは全製品で拒否）', ()=>{
 const cmd=(c:string)=>({session_id:'pm-1',tool_name:'Bash',tool_input:{command:c}});
 assert.ok(!denied(H('codex','PreToolUse',cmd('scripts/agentctl optimize review prp_x --decision approve --reviewer codex-pm'))));
 assert.ok(!denied(H('codex','PreToolUse',cmd('scripts/agentctl optimize apply prp_x --by codex-pm'))));
 assert.ok(denied(H('codex','PreToolUse',cmd('scripts/agentctl approve rdc_x --reason y'))));
 assert.ok(denied(H('claude','PreToolUse',cmd('scripts/agentctl optimize apply prp_x'))));
 assert.ok(denied(H('antigravity','PreToolUse',{conversationId:'pm-2',toolCall:{name:'run_command',args:{CommandLine:'scripts/agentctl optimize review prp_x --decision approve --reviewer codex-pm'}}})));
});
test('Gatewayが起動した子セッションは承認とモデルを照合する（一致なら通し、異なれば止める）', ()=>{
 const exe=newId('exe');
 db.prepare("INSERT INTO executions(execution_id,task_id,initiator,task_type,status,managed,auth_mode,metering_status,updated_at,provider,model_id) VALUES(?,?,'gateway','general','running',1,'subscription','missing',?,'codex','gpt-6-luna')").run(exe,'tsk_0000000000hh',now());
 const {token}=mint(db,{execution_id:exe,decision_id:newId('rdc'),task_id:'tsk_0000000000hh',provider:'codex',model_id:'gpt-6-luna',reasoning_level:'low',initiator:'gateway',issuer:'gateway'},60);
 const child={...env,AGENTCTL_EXECUTION_ID:exe,AGENTCTL_APPROVAL:token,AGENTCTL_PARENT_SESSION:'claude:p'};
 H('codex','SessionStart',{session_id:'child-ok',model:'gpt-6-luna'},child);
 assert.equal(H('codex','UserPromptSubmit',{session_id:'child-ok',prompt:'x'},child),null,'照合済みの子は通す');
 assert.equal(one("SELECT session_id FROM executions WHERE execution_id=?",exe).session_id,'child-ok');
 H('codex','SessionStart',{session_id:'child-bad',model:'gpt-6-astra'},child);
 assert.equal(H('codex','UserPromptSubmit',{session_id:'child-bad',prompt:'x'},child).decision,'block');
 assert.ok(one("SELECT COUNT(*) AS n FROM events WHERE kind='child_session_rejected'").n>=1);
});
test('Hookの内部エラー時: AI起動に関わる判定は拒否、それ以外は妨げない', ()=>{
 const saved=process.env.AGENTCTL_REGISTRY_DIR;process.env.AGENTCTL_REGISTRY_DIR=join(dir,'missing');
 try{
  assert.ok(denied(H('claude','PreToolUse',{session_id:'e1',tool_name:'Agent',tool_input:{subagent_type:'Explore'}})));
  assert.equal(H('claude','PreToolUse',{session_id:'e1',tool_name:'Bash',tool_input:{command:'ls'}}),null);
  assert.match(readFileSync(join(env.AGENTCTL_DATA_DIR!,'hook-errors.log'),'utf8'),/PreToolUse/);
 }finally{process.env.AGENTCTL_REGISTRY_DIR=saved}
});
