// 各製品の公式出力の使用量を共通形式へ正規化する。
// 共通形式: input_total=全入力（キャッシュ読み書きを含む）、cache_read/cache_writeはその内数、
// output_total=全出力（推論を含む）、reasoningはその内数、total=input_total+output_total。
// 取得できない値はnullとunavailable。内訳の重なりを製品ごとに解いて二重加算を防ぐ。
import type {Method,ModelEntry,Provider} from '../gateway/config.ts';

export type TokenKey='input_total'|'input_uncached'|'cache_read'|'cache_write'|'output_total'|'reasoning'|'total';
export const TOKEN_KEYS:TokenKey[]=['input_total','input_uncached','cache_read','cache_write','output_total','reasoning','total'];
export type Tokens=Record<TokenKey,number|null>;
export type Methods=Record<TokenKey,Method>;
export type SourceKind='cli_result'|'cli_event'|'transcript'|'rollout'|'api_response'|'hook_payload'|'test_fixture';
export type NormalizedUsage={provider:Provider;model_id:string|null;tokens:Tokens;methods:Methods;source:{kind:SourceKind;dedupe_key:string;session_id:string|null;cumulative:boolean};provider_reported_usd:number|null;note?:string};

const int=(v:unknown):number|null=>typeof v==='number'&&Number.isFinite(v)&&v>=0?Math.round(v):null;
function build(t:Partial<Tokens>,m:Partial<Methods>):{tokens:Tokens;methods:Methods}{
 const tokens={} as Tokens,methods={} as Methods;
 for(const k of TOKEN_KEYS){tokens[k]=t[k]??null;methods[k]=tokens[k]===null?'unavailable':(m[k]??'measured')}
 return {tokens,methods};
}
export function unavailable():{tokens:Tokens;methods:Methods}{return build({},{})}

