import {readdirSync, readFileSync} from 'node:fs';
export type Ticket = {id:string; title:string; owner:'human'|'agent'; status:string; priority:string; milestone:string; depends:string[]; body:string};
export const sections = ['目的','実施範囲','対象外','受け入れ条件','検証方法','結果と検証証跡','ブロック理由と再開'];
export function sectionBody(body:string,name:string){const label=`## ${name}\n`,i=body.indexOf(label);return i<0?'':body.slice(i+label.length).split(/\n## /)[0].trim()}
export function parseTicket(raw:string):Ticket {
 const match=raw.replaceAll('\r\n','\n').match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/); if(!match) throw Error('front matterが必要');
 const m=Object.fromEntries(match[1].split('\n').map(l=>{const i=l.indexOf(':');if(i<1)throw Error('不正なメタデータ');return [l.slice(0,i),l.slice(i+1).trim()]}));
 for(const k of ['id','title','owner','status','priority','milestone','depends']) if(!(k in m))throw Error(`必須項目: ${k}`);
 if(!/^T\d{3}$/.test(m.id)||!['human','agent'].includes(m.owner)||!['backlog','ready','in_progress','review','blocked','done'].includes(m.status)||!/^P[0-3]$/.test(m.priority)||!/^M[0-5]$/.test(m.milestone))throw Error(`不正な値: ${m.id}`);
 const body=match[2];
 for(const s of [...sections,...(m.owner==='human'?['所要時間','操作手順','成功時の状態','困った場合の対処']:[])]){if(!body.includes(`## ${s}\n`))throw Error(`${m.id}: ${s}不足`);if(!sectionBody(body,s))throw Error(`${m.id}: ${s}が空`)}
 // doneは結果の記録が必須（T014）。
 if(m.status==='done'&&/^(未実施|記入)?$/.test(sectionBody(body,'結果と検証証跡')))throw Error(`${m.id}: doneなのに結果と検証証跡が未記入`);
 return {...m,depends:m.depends==='-'?[]:m.depends.split(',').map(s=>s.trim()),body:match[2]} as Ticket;
}
export function validate(ts:Ticket[]) {
 const map=new Map<string,Ticket>();for(const t of ts){if(map.has(t.id))throw Error(`ID重複: ${t.id}`);map.set(t.id,t)}
 const visiting=new Set<string>(),seen=new Set<string>();
 function walk(id:string){if(visiting.has(id))throw Error(`依存循環: ${id}`);if(seen.has(id))return;const t=map.get(id);if(!t)throw Error(`存在しない依存先: ${id}`);visiting.add(id);t.depends.forEach(walk);visiting.delete(id);seen.add(id)}
 ts.forEach(t=>walk(t.id));
 for(const t of ts)if(t.status==='done'&&t.depends.some(d=>map.get(d)!.status!=='done'))throw Error(`${t.id}: 未完了の依存先`);
 return ts;
}
// ファイル名とidの取り違えを拒否（T013）。
export function parseTicketFile(name:string,raw:string){const t=parseTicket(raw);if(name!==`${t.id}.md`)throw Error(`ファイル名とidが不一致: ${name} / ${t.id}`);return t}
export function loadTickets(dir='tickets'){return validate(readdirSync(dir).filter(f=>/^T\d+.*\.md$/.test(f)).sort().map(f=>parseTicketFile(f,readFileSync(`${dir}/${f}`,'utf8'))))}
export function available(ts:Ticket[],owner:string){return ts.filter(t=>t.owner===owner&&t.status==='ready'&&t.depends.every(d=>ts.find(x=>x.id===d)?.status==='done'))}
