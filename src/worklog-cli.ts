import {resolve} from 'node:path';
import {checkLogs,start,finish} from './worklog.ts';
const [command,...args]=process.argv.slice(2);
function option(name:string){const i=args.indexOf('--'+name);if(i<0||!args[i+1]||args[i+1].startsWith('--'))throw Error(`--${name} が必要`);return args[i+1]}
try{
 const root=resolve('.');
 if(command==='start')console.log(start(root,args[0],{agent:option('agent'),model:option('model'),modelSource:option('model-source')},option('request')));
 else if(command==='finish')console.log(JSON.stringify(finish(root,args[0],option('status') as 'completed'|'paused'),null,2));
 else if(command==='check')console.log(JSON.stringify(checkLogs(root,args.includes('--staged')),null,2));
 else throw Error('使い方: start Txxx --agent NAME --model NAME --model-source runtime|user-specified|unknown --request TEXT | finish DIR --status completed|paused | check [--staged]');
}catch(e){console.error(String(e));process.exitCode=1}
