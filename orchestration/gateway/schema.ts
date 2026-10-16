// schemas/ の共通JSON Schemaで構造を検査する（固定版Ajv 8.20.0、T112と同じ依存）。
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {Ajv,type ValidateFunction} from 'ajv';
import {paths} from './config.ts';

export type SchemaName='task'|'routing-decision'|'execution'|'usage'|'evaluation'|'approval';
let cache:Map<SchemaName,ValidateFunction>|undefined;
function validators(){
 if(cache)return cache;
 const ajv=new Ajv({allErrors:true,strict:true});
 ajv.addFormat('date-time',{type:'string',validate:(s:string)=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(s)&&Number.isFinite(Date.parse(s))});
 const load=(n:string)=>JSON.parse(readFileSync(join(paths().schemas,`${n}.schema.json`),'utf8'));
 ajv.addSchema(load('common'));
 cache=new Map();
 for(const n of ['task','routing-decision','execution','usage','evaluation','approval'] as SchemaName[])cache.set(n,ajv.compile(load(n)));
 return cache;
}
export class SchemaError extends Error{}
export function validate<T>(name:SchemaName,value:unknown):T{
 const v=validators().get(name)!;
 if(!v(value))throw new SchemaError(`${name}.schema.json違反: ${(v.errors??[]).slice(0,5).map(e=>`${e.instancePath||'/'} ${e.message}`).join('; ')}`);
 return value as T;
}
