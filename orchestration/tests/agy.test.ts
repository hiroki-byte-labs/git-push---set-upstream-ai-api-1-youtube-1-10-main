// Antigravityの会話記録（transcript.jsonl）からの計測と、Gateway経由の子の会話の結び付け。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {sandbox,writeJsonl} from './helpers.ts';
import {agyLastUserInput,agyTranscriptUsage,fromAgyStep} from '../telemetry/normalize.ts';
import {linkAgyChildren} from '../gateway/gateway.ts';
import {recordUnavailable} from '../telemetry/monitor.ts';
import {now} from '../gateway/config.ts';

test('会話記録のステップ使用量: total=input+output、cache_readは入力の内数、思考の内数は取得不可', ()=>{
 const n=fromAgyStep({input_tokens:38780,cache_read_tokens:12213,output_tokens:2527});
 assert.deepEqual(n.tokens,{input_total:38780,input_uncached:26567,cache_read:12213,cache_write:null,output_total:2527,reasoning:null,total:41307});
 assert.equal(n.methods.reasoning,'unavailable');
 const recs=[{step_index:0,source:'USER_EXPLICIT',type:'USER_INPUT',content:'動画のフレームを解析して'},{step_index:1,type:'PLANNER_RESPONSE',input_tokens:10,cache_read_tokens:0,output_tokens:2},{step_index:2,type:'GENERIC'},{step_index:3,type:'PLANNER_RESPONSE',input_tokens:20,cache_read_tokens:5,output_tokens:3}];
 const u=agyTranscriptUsage(recs,'conv-1','gemini-3.8-flash-low');
 assert.deepEqual(u.map(x=>[x.source.dedupe_key,x.tokens.total]),[['agy:step:conv-1:1',12],['agy:step:conv-1:3',23]]);
 assert.equal(agyLastUserInput(recs),'動画のフレームを解析して');
});
test('Gateway: 同じ実行の承認で動いた別の会話を子とみなし、その会話記録の使用量を子の実行に記録する', ()=>{
 const {db,dir}=sandbox();
 const ins=(id:string,parent:string|null,route:string)=>db.prepare("INSERT INTO executions(execution_id,task_id,parent_execution_id,initiator,task_type,status,managed,route,auth_mode,metering_status,session_product,session_id,start_time,updated_at,provider) VALUES(?,'tsk_0000000000ag',?,'claude','general','completed',1,?,'subscription','missing','antigravity','parent-conv',?,?,'antigravity')").run(id,parent,route,now(),now());
 ins('exe_0000000000p0',null,'cli');ins('exe_0000000000c0','exe_0000000000p0','native_subagent');
 recordUnavailable(db,'exe_0000000000c0','antigravity',null,'子単独の使用量を出さない','subscription');
 const tr=join(dir,'child','transcript.jsonl');mkdirSync(join(dir,'child'),{recursive:true});
 writeJsonl(tr,[{step_index:0,type:'SYSTEM_MESSAGE'},{step_index:1,type:'PLANNER_RESPONSE',input_tokens:14391,cache_read_tokens:0,output_tokens:95}]);
 const ses=db.prepare('INSERT INTO sessions(product,session_id,model_id,managed_execution_id,transcript_path,started_at,last_seen_at) VALUES(?,?,?,?,?,?,?)');
 ses.run('antigravity','parent-conv','gemini-3.8-flash-medium','exe_0000000000p0',null,now(),now());
 ses.run('antigravity','child-conv','gemini-3.8-flash-medium','exe_0000000000p0',tr,now(),now());
 assert.equal(linkAgyChildren(db,'exe_0000000000p0','parent-conv'),1);
 const c=db.prepare("SELECT metering_status,agent_id FROM executions WHERE execution_id='exe_0000000000c0'").get() as {metering_status:string;agent_id:string};
 assert.deepEqual([c.metering_status,c.agent_id],['measured','child-conv']);
 assert.equal((db.prepare("SELECT SUM(total) AS t,COUNT(*) AS n FROM usage WHERE execution_id='exe_0000000000c0'").get() as {t:number}).t,14486);
 assert.equal(linkAgyChildren(db,'exe_0000000000p0','parent-conv'),1,'再実行しても');
 assert.equal((db.prepare("SELECT SUM(total) AS t FROM usage WHERE execution_id='exe_0000000000c0'").get() as {t:number}).t,14486,'二重計上しない');
});
