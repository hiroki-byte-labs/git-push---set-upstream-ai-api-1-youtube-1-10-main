import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {parse} from './contracts.ts';
import {getRun,initializeRun,submitArtifact,type Kind} from './workflow.ts';

const usage='Usage: node orchestration/cli.ts init RUN --reference FILE --rights NOTE [--synthetic]\n       init RUN --url YOUTUBE_URL --rights NOTE\n       status RUN\n       submit RUN --role ROLE --kind analysis|implementation|render|evaluation|tasks --file FILE\n       validate analysis|evaluation|tasks FILE';
try {
 const [command,target,...args]=process.argv.slice(2);
 if(!target) throw new Error(usage);
 const flags=new Map<string,string>();
 const allowed:Record<string,string[]>={init:['--reference','--url','--rights','--synthetic'],submit:['--role','--kind','--file'],status:[]};
 for(let i=0;command!=='validate'&&i<args.length;i++){
  const name=args[i]!;if(!name.startsWith('--')||flags.has(name)) throw new Error(`Invalid argument: ${name}`);
  if(!allowed[command??'']?.includes(name)) throw new Error(`Unknown option: ${name}`);
  if(name==='--synthetic') flags.set(name,'true');
  else {const value=args[++i];if(!value||value.startsWith('--')) throw new Error(`Missing value: ${name}`);flags.set(name,value);}
 }
 const required=(name:string)=>{const v=flags.get(name);if(!v) throw new Error(`Required: ${name}`);return v;};
 let result:unknown;
 if(command==='init') result=initializeRun(resolve(target),{reference:flags.get('--reference'),url:flags.get('--url'),rights:required('--rights'),sourceType:flags.has('--synthetic')?'synthetic':undefined});
 else if(command==='status') result=getRun(resolve(target));
 else if(command==='submit') result=submitArtifact(resolve(target),required('--role'),required('--kind') as Kind,resolve(required('--file')));
 else if(command==='validate') {if(!['analysis','evaluation','tasks'].includes(target)) throw new Error('Unknown contract'); const file=process.argv[4];if(!file||process.argv.length!==5)throw new Error(usage);parse(target as 'analysis',JSON.parse(readFileSync(file,'utf8')));result={valid:true,kind:target,file};}
 else throw new Error(usage);
 console.log(JSON.stringify(result,null,2));
}catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
