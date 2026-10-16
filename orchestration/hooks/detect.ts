// シェルコマンドとファイル編集の判定（Hook用、軽量・LLM不使用）。
// 文字列の難読化（base64→sh、eval変数、外部スクリプト内の呼出し）は判定できない。
// 子セッションのHook（未承認の入れ子実行の拒否）と agentctl doctor --audit の照合で補う。

export type CommandVerdict={kind:'ai_invocation'|'human_only'|'protected_access'|'hook_tamper'|'managed'|'ok';reason:string;program?:string};
const WRAPPERS=new Set(['env','command','exec','nohup','time','sudo','nice','caffeinate','timeout','gtimeout','xargs','npx','bunx','pnpx','stdbuf','then','do','else','if','while','until']);
const AI_HOSTS=/(api\.anthropic\.com|api\.openai\.com|generativelanguage\.googleapis\.com|aiplatform\.googleapis\.com|chatgpt\.com\/backend-api|api\.claude\.ai)/i;
// LLMを動かさない参照系の操作だけを許可する。それ以外のAI CLI起動は agentctl run を通す。
const SAFE:Record<string,RegExp>={
 claude:/^(--version|-v|--help|-h|auth status|doctor|mcp list|plugins? list)(\s|$)/,
 codex:/^(--version|-V|--help|-h|help|doctor|features( list)?|debug models|login status|mcp list|completion|apply)(\s|$)/,
 agy:/^(--help|-h|help|changelog|models|agents?|mcp list|plugins? list)(\s|$)|^(--output-format \S+ )?(-p|--print|--prompt) \/(hooks|usage|quota|credits|help|changelog|config|permissions|model|effort|skills)( --output-format \S+)?$/,
 gemini:/^(--version|-v|--help|-h|mcp list|extensions list)(\s|$)/,
 ant:/^(auth status|--version|--help)(\s|$)/,
};
const TAMPER_FLAGS=/(--bare\b|--safe-mode\b|--dangerously-bypass-hook-trust\b|--disable[= ]hooks\b|features\.hooks\s*=\s*false|disableAllHooks|allowManagedHooksOnly|--setting-sources[= ]user\b|--restricted\b|--ignore-user-config\b)/;
const TAMPER_ENV=/^(CLAUDE_CODE_SIMPLE|CLAUDE_CODE_SAFE_MODE)=(1|true)$/;
const KEY_PATH=/(\.config\/agentctl(\/|\b)|approval\.key\b)/;
const DB_PATH=/data\/telemetry\.db(-wal|-shm)?\b/;
const SQL_WRITE=/\b(insert|update|delete|drop|alter|create|replace|attach|vacuum|reindex)\b|pragma\s+\w+\s*=/i;
const HOOK_CONFIG_TEXT=/(\.claude\/settings(\.local)?\.json|\.codex\/(hooks\.json|config\.toml)|(\.|_)agents?\/hooks\.json|orchestration\/model-registry\/(routing-policy|models)\.json|orchestration\/hooks\/|scripts\/agentctl-hook|\.gemini\/config\/hooks\.json)/;
const WRITERS=/^(sed|perl|tee|cp|mv|rm|ln|chmod|chflags|truncate|install|rsync|dd|unlink|git)$/;
const HUMAN_ONLY=/^(approve|optimize (review|apply|rollback)|init --rotate)(\s|$)/;

