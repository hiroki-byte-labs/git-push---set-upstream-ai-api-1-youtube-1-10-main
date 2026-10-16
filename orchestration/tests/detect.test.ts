import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyCommand,isProtectedFile,patchPaths,segments} from '../hooks/detect.ts';

const kind=(c:string)=>classifyCommand(c).kind;
test('AI CLIの直接起動を検出する（TEST-015の判定部分）', ()=>{
 for(const c of ['claude -p "hi"','claude','codex exec "x"','codex "do it"','codex review','agy -p "hello"','agy','gemini -p x','cd x && codex exec -m gpt-6-astra -','FOO=1 claude --print hi','env -u A codex exec x','npx codex exec x','timeout 5 agy -p hi','bash -c "claude -p hi"','echo $(codex exec x)','eval codex exec','curl https://api.anthropic.com/v1/messages','python3 -c "x" https://generativelanguage.googleapis.com/v1beta','/opt/homebrew/bin/codex exec y'])
  assert.equal(kind(c),'ai_invocation',c);
});
test('LLMを動かさない参照系と、文字列としての言及は許可する', ()=>{
 for(const c of ['claude --version','claude auth status','codex --version','codex debug models','codex login status','codex features list','agy models','agy agents','agy -p "/hooks"','gemini --version','grep -r "codex exec" docs','echo "claude -p は禁止"','rg claude src','cat docs/agent-routing/setup.md','git log --oneline','ls ~/.codex/sessions'])
  assert.equal(kind(c),'ok',c);
});
test('参照系コマンドはリダイレクトや出力形式の指定があっても許可する（2026-10-11の実機で見つけた誤判定）', ()=>{
 for(const c of ['agy -p "/hooks" > /tmp/x.txt 2>&1','agy --output-format json -p "/usage"','codex --version >> log.txt','claude auth status 2>/dev/null','(agy -p "/hooks" & p=$!; sleep 1; kill $p)'])
  assert.equal(kind(c),'ok',c);
 for(const c of ['agy -p "要約して" > out.txt','codex exec x 2>&1 | tee log','claude -p hi &> out'])
  assert.equal(kind(c),'ai_invocation',c);
 assert.deepEqual(segments('a 2>&1 | b'),['a 2>&1','b']);
});
test('ヒアドキュメントの本文は文章として扱い、シェルへ流す本文だけ判定する（2026-10-11の誤判定）', ()=>{
 assert.equal(kind("cat >> notes.md <<'EOF'\nCodex 0.161 から codex 0.162.1 へ。claude -p は禁止\nEOF"),'ok');
 assert.equal(kind("python3 - <<'EOF'\nprint('agy -p は agentctl run で')\nEOF\necho done"),'ok');
 assert.equal(kind("bash <<'EOF'\ncodex exec hi\nEOF"),'ai_invocation','シェルへ流す本文は判定する');
 assert.equal(kind("sh -s <<EOF\nclaude -p x\nEOF"),'ai_invocation');
 assert.equal(kind("python3 - <<'EOF'\nopen('/Users/u/.config/agentctl/approval.key').read()\nEOF"),'protected_access','鍵のパスは本文でも拒否');
 assert.equal(kind("cat <<'EOF' | codex exec -\nhello\nEOF"),'ai_invocation','本文の外のコマンドは判定する');
});
test('agentctl経由は管理対象、人専用のサブコマンドは拒否', ()=>{
 assert.equal(kind('scripts/agentctl run --task t.json'),'managed');
 assert.equal(kind('./scripts/run orchestration/gateway/agentctl.ts status'),'managed');
 assert.equal(kind('scripts/agentctl approve rdc_x --reason y'),'human_only');
 assert.equal(kind('scripts/agentctl optimize apply prp_x'),'human_only');
 assert.equal(kind('scripts/agentctl optimize propose'),'managed');
});
test('Hook無効化・設定書換え・鍵とDBへの直接アクセスを検出する（TEST-014の判定部分）', ()=>{
 for(const c of ['claude --bare -p x','codex exec --dangerously-bypass-hook-trust x','codex --disable hooks','codex -c features.hooks=false exec x','CLAUDE_CODE_SIMPLE=1 claude -p x','claude --settings \'{"disableAllHooks":true}\' -p x','claude --safe-mode'])
  assert.equal(kind(c),'hook_tamper',c);
 for(const c of ['echo {} > .claude/settings.json','sed -i "" s/a/b/ .codex/hooks.json','rm .agents/hooks.json','cp x orchestration/model-registry/routing-policy.json','git checkout -- .claude/settings.json'])
  assert.equal(kind(c),'hook_tamper',c);
 for(const c of ['cat ~/.config/agentctl/approval.key','sqlite3 data/telemetry.db "delete from usage"','rm data/telemetry.db'])
  assert.equal(kind(c),'protected_access',c);
 assert.equal(kind('sqlite3 data/telemetry.db "select count(*) from usage"'),'ok');
 assert.equal(kind('git diff .claude/settings.json'),'ok');
});
test('引用符を考慮して区切る', ()=>{
 assert.deepEqual(segments('echo "a; b" && ls | wc'),['echo "a; b"','ls','wc']);
 assert.deepEqual(segments("echo 'x $(codex exec)'"),["echo 'x $(codex exec)'"]);
});
test('保護ファイルとapply_patchの対象', ()=>{
 assert.equal(isProtectedFile('/r/.claude/settings.json').protected,true);
 assert.equal(isProtectedFile('/r/.codex/hooks.json').protected,true);
 assert.equal(isProtectedFile('/r/orchestration/hooks/hook.ts').protected,true);
 assert.equal(isProtectedFile('/Users/u/.config/agentctl/approval.key').protected,true);
 assert.equal(isProtectedFile('/r/src/cli.ts').protected,false);
 assert.deepEqual(patchPaths('*** Begin Patch\n*** Update File: .codex/hooks.json\n@@\n*** Add File: a.ts\n*** End Patch'),['.codex/hooks.json','a.ts']);
});
