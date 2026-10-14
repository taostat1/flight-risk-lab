// Run locally after the new service is deployed. Nothing is copied into this repository.
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {Writable} from 'node:stream';
import {createInterface} from 'node:readline';
const [origin,email,labels,features]=process.argv.slice(2);
if(!origin?.startsWith('https://')||!email||!labels)throw new Error('Usage: node scripts/import-data.mjs HTTPS_ORIGIN TEACHER_EMAIL LABEL_BIN_PATH [TEST_FEATURES_PATH]');
if(!process.stdin.isTTY)throw new Error('Interactive terminal required');
process.stdout.write('教师密码（输入隐藏）：');const rl=createInterface({input:process.stdin,output:new Writable({write(c,e,done){done();}}),terminal:true});
const password=await new Promise(r=>rl.question('',r));rl.close();
const login=await fetch(origin+'/api/staff/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
if(!login.ok)throw new Error('Login failed: '+login.status);const {token}=await login.json();
try{
 for(const [kind,file] of [['labels',labels],['test_features',features]]){
  if(!file)continue;const {size}=await stat(file);
  const res=await fetch(origin+'/api/admin/import?kind='+kind+'&version=blind-v1',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Length':String(size),'Content-Type':'application/octet-stream'},body:createReadStream(file),duplex:'half'});
  if(!res.ok)throw new Error('Import failed: '+res.status+' '+await res.text());console.log(kind+': '+await res.text());
 }
}finally{await fetch(origin+'/api/staff/logout',{method:'POST',headers:{Authorization:'Bearer '+token}});}
