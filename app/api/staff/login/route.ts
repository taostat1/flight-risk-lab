import {bindings,json} from '@/lib/server';
import {withCors,options} from '@/lib/cors';
import {ensureStaff,limited,readBody,passwordHash,equal,hex,digest,sessionCookie,SESSION_SECONDS} from '@/lib/staff-auth';
export const dynamic='force-dynamic';
export const OPTIONS=options;
export const POST=withCors(async(req:Request)=>{
 let body;try{body=await readBody(req);}catch{return json({error:'请输入有效的邮箱和密码。'},400);}
 const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
 if(!/^[^\s@]{1,100}@[^\s@]{1,100}$/.test(email)||typeof body.password!=='string'||body.password.length>256)return json({error:'邮箱或密码不正确。'},401);
 if(await limited(req,email))return json({error:'尝试次数过多，请15分钟后再试。'},429);
 await ensureStaff();const {db}=bindings();
 const account=await db.prepare('SELECT * FROM staff_accounts WHERE email=?').bind(email).first<{email:string,role:string,salt:string,password_hash:string}>();
 const hash=await passwordHash(body.password,account?.salt??'invalid-account-placeholder');
 if(!account||!equal(hash,account.password_hash))return json({error:'邮箱或密码不正确。'},401);
 const token=hex(crypto.getRandomValues(new Uint8Array(32)));
 await db.batch([db.prepare('DELETE FROM staff_sessions WHERE expires_at<?').bind(Date.now()),db.prepare('INSERT INTO staff_sessions(token_hash,email,expires_at) VALUES(?,?,?)').bind(await digest(token),email,Date.now()+SESSION_SECONDS*1000)]);
 const res=json({staff:{email,role:account.role},token});res.headers.set('Set-Cookie',sessionCookie(token));return res;
});
