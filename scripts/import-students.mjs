// The roster hash file must stay outside the public repository and deployment archive.
import {readFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {Writable} from 'node:stream';
const [base,email,file]=process.argv.slice(2);
if(!base?.startsWith('https://')||!email||!file||!process.stdin.isTTY)throw Error('Usage: node scripts/import-students.mjs HTTPS_ORIGIN TEACHER_EMAIL PRIVATE_HASH_JSON (interactive)');
process.stdout.write('Teacher password (hidden): ');
const rl=createInterface({input:process.stdin,output:new Writable({write(c,e,done){done();}}),terminal:true});
const password=await new Promise(r=>rl.question('',r));rl.close();
const login=await fetch(base+'/api/staff/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
if(!login.ok)throw Error('Login failed: '+login.status);
const {token}=await login.json();
try{
 const r=await fetch(base+'/api/student/import',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:await readFile(file)});
 console.log(r.status,await r.text());if(!r.ok)process.exitCode=1;
}finally{await fetch(base+'/api/staff/logout',{method:'POST',headers:{Authorization:'Bearer '+token}});}
