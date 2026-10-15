import {getStudent} from '@/lib/student-auth';
import {bindings,json,shanghaiDay} from '@/lib/server';
import {withCors,options} from '@/lib/cors';
export const dynamic='force-dynamic';
export const OPTIONS=options;
export const POST=withCors(async(req:Request)=>{
 const account=await getStudent(req);if(!account)return json({error:'请先登录学生账号。'},401);if(account.must_change)return json({error:'首次登录须先修改密码。'},403);
 const student=account.student_id;if(!/^26210690[0-9]{3}$/.test(student))return json({error:'学号须为以26210690开头的11位数字。'},400);
 const {db}=bindings();const quota=await db.prepare('SELECT used FROM daily_quotas WHERE student_id=? AND day=?').bind(student,shanghaiDay()).first<{used:number}>();if((quota?.used??0)>=10)return json({error:'今日10次额度已用完。',code:'quota_exhausted'},429);
 const token=crypto.randomUUID(),owner=student+':'+token,now=Date.now();
 const lock=await db.prepare('INSERT INTO scoring_lock(id,owner,expires) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires=excluded.expires WHERE scoring_lock.expires<? RETURNING owner').bind(owner,now+90000,now).first();
 if(!lock)return json({error:'评分繁忙，正在等待可用时段；不扣提交次数。',code:'scoring_busy',retry_after:3},429);
 return json({token,expires_in:90});
});
