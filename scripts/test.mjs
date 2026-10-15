import {build} from 'esbuild';
import {mkdir,readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import {database} from '../runtime/database.mjs';
import {httpDatabase} from '../runtime/http-database.mjs';
import {bootstrapSQL} from '../runtime/bootstrap.mjs';
process.env.NODE_ENV='test';
await mkdir('outputs',{recursive:true});
await build({stdin:{contents:"export {dispatch,createServer} from './runtime/http'; export {env,configureTest} from './runtime/env'; export {passwordHash} from './lib/staff-auth';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',packages:'external',outfile:'outputs/test-app.mjs',tsconfig:'tsconfig.json'});
const {dispatch,createServer,env,configureTest,passwordHash}=await import('../outputs/test-app.mjs');
const pg=new PGlite();await pg.exec(await bootstrapSQL(new URL('../runtime/bootstrap.mjs',import.meta.url)));
await pg.exec('SET search_path=flight_portal,pg_catalog');
let loseResponse=false,httpCalls=0;
const fetchImpl=async(url,options)=>{
 assert.equal(url,'https://test-env.api.tcloudbasegateway.com/v1/rdb/exec-pgsql');
 assert.equal(options.headers.Authorization,'Bearer fake-server-key');
 const {sql,parameters,role}=JSON.parse(options.body);assert.equal(role,'cloudbase_postgres');httpCalls++;
 try{const result=await pg.query(sql,parameters);if(loseResponse){loseResponse=false;throw new TypeError('Simulated lost response after commit');}return Response.json(result.rows);}
 catch(e){if(e instanceof TypeError)throw e;return Response.json({code:'DATABASE_'+e.code},{status:400});}
};
const objects=new Map();const storage={async delete(key){objects.delete(key);},async put(key,body){objects.set(key,new Uint8Array(await new Response(body).arrayBuffer()));},async get(key){const bytes=objects.get(key);return bytes?{body:new Blob([bytes]).stream(),arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}:null;}};
const db=httpDatabase({CLOUDBASE_ENV_ID:'test-env',CLOUDBASE_API_KEY:'fake-server-key'},{fetchImpl,sleep:async()=>{}});configureTest(db,storage);
// Retry the same request id after a committed response is lost: no duplicate charge.
loseResponse=true;await db.prepare("INSERT INTO daily_quotas(student_id,day,used) VALUES(?,?,1) ON CONFLICT(student_id,day) DO UPDATE SET used=used+1 WHERE used<10 RETURNING used").bind('RETRY001','test').first();
assert.equal((await db.prepare('SELECT used FROM daily_quotas WHERE student_id=?').bind('RETRY001').first()).used,1);
// A failing second statement rolls back the first one in the same HTTP request.
await assert.rejects(()=>db.batch([db.prepare("INSERT INTO daily_quotas VALUES(?,?,1)").bind('ROLLBACK','test'),db.prepare('INSERT INTO daily_quotas VALUES(?,?,99)').bind('INVALID','test')]));
assert.equal(await db.prepare('SELECT used FROM daily_quotas WHERE student_id=?').bind('ROLLBACK').first(),null);
// Parameter text cannot become executable SQL or be rescanned as a placeholder.
const attack="x'\\; DROP TABLE submissions; -- $1 $2";
assert.equal((await db.prepare('SELECT ?::text AS value').bind(attack).first()).value,attack);
await db.prepare('INSERT INTO daily_quotas VALUES(?,?,1)').bind('RETURNING','quoted').run();
assert.equal((await db.prepare('SELECT used FROM daily_quotas WHERE student_id=?').bind('RETURNING').first()).used,1);
let deniedCalls=0;const denied=httpDatabase({CLOUDBASE_ENV_ID:'test-env',CLOUDBASE_API_KEY:'invalid'},{fetchImpl:async()=>{deniedCalls++;return Response.json({code:'UNAUTHORIZED'},{status:401});},sleep:async()=>{}});
await assert.rejects(()=>denied.prepare('SELECT 1').all());assert.equal(deniedCalls,1);
await pg.exec('CREATE ROLE anon; GRANT USAGE ON SCHEMA flight_portal TO anon; SET ROLE anon');
await assert.rejects(()=>pg.query("SELECT flight_portal.http_run_v1('denied','[]',false)"));
await pg.exec('RESET ROLE; REVOKE USAGE ON SCHEMA flight_portal FROM anon');
const origin='https://course.test';
async function call(url,method='GET',body,headers={}){const r=await dispatch(new Request(origin+url,{method,headers:{Origin:origin,...headers},body}));const text=await r.text();return {status:r.status,headers:r.headers,data:JSON.parse(text)};}
assert.equal((await call('/api/admin/submissions')).status,403);
env.STAFF_ACCOUNTS_JSON=JSON.stringify([{email:'teacher@example.test',role:'teacher',salt:'test-salt',hash:await passwordHash('test-only-password','test-salt')}]);
const login=await call('/api/staff/login','POST',JSON.stringify({email:'teacher@example.test',password:'test-only-password'}));assert.equal(login.status,200,JSON.stringify(login));
const auth={Authorization:'Bearer '+login.data.token};
assert.equal((await call('/api/staff/me','GET',undefined,auth)).status,200);
const labels=Uint8Array.from({length:100},(_,i)=>i%4);
assert.equal((await call('/api/admin/import?kind=labels&version=test-v1','POST',labels,auth)).status,200);
assert.equal((await call('/api/admin/import?kind=labels&version=test-v1','POST',labels,auth)).status,409);
assert.equal((await call('/api/status')).data.rows,100);
async function submit(student,alias,task='binary',valid=true){
 const slot=await call('/api/submit-slot','POST',undefined,{'x-student-id':student});if(slot.status!==200)return slot;
 const content=valid?'test_id,'+(task==='binary'?'y_disruption':'y_class')+'\n'+Array.from({length:100},(_,i)=>(i+1)+',0').join('\n'):'bad\n';
 return call('/api/submit','POST',content,{'Content-Length':String(Buffer.byteLength(content)),'x-student-name':'Test student','x-student-id':student,'x-student-alias':encodeURIComponent(alias),'x-task':task,'x-submission-lease':slot.data.token});
}
let a=await submit('26210690001','原别名');assert.equal(a.status,200,JSON.stringify(a));assert.equal(a.data.auc,.5);const firstId=a.data.submission_id;
a=await submit('26210690001','新别名','multiclass');assert.equal(a.status,200,JSON.stringify(a));assert.equal(a.data.auc,.5);
assert.equal((await call('/api/leaderboard?task=binary')).data.entries[0].alias,'新别名');
assert.equal((await submit('26210690002','新别名')).status,200);
assert.equal((await call('/api/leaderboard?task=binary')).data.entries.length,2);
assert.equal((await submit('26210690001','错误别名','binary',false)).status,400);
assert.equal((await call('/api/leaderboard?task=binary')).data.entries[0].alias,'新别名');
for(let i=3;i<10;i++)assert.equal((await submit('26210690001','新别名')).status,200);
assert.equal((await submit('26210690001','新别名')).status,429);
assert.equal([...objects.keys()].filter(k=>k.startsWith('submissions/')).length,3);
assert.equal((await call('/api/submit-slot','POST',undefined,{'x-student-id':'26210690001x'})).status,400);
assert.equal((await call('/api/submit-slot','POST',undefined,{'x-student-id':'25210690001'})).status,400);
const board=(await call('/api/leaderboard')).data.entries;assert.ok(board.every(e=>Object.keys(e).sort().join(',')==='alias,auc,rank'));
const records=await call('/api/admin/submissions','GET',undefined,auth);assert.equal(records.status,200,JSON.stringify(records));assert.equal(records.data.total,11);
assert.equal(records.data.records.find(r=>r.id===firstId).alias,'原别名');
assert.equal((await call('/api/admin/download/'+firstId)).status,403);
const file=await dispatch(new Request(origin+'/api/admin/download/'+firstId,{headers:auth}));assert.equal(file.status,200);assert.ok((await file.text()).startsWith('test_id,y_disruption'));
// A better prediction replaces the old CSV; ties and worse scores keep the earlier best.
const oldSecond=(await db.prepare("SELECT id,object_key FROM submissions WHERE student_id='26210690002' AND status='scored'").first());
const perfect='test_id,y_disruption\n'+Array.from(labels,(v,i)=>(i+1)+','+(v>=2?1:0)).join('\n');
const oldDelete=storage.delete;storage.delete=async()=>{throw Error('simulated DeleteObject denied');};
const better=await call('/api/submit','POST',perfect,{'Content-Length':String(Buffer.byteLength(perfect)),'x-student-name':'Test','x-student-id':'26210690002','x-student-alias':encodeURIComponent('最佳成绩'),'x-task':'binary'});
assert.equal(better.status,200);assert.equal(better.data.auc,1);assert.ok(objects.has(oldSecond.object_key));
const bestId=better.data.submission_id;
storage.delete=oldDelete;
assert.equal((await submit('26210690002','较低成绩')).status,200);
assert.ok(!objects.has(oldSecond.object_key));
assert.equal((await call('/api/admin/download/'+oldSecond.id,'GET',undefined,auth)).status,410);
const tied=await call('/api/submit','POST',perfect,{'Content-Length':String(Buffer.byteLength(perfect)),'x-student-name':'Test','x-student-id':'26210690002','x-student-alias':encodeURIComponent('同分提交'),'x-task':'binary'});
assert.equal(tied.status,200);
assert.equal((await db.prepare('SELECT object_key FROM submissions WHERE id=?').bind(tied.data.submission_id).first()).object_key,'');
assert.ok((await db.prepare('SELECT object_key FROM submissions WHERE id=?').bind(bestId).first()).object_key);
assert.equal([...objects.keys()].filter(k=>k.startsWith('submissions/')).length,3);
const lock=await call('/api/submit-slot','POST',undefined,{'x-student-id':'26210690003'});assert.equal(lock.status,200);
assert.equal((await call('/api/submit-slot','POST',undefined,{'x-student-id':'26210690004'})).status,429);
assert.equal(await db.prepare('SELECT used FROM daily_quotas WHERE student_id=?').bind('26210690004').first(),null);
await db.prepare('DELETE FROM scoring_lock').run();
const simultaneous=await Promise.all(Array.from({length:80},(_,i)=>call('/api/submit-slot','POST',undefined,{'x-student-id':'26210690'+String(i+100).padStart(3,'0')})));
assert.equal(simultaneous.filter(r=>r.status===200).length,1);assert.equal(simultaneous.filter(r=>r.status===429).length,79);
await db.prepare('DELETE FROM scoring_lock').run();
const originalPut=storage.put;storage.put=async()=>{throw new Error('Simulated storage failure');};assert.equal((await submit('26210690005','存储错误')).status,503);storage.put=originalPut;
assert.equal((await db.prepare('SELECT used FROM daily_quotas WHERE student_id=?').bind('26210690005').first()).used,0);
assert.equal((await call('/api/staff/password','POST',JSON.stringify({current:'test-only-password',password:'changed-test-password'}),auth)).status,200);
assert.equal((await call('/api/staff/me','GET',undefined,auth)).status,401);
const badOrigin=await dispatch(new Request(origin+'/api/leaderboard',{headers:{Origin:'https://evil.test'}}));assert.equal(badOrigin.status,403);
const corsCheck=await dispatch(new Request(origin+'/api/status',{headers:{Origin:'https://taostat1.github.io'}}));assert.equal(corsCheck.headers.get('Access-Control-Allow-Origin'),'https://taostat1.github.io');
const corsPre=await dispatch(new Request(origin+'/api/submit',{method:'OPTIONS',headers:{Origin:'https://taostat1.github.io'}}));assert.equal(corsPre.status,204);assert.ok(corsPre.headers.get('Access-Control-Allow-Headers').includes('x-submission-lease'));
const server=createServer(origin);await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
assert.equal((await fetch(base+'/healthz')).status,200);
assert.equal((await fetch(base+'/api/leaderboard')).status,200);
assert.equal((await fetch(base+'/runtime/schema.sql')).status,404);
const large=Uint8Array.from({length:697754},(_,i)=>i%4);
assert.equal((await call('/api/admin/import?kind=labels&version=scale-test','POST',large,{Authorization:'Bearer '+(await call('/api/staff/login','POST',JSON.stringify({email:'teacher@example.test',password:'changed-test-password'}))).data.token})).status,200);
for(const task of ['binary','multiclass']){
 const csv='test_id,'+(task==='binary'?'y_disruption':'y_class')+'\n'+Array.from({length:large.length},(_,i)=>(i+1)+',0').join('\n');
 const scored=await call('/api/submit','POST',csv,{'Content-Length':String(Buffer.byteLength(csv)),'x-student-name':'Scale test','x-student-id':'26210690999','x-student-alias':encodeURIComponent('规模测试'),'x-task':task});
 assert.equal(scored.status,200,JSON.stringify(scored));assert.equal(scored.data.rows,697754);assert.equal(scored.data.auc,.5);
}
await new Promise(r=>server.close(r));await pg.close();
console.log('PASS: HTTP contract over PostgreSQL engine; atomic rollback, committed-response retry deduplication, SQL parameter injection resistance, anonymous permission denial; both 697754-row AUC tasks, 80 slot contenders, alias changes/duplicates, quota, refund, teacher auth/password/history/download, HTTP isolation. Requests: '+httpCalls);
