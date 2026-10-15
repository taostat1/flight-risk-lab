import {withCors,options} from '@/lib/cors';
import {bindings,json} from '@/lib/server';
import {getStudent} from '@/lib/student-auth';
import {getStaff,readBody,passwordHash,equal,hex,digest,tokenFrom} from '@/lib/staff-auth';
export const OPTIONS=options;
async function handler(req:Request){
 const action=new URL(req.url).pathname.split('/').pop();const {db}=bindings();
 if(action==='import'){
  if(req.method!=='POST'||(await getStaff(req))?.role!=='teacher')return json({error:'仅教师可导入账号。'},403);
  const text=await req.text();if(text.length>200000)return json({error:'文件过大。'},400);
  let rows:any;try{rows=JSON.parse(text);}catch{return json({error:'格式错误。'},400);}
  if(!Array.isArray(rows)||!rows.length||rows.length>1000||rows.some(a=>!/^26210690[0-9]{3}$/.test(a.student_id)||typeof a.student_name!=='string'||!a.student_name||a.student_name.length>60||!/^[a-f0-9]{48}$/.test(a.salt)||!/^[a-f0-9]{64}$/.test(a.hash))||new Set(rows.map(a=>a.student_id)).size!==rows.length)return json({error:'名单内容无效。'},400);
  await db.batch(rows.map(a=>db.prepare('INSERT INTO student_accounts(student_id,student_name,salt,password_hash,must_change) VALUES(?,?,?,?,1) ON CONFLICT(student_id) DO NOTHING').bind(a.student_id,a.student_name,a.salt,a.hash)));
  return json({ok:true,count:rows.length});
 }
 if(action==='login'&&req.method==='POST'){
  let b:any;try{b=await readBody(req);}catch{return json({error:'输入无效。'},400);}
  if(typeof b.student_id!=='string'||!/^26210690[0-9]{3}$/.test(b.student_id)||typeof b.password!=='string'||b.password.length>128)return json({error:'学号或密码不正确。'},401);
  const window=Math.floor(Date.now()/900000);
  const limit=await db.prepare('INSERT INTO student_login_limits(student_id,window,used) VALUES(?,?,1) ON CONFLICT(student_id) DO UPDATE SET window=excluded.window,used=CASE WHEN student_login_limits.window=excluded.window THEN student_login_limits.used+1 ELSE 1 END RETURNING used').bind(b.student_id,window).first<{used:number}>();
  if(limit!.used>10)return json({error:'尝试次数过多，请15分钟后再试。'},429);
  const a=await db.prepare('SELECT * FROM student_accounts WHERE student_id=?').bind(b.student_id).first<any>();
  const hash=await passwordHash(b.password,a?.salt??'invalid-student');
  if(!a||!equal(hash,a.password_hash))return json({error:'学号或密码不正确。'},401);
  const token=hex(crypto.getRandomValues(new Uint8Array(32)));
  await db.batch([db.prepare('DELETE FROM student_sessions WHERE expires_at<?').bind(Date.now()),db.prepare('INSERT INTO student_sessions(token_hash,student_id,expires_at) VALUES(?,?,?)').bind(await digest(token),a.student_id,Date.now()+8*3600000)]);
  return json({token,student:{student_id:a.student_id,student_name:a.student_name,must_change:a.must_change}});
 }
 const student=await getStudent(req);if(!student)return json({error:'请先登录学生账号。'},401);
 if(action==='me'&&req.method==='GET')return json({student});
 if(action==='logout'&&req.method==='POST'){await db.prepare('DELETE FROM student_sessions WHERE token_hash=?').bind(await digest(tokenFrom(req))).run();return json({ok:true});}
 if(action==='password'&&req.method==='POST'){
  let b:any;try{b=await readBody(req);}catch{return json({error:'输入无效。'},400);}
  if(typeof b.current!=='string'||typeof b.password!=='string'||b.password.length<10||b.password.length>128||b.password===b.current)return json({error:'新密码须为10—128个字符，且与当前密码不同。'},400);
  const a=await db.prepare('SELECT salt,password_hash FROM student_accounts WHERE student_id=?').bind(student.student_id).first<any>();
  if(!a||!equal(await passwordHash(b.current,a.salt),a.password_hash))return json({error:'当前密码不正确。'},401);
  const salt=hex(crypto.getRandomValues(new Uint8Array(24)));
  await db.batch([db.prepare('UPDATE student_accounts SET salt=?,password_hash=?,must_change=0 WHERE student_id=?').bind(salt,await passwordHash(b.password,salt),student.student_id),db.prepare('DELETE FROM student_sessions WHERE student_id=?').bind(student.student_id)]);
  return json({ok:true});
 }
 return json({error:'不支持的操作。'},405);
}
export const POST=withCors(handler);
export const GET=withCors(handler);
