// 計測DBの同時アクセスの回帰確認: 別の製品のHookが書込み中でも、開く・書くは待ってから成功する。
// 2026-10-11にCodexのHookで出た database is locked の原因は再現できていない（このテストは待機時間の順序を直す前でも合格する）。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {sandbox} from './helpers.ts';
import {logEvent,openDb} from '../telemetry/db.ts';
import {paths} from '../gateway/config.ts';

test('別プロセスが書込みロックを持っていても、openDbと書込みは待ってから成功する', async()=>{
 const {db}=sandbox();db.close();
 const holder=spawn(process.execPath,['-e',`const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.argv[1]);db.exec('BEGIN EXCLUSIVE');db.exec("INSERT INTO meta(key,value) VALUES('lock-test','1') ON CONFLICT(key) DO UPDATE SET value='2'");process.stdout.write('locked\\n');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1200);db.exec('COMMIT');`,paths().db]);
 await new Promise<void>(r=>holder.stdout.once('data',()=>r()));
 const started=Date.now();
 const db2=openDb();
 logEvent(db2,'lock_test',{});
 assert.ok(Date.now()-started>=300,'ロックの解放を待った');
 assert.equal((db2.prepare("SELECT COUNT(*) AS n FROM events WHERE kind='lock_test'").get() as {n:number}).n,1);
 db2.close();
 await new Promise(r=>holder.on('close',r));
});
