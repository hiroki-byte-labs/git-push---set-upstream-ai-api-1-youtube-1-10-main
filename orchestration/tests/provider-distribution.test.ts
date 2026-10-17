import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sandbox,task} from './helpers.ts';
import {loadPolicy,loadRegistry} from '../gateway/config.ts';
import {route,type Env} from '../router/router.ts';
import type {TaskType,Initiator} from '../gateway/config.ts';
sandbox();
const {policy,sha256}=loadPolicy(),registry=loadRegistry();
const all:Env={authenticated:{claude:['subscription'],codex:['subscription'],antigravity:['subscription']},allowMock:false};
const choose=(type:TaskType,initiator:Initiator='codex',env:Env=all,extra:Record<string,unknown>={})=>route({task:{...task({preferred_provider:null,task_type:type,initiator}),...extra,task_id:'tsk_0000000000bb'},execution_id:'exe_0000000000bb',policy,policy_sha256:sha256,registry,env});
test('delegated tasks use provider roles instead of inheriting the initiator',()=>{
 for(const initiator of ['codex','claude','antigravity'] as const){
  assert.equal(choose('implementation',initiator).selected?.provider,'claude');
  assert.equal(choose('analysis',initiator).selected?.provider,'antigravity');
  assert.equal(choose('summarization',initiator).selected?.provider,'antigravity');
  assert.equal(choose('orchestration',initiator).selected?.provider,'codex');
 }
});
test('missing authentication falls back without reducing tier or enabling billed APIs',()=>{
 const noClaude:Env={...all,authenticated:{codex:['subscription'],antigravity:['subscription']}};
 const d=choose('implementation','codex',noClaude);
 assert.equal(d.selected?.provider,'antigravity');assert.equal(d.selected?.tier,'standard');
 const codexOnly:Env={...all,authenticated:{codex:['subscription'],'gemini-api':['api_key']}};
 assert.equal(choose('analysis','codex',codexOnly).selected?.provider,'codex');
 assert.equal(choose('video_analysis','codex',{...all,authenticated:{'gemini-api':['api_key']}}).selected,null);
});
test('native provider restrictions, explicit preferences and L4 independent review remain enforced',()=>{
 assert.equal(choose('implementation','codex',{...all,route:'native_subagent',restrictProvider:'codex'}).selected?.provider,'codex');
 assert.equal(choose('analysis','codex',all,{preferred_provider:'claude'}).selected?.provider,'claude');
 const critical=choose('design','codex',all,{difficulty:'L4',quality_requirement:'critical'});
 assert.equal(critical.selected?.tier,'high');assert.equal(critical.review.required,true);
 assert.notEqual(critical.review.provider,critical.selected?.provider);
});
