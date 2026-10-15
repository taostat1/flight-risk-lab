import {pruneSubmissionFiles} from '@/lib/retention';
import {withCors,options} from '@/lib/cors';
import {bindings,json,sameOrigin,shanghaiDay} from '@/lib/server';
import {scoreCSV,SubmissionError} from '@/lib/scoring';
import {createHash} from 'node:crypto';
import {personalRank} from '@/lib/leaderboard';
export const dynamic='force-dynamic';
async function handler(req:Request){
 if(!sameOrigin(req))return json({error:'请求来源无效。'},403);
 let name='',student='',alias='';try{name=decodeURIComponent(req.headers.get('x-student-name')??'').trim();student=decodeURIComponent(req.headers.get('x-student-id')??'').trim().toUpperCase();alias=decodeURIComponent(req.headers.get('x-student-alias')??'').normalize('NFKC').trim().replace(/ +/g,' ');}catch{return json({error:'姓名、学号或别名格式无效。'},400);}
 if(!/^[\p{L}\p{N}_ ·-]{2,20}$/u.test(alias))return json({error:'别名须为2—20个中文、字母、数字、空格或 _ · -，请勿使用真实姓名或学号。'},400);
 const task=req.headers.get('x-task');
 if(!name||name.length>60||/[\x00-\x1f]/.test(name)||!/^26210690[0-9]{3}$/.test(student)||!['binary','multiclass'].includes(task??''))return json({error:'请填写姓名、以26210690开头的11位数字学号，并选择任务类型。'},400);
 const size=Number(req.headers.get('content-length')??'0');
 if(!req.body||!Number.isSafeInteger(size)||size<=0||size>12*1024*1024)return json({error:'请上传有明确长度且不超过12MB的CSV文件。'},413);
 const {db,bucket}=bindings();
 const dataset=await db.prepare('SELECT * FROM dataset_versions WHERE active=1').first<{id:string,row_count:number,label_key:string}>();
 if(!dataset)return json({error:'教师尚未开放评测，请稍后再试。'},503);
 const id=crypto.randomUUID(),now=Date.now(),day=shanghaiDay(),key='submissions/'+id+'.csv';
 const lease=req.headers.get('x-submission-lease');
 const locked=lease?await db.prepare('UPDATE scoring_lock SET owner=?,expires=? WHERE id=1 AND owner=? AND expires>? RETURNING owner').bind(id,now+600000,student+':'+lease,now).first():await db.prepare('INSERT INTO scoring_lock(id,owner,expires) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires=excluded.expires WHERE scoring_lock.expires<? RETURNING owner').bind(id,now+600000,now).first();
 if(!locked)return json({error:'评分繁忙或上传时段已过期，请重新提交；本次未扣次数。',code:'scoring_busy'},429);
 let charged=false,recorded=false,scored=false;
 try{
  const quota=await db.prepare(`WITH charged AS (
   INSERT INTO daily_quotas(student_id,day,used) VALUES(?,?,1)
   ON CONFLICT(student_id,day) DO UPDATE SET used=daily_quotas.used+1 WHERE daily_quotas.used<10 RETURNING used
  ), created AS (
   INSERT INTO submissions(id,student_id,student_name,task,created_at,day,status,object_key,dataset_version,public_alias)
   SELECT ?,?,?,?,?,?,?,?,?,? FROM charged RETURNING id
  ) SELECT charged.used FROM charged CROSS JOIN created`).bind(student,day,id,student,name,task,new Date().toISOString(),day,'processing','',dataset.id,alias).first<{used:number}>();
  if(!quota)return json({error:'该学号今天的10次提交额度已用完。'},429);charged=true;
  recorded=true;
  const bytes=new Uint8Array(await req.arrayBuffer());
  const truth=await bucket.get(dataset.label_key);
  if(!truth)throw new Error('Evaluation storage unavailable');
  const labels=new Uint8Array(await truth.arrayBuffer());if(labels.length!==dataset.row_count)throw new Error('Label count mismatch');
  const digest=createHash('sha256');
  const result=await scoreCSV(new Blob([bytes]).stream(),labels,task!,b=>digest.update(b));
  const best=await db.prepare("SELECT auc FROM submissions WHERE status='scored' AND dataset_version=? AND student_id=? AND task=? ORDER BY auc DESC,created_at,id LIMIT 1").bind(dataset.id,student,task).first<{auc:number}>();
  const keep=!best||result.auc>best.auc;
  if(keep){
   // Record a recoverable key before upload; cleanup may remove failed attempts.
   await db.prepare('UPDATE submissions SET object_key=? WHERE id=?').bind(key,id).run();
   await bucket.put(key,bytes,{httpMetadata:{contentType:'text/csv'}});
  }
  await db.prepare('UPDATE submissions SET status=?,auc=?,binary_auc=?,details=?,row_count=?,file_hash=? WHERE id=?').bind('scored',result.auc,result.binary_auc,JSON.stringify(result),result.rows,digest.digest('hex'),id).run();
  scored=true;
  try{await pruneSubmissionFiles();}catch{console.error('Best-file cleanup pending: check COS DeleteObject permission; scores preserved.');}
  const standing=await personalRank(db,dataset.id,task!,student);
  return json({submission_id:id,task,auc:result.auc,binary_auc:result.binary_auc,accuracy:result.accuracy,macro_f1:result.macro_f1,confusion_matrix:result.confusion_matrix,scoring_version:result.scoring_version,rows:result.rows,remaining:10-quota.used,standing});
 }catch(e){if(scored||(e as any)?.uncertain)return json({error:scored?'成绩已保存，但排名暂时未取到，请查看排行榜，勿重复提交。':'数据库响应尚未确认，请联系教师凭提交编号核对本次记录，勿立即重复提交。',submission_id:id},503);
 const expected=e instanceof SubmissionError;const message=expected?e.message:'评分服务暂时失败，请稍后重试；本次已退还额度。';
  const changes=[];
  if(recorded)changes.push(db.prepare('UPDATE submissions SET status=?,error=? WHERE id=?').bind(expected?'invalid':'service_error',message,id));
  if(charged&&!expected)changes.push(db.prepare('UPDATE daily_quotas SET used=max(0,used-1) WHERE student_id=? AND day=?').bind(student,day));
  if(changes.length)await db.batch(changes);
  try{await pruneSubmissionFiles();}catch{console.error('Failed-file cleanup pending.');}
  return json({error:message,submission_id:recorded?id:null},expected?400:503);
 }finally{try{await db.prepare('DELETE FROM scoring_lock WHERE id=1 AND owner=?').bind(id).run();}catch{console.error('Scoring lease release unconfirmed; lease will expire.');}}
}

export const POST=withCors(handler);
export const OPTIONS=options;