// Anthropic（Claude Code -p の usage / modelUsage、トランスクリプトの message.usage）:
// input_tokensはキャッシュ読み書きを含まない。output_tokensは思考トークンを含む。
// 思考の内数はトランスクリプトの output_tokens_details.thinking_tokens にだけある（2.1.293の実ファイルで確認）。
export function fromAnthropic(u:Record<string,unknown>,opts:{outputMethod?:Method}={}){
 const inp=int(u.input_tokens??u.inputTokens),out=int(u.output_tokens??u.outputTokens);
 const cr=int(u.cache_read_input_tokens??u.cacheReadInputTokens)??0,cw=int(u.cache_creation_input_tokens??u.cacheCreationInputTokens)??0;
 const details=u.output_tokens_details as Record<string,unknown>|undefined,thinking=details?int(details.thinking_tokens):null;
 const inputTotal=inp===null?null:inp+cr+cw;
 return build({input_total:inputTotal,input_uncached:inp,cache_read:inp===null?null:cr,cache_write:inp===null?null:cw,output_total:out,reasoning:thinking,total:inputTotal===null||out===null?null:inputTotal+out},
  {output_total:opts.outputMethod??'measured',total:opts.outputMethod??'measured',reasoning:opts.outputMethod??'measured'});
}
// OpenAI / Codex（exec --jsonのturn.completed.usage、rolloutのtoken_usage_record）:
// input_tokensはcached_input_tokens・cache_write_input_tokensを含み、output_tokensはreasoning_output_tokensを含む
// （rolloutのtotal_tokens=input+outputで確認）。cache_write_input_tokensは0.161以降のみ。
export function fromOpenAI(u:Record<string,unknown>){
 const inp=int(u.input_tokens),cached=int(u.cached_input_tokens)??0,write=int(u.cache_write_input_tokens),out=int(u.output_tokens),reason=int(u.reasoning_output_tokens);
 return build({input_total:inp,input_uncached:inp===null?null:Math.max(0,inp-cached-(write??0)),cache_read:inp===null?null:cached,cache_write:write,output_total:out,reasoning:reason,total:inp===null||out===null?null:inp+out},{});
}
// Antigravity（agy -p --output-format json の usage）: 内訳の包含関係は公式に明記がない。
// 報告されたtotal_tokensとの算術的な一致で包含関係を判定し、一致しなければ推定扱いにする（推測で補完しない）。
export function fromAntigravity(u:Record<string,unknown>){
 const inp=int(u.input_tokens),out=int(u.output_tokens),think=int(u.thinking_tokens)??0,cr=int(u.cache_read_tokens)??0,tot=int(u.total_tokens);
 if(inp===null||out===null)return {...build({total:tot},{}),note:'input/output未報告'};
 if(tot===inp+out+think)return {...build({input_total:inp,input_uncached:cr>inp?null:inp-cr,cache_read:cr,cache_write:null,output_total:out+think,reasoning:think,total:tot},{input_uncached:'estimated'}),note:'total=input+output+thinking（思考は出力と別計上、キャッシュは入力の内数と仮定）'};
 if(tot===inp+cr+out+think)return {...build({input_total:inp+cr,input_uncached:inp,cache_read:cr,cache_write:null,output_total:out+think,reasoning:think,total:tot},{}),note:'total=input+cache_read+output+thinking'};
 if(tot===inp+out)return {...build({input_total:inp,input_uncached:cr>inp?null:inp-cr,cache_read:cr,cache_write:null,output_total:out,reasoning:think,total:tot},{input_uncached:'estimated'}),note:'total=input+output（思考は出力の内数）'};
 return {...build({input_total:inp+cr,input_uncached:inp,cache_read:cr,cache_write:null,output_total:out+think,reasoning:think,total:tot},{input_total:'estimated',output_total:'estimated'}),note:'内訳とtotal_tokensが一致しないため推定'};
}
// Gemini API usageMetadata: promptTokenCountはキャッシュを含む。thoughtsTokenCountはcandidatesと別。
// 値が0のフィールドは省略されるため、promptTokenCountがある応答では省略を0として扱う。
export function fromGemini(u:Record<string,unknown>){
 const prompt=int(u.promptTokenCount);if(prompt===null)return {...build({total:int(u.totalTokenCount)},{}),note:'promptTokenCountなし'};
 const cached=int(u.cachedContentTokenCount)??0,cand=int(u.candidatesTokenCount)??0,thoughts=int(u.thoughtsTokenCount)??0,tool=int(u.toolUsePromptTokenCount)??0,reported=int(u.totalTokenCount);
 const inputTotal=prompt+tool,output=cand+thoughts,sum=inputTotal+output;
 return {...build({input_total:inputTotal,input_uncached:inputTotal-cached,cache_read:cached,cache_write:null,output_total:output,reasoning:thoughts,total:reported??sum},{}),note:reported!==null&&reported!==sum?`totalTokenCount(${reported})と内訳の合計(${sum})が不一致`:undefined};
}
// Gemini CLI（gemini -p --output-format json の stats.models[*].tokens）。
// Antigravity 1.3.3 の会話記録（brain/<会話>/.system_generated/logs/transcript.jsonl）のステップごとの使用量。
// 合計が `agy -p` の結果の usage と一致し（total=input+output）、cache_read は入力の内数、思考は出力の内数（2026-10-12に実データで確認）。
// 思考の内数は記録にないため unavailable。
export function fromAgyStep(r:Record<string,unknown>){
 const inp=int(r.input_tokens),out=int(r.output_tokens),cr=int(r.cache_read_tokens)??0;
 return build({input_total:inp,input_uncached:inp===null?null:Math.max(0,inp-cr),cache_read:inp===null?null:cr,cache_write:null,output_total:out,reasoning:null,total:inp===null||out===null?null:inp+out},{});
}
export function agyTranscriptUsage(records:Record<string,unknown>[],conversationId:string,model:string|null):NormalizedUsage[]{
 return records.filter(r=>typeof r.input_tokens==='number').map(r=>({provider:'antigravity' as const,model_id:model,...fromAgyStep(r),source:{kind:'transcript' as const,dedupe_key:`agy:step:${conversationId}:${String(r.step_index)}`,session_id:conversationId,cumulative:false},provider_reported_usd:null}));
}
// 会話記録の最後の利用者の発言（分類にだけ使い、保存しない）。
export function agyLastUserInput(records:Record<string,unknown>[]):string|null{
 for(let i=records.length-1;i>=0;i--){const r=records[i]!;if(r.type==='USER_INPUT'&&typeof r.content==='string')return r.content}
 return null;
}
export function agyTranscriptPath(conversationId:string,home=process.env.HOME??''):string{return `${home}/.gemini/antigravity-cli/brain/${conversationId}/.system_generated/logs/transcript.jsonl`}
export function fromGeminiCli(t:Record<string,unknown>){
 return fromGemini({promptTokenCount:t.prompt,cachedContentTokenCount:t.cached,candidatesTokenCount:t.candidates,thoughtsTokenCount:t.thoughts,toolUsePromptTokenCount:t.tool,totalTokenCount:t.total});
}

// API相当額の推定。購読枠の実請求額ではない。キャッシュ単価が未確認なら通常入力単価で計算する（上限側）。
export function estimateApiUsd(t:Tokens,model:ModelEntry|undefined):number|null{
 const p=model?.pricing;if(!p||p.input_per_mtok===null||p.output_per_mtok===null)return null;
 if(t.output_total===null||(t.input_uncached===null&&t.input_total===null))return null;
 const uncached=t.input_uncached??Math.max(0,(t.input_total??0)-(t.cache_read??0)-(t.cache_write??0));
 const usd=(uncached*p.input_per_mtok+(t.cache_read??0)*(p.cache_read_per_mtok??p.input_per_mtok)+(t.cache_write??0)*(p.cache_write_per_mtok??p.input_per_mtok)+t.output_total*p.output_per_mtok)/1e6;
 return Math.round(usd*1e6)/1e6;
}