// 引用符を考慮して、; && || | 改行 $( ) ` で区切る。$( ) と ` ` の中身も1つのコマンドとして返す。
export function segments(command:string):string[]{
 const out:string[]=[];let cur='',q:"'"|'"'|null=null;
 const push=()=>{if(cur.trim())out.push(cur.trim());cur=''};
 for(let i=0;i<command.length;i++){
  const c=command[i]!,n=command[i+1];
  if(q==="'"){if(c==="'")q=null;cur+=c;continue}
  if(c==='\\'&&n!==undefined){cur+=c+n;i++;continue}
  if(q==='"'){if(c==='"'){q=null;cur+=c;continue}if(c==='`'||(c==='$'&&n==='(')){push();if(c==='$')i++;continue}cur+=c;continue}
  if(c==="'"||c==='"'){q=c;cur+=c;continue}
  if(c===';'||c==='\n'||c==='`'||c===')'||c==='('){push();continue}
  if(c==='$'&&n==='('){push();i++;continue}
  if((c==='&'&&n==='&')||(c==='|'&&n==='|')){push();i++;continue}
  // 2>&1・>&2・&> はリダイレクトで、コマンドの区切りではない
  if(c==='&'&&(command[i-1]==='>'||n==='>')){cur+=c;continue}
  if(c==='|'||c==='&'){push();continue}
  cur+=c;
 }
 push();return out;
}
// リダイレクト（> out、2>&1、<in など）を引数から除く。参照系コマンドの判定に混ぜない。
function stripRedirects(ts:string[]):string[]{
 const out:string[]=[];
 for(let i=0;i<ts.length;i++){const t=ts[i]!;if(/^(\d*>>?|&>>?|\d*<)$/.test(t)){i++;continue}if(/^(\d*>>?|&>>?|\d*<)\S+$/.test(t)||/^\d*>&\d+$/.test(t))continue;out.push(t)}
 return out;
}
function tokens(seg:string):string[]{return (seg.match(/"(?:\\.|[^"])*"|'[^']*'|\S+/g)??[]).map(t=>t.replace(/^(['"])([\s\S]*)\1$/,'$2'))}
function program(ts:string[]):{prog:string;rest:string[];env:string[]}|null{
 let i=0;const env:string[]=[];
 while(i<ts.length){const t=ts[i]!;const prev=i>0?ts[i-1]!.split('/').pop()!:'';
  if(/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)){env.push(t);i++;continue}
  if(/^(-u|--unset|-C|--chdir|-S|--split-string|-n|-k|--kill-after|-s|--signal)$/.test(t)&&i+1<ts.length&&ts.slice(0,i).some(x=>WRAPPERS.has(x.split('/').pop()!))){i+=2;continue}
  if(WRAPPERS.has(t.split('/').pop()!)||(t.startsWith('-')&&ts.slice(0,i).some(x=>WRAPPERS.has(x.split('/').pop()!)))||(/^\d+[smh]?$/.test(t)&&/timeout$/.test(prev))){i++;continue}
  break}
 if(i>=ts.length)return null;
 return {prog:ts[i]!,rest:ts.slice(i+1),env};
}
function agentctlArgs(prog:string,rest:string[]):string[]|null{
 const base=prog.split('/').pop()!;
 if(base==='agentctl')return rest;
 const k=rest.findIndex(a=>/(^|\/)orchestration\/gateway\/agentctl\.ts$/.test(a));
 if(/^(node|tsx|bun|run)$/.test(base)&&k>=0)return rest.slice(k+1);
 return null;
}
// ヒアドキュメントの本文は文章やデータのことが多く、コマンドとして判定すると誤って拒否する（2026-10-11の実機で2回）。
// 本文を取り除いて判定し、シェルへ流し込む本文（bash <<EOF 等）だけは本文もコマンドとして判定する。
// 承認鍵・計測DBのパスは、Pythonなどの本文から読み書きされうるため本文中でも拒否する（安全側）。
export function splitHeredocs(command:string):{command:string;bodies:{shell:boolean;body:string}[]}{
 const bodies:{shell:boolean;body:string}[]=[];
 const re=/<<-?[ \t]*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1([^\n]*)\n([\s\S]*?)\n[ \t]*\2[ \t]*(?=\n|$)/g;
 const out=command.replace(re,(_m,_q,_tag,rest:string,body:string,offset:number)=>{
  const line=command.slice(command.lastIndexOf('\n',offset-1)+1,offset);
  bodies.push({shell:/(^|[\s|;&(])(sh|bash|zsh|dash|ksh)(\s+-[A-Za-z]+)*\s*$/.test(line),body});
  return `<<HEREDOC${rest}`;
 });
 return {command:out,bodies};
}
export function classifyCommand(command:string,depth=0):CommandVerdict{
 let verdict:CommandVerdict={kind:'ok',reason:''};
 const hd=splitHeredocs(command);
 for(const b of hd.bodies){
  if(b.shell&&depth<3){const inner=classifyCommand(b.body,depth+1);if(inner.kind==='managed')verdict=inner;else if(inner.kind!=='ok')return inner}
  else if(KEY_PATH.test(b.body))return {kind:'protected_access',reason:'承認鍵へのアクセスは禁止（ヒアドキュメントの本文に承認鍵のパスがある。文章ならファイル編集ツールで書く）'};
  else if(DB_PATH.test(b.body)&&SQL_WRITE.test(b.body))return {kind:'protected_access',reason:'計測DBの直接変更は禁止（ヒアドキュメントの本文）'};
 }
 command=hd.command;
 for(const seg of segments(command)){
  const ts=tokens(seg),p=program(ts);
  // リダイレクトでHook設定へ書き込む
  if(/>{1,2}\s*\S*/.test(seg)&&[...seg.matchAll(/>{1,2}\s*(\S+)/g)].some(m=>HOOK_CONFIG_TEXT.test(m[1]!)))return {kind:'hook_tamper',reason:'Hook設定・ルーティング設定へリダイレクトで書き込もうとしている'};
  if(!p)continue;
  const base=p.prog.split('/').pop()!,args=stripRedirects(p.rest).join(' ');
  if(KEY_PATH.test(seg)&&!/^(ls|stat|test)$/.test(base))return {kind:'protected_access',reason:'承認鍵へのアクセスは禁止（Gatewayだけが使う）'};
  if(DB_PATH.test(seg)&&(base!=='sqlite3'&&!/^(ls|stat|test|du)$/.test(base)||SQL_WRITE.test(args)))return {kind:'protected_access',reason:'計測DBの直接変更は禁止（参照は agentctl usage / report、またはSELECTだけのsqlite3）'};
  if(WRITERS.test(base)&&HOOK_CONFIG_TEXT.test(args)&&!(base==='git'&&!/^(checkout|restore|rm|mv|apply|reset)\b/.test(args))&&!(base==='sed'&&!/(^|\s)-i/.test(args))&&!(base==='perl'&&!/(^|\s)-\w*i/.test(args)))return {kind:'hook_tamper',reason:'Hook設定・ルーティング設定・Hook実装をシェルから書き換えようとしている'};
  const ctl=agentctlArgs(p.prog,p.rest);
  if(ctl){if(HUMAN_ONLY.test(ctl.join(' ')))return {kind:'human_only',reason:`agentctl ${ctl[0]} は人が端末で実行するコマンド（AIのツール実行からは拒否）`};verdict={kind:'managed',reason:'agentctl経由'};continue}
  if(/^(sh|bash|zsh|dash|ksh)$/.test(base)){const i=p.rest.indexOf('-c');if(i>=0&&p.rest[i+1]&&depth<3){const inner=classifyCommand(p.rest[i+1]!,depth+1);if(inner.kind==='managed')verdict=inner;else if(inner.kind!=='ok')return inner}continue}
  if(base==='eval'&&/\b(claude|codex|agy|gemini)\b/.test(args))return {kind:'ai_invocation',reason:'evalでAI CLIを起動しようとしている',program:base};
  if(base in SAFE){
   if(TAMPER_FLAGS.test(args)||p.env.some(e=>TAMPER_ENV.test(e)))return {kind:'hook_tamper',reason:`Hook・計測を迂回する起動指定: ${(args.match(TAMPER_FLAGS)??p.env.filter(e=>TAMPER_ENV.test(e)))[0]}`,program:base};
   if(SAFE[base]!.test(args))continue;
   return {kind:'ai_invocation',reason:`${base} の直接起動（agentctl run を通していない）`,program:base};
  }
  if(/^(curl|wget|http|https|xh|python3?|node|deno|bun|ruby|perl)$/.test(base)&&AI_HOSTS.test(args))return {kind:'ai_invocation',reason:`AI APIへの直接アクセス（${args.match(AI_HOSTS)![0]}）`,program:base};
 }
 return verdict;
}
const PROTECTED_FILE=[/(^|\/)\.config\/agentctl\//,/approval\.key$/,/(^|\/)data\/telemetry\.db(-wal|-shm)?$/];
const HOOK_CONFIG_FILE=/(^|\/)(\.claude\/settings(\.local)?\.json|\.codex\/(hooks\.json|config\.toml)|(\.|_)agents?\/hooks\.json|orchestration\/model-registry\/(routing-policy|models)\.json|orchestration\/hooks\/[^/]+|scripts\/agentctl-hook|\.gemini\/config\/hooks\.json)$/;
// ファイル編集ツールの対象が保護ファイルか。
export function isProtectedFile(path:string):{protected:boolean;reason:string}{
 const p=path.replaceAll('\\','/');
 if(PROTECTED_FILE.some(r=>r.test(p)))return {protected:true,reason:'承認鍵・計測DBは直接編集できない'};
 if(HOOK_CONFIG_FILE.test(p))return {protected:true,reason:'Hook設定・ルーティング設定・Hook実装は保護対象。人が直接変更するか、ルーティング設定は agentctl optimize apply（PM確認つき）で変更する'};
 return {protected:false,reason:''};
}
// apply_patch本文から対象パスを取り出す。
export function patchPaths(text:string):string[]{return [...text.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm),...text.matchAll(/^\*\*\* Move to: (.+)$/gm)].map(m=>m[1]!.trim())}
