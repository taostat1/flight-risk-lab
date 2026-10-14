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
 if(!name||name.length>60||/[\x00-\x1f]/.test(name)||!/^[-A-Z0-9]{4,24}$/.test(student)||!['binary','multiclass'].includes(task??''))return json({error:'请填写姓名、4—24位字母或数字学号，并选择任务类型。'},400);
 const size=Number(req.headers.get('content-length')??'0');
 if(!req.body||!Number.isSafeInteger(size)||size<=0||size>12*1024*1024)return json({error:'请上传有明确长度且不超过12MB的CSV文件。'},413);
 const {db,bucket}=bindings();
 const dataset=await db.prepare('SELECT * FROM dataset_versions WHERE active=1').first<{id:string,row_count:number,label_key:string}>();
 if(!dataset)return json({error:'教师尚未开放评测，请稍后再试。'},503);
 const id=crypto.randomUUID(),now=Date.now(),day=shanghaiDay(),key='submissions/'+id+'.csv';
 const lease=req.headers.get('x-submission-lease');
 const locked=lease?await db.prepare('UPDATE scoring_lock SET owner=?,expires=? WHERE id=1 AND owner=? AND expires>? RETURNING owner').bind(id,now+600000,student+':'+lease,now).first():await db.prepare('INSERT INTO scoring_lock(id,owner,expires) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires=excluded.expires WHERE scoring_lock.expires<? RETURNING owner').bind(id,now+600000,now).first();
 if(!locked)return json({error:'评分繁忙或上传时段已过期，请重新提交；本次未扣次数。',code:'scoring_busy'},429);
 let charged=false,recorded=false;
 try{
  const quota=await db.prepare('INSERT INTO daily_quotas(student_id,day,used) VALUES(?,?,1) ON CONFLICT(student_id,day) DO UPDATE SET used=used+1 WHERE used<10 RETURNING used').bind(student,day).first<{used:number}>();
  if(!quota)return json({error:'该学号今天的10次提交额度已用完。'},429);charged=true;
  await db.prepare('INSERT INTO submissions(id,student_id,student_name,task,created_at,day,status,object_key,dataset_version,public_alias) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,student,name,task,new Date().toISOString(),day,'processing',key,dataset.id,alias).run();recorded=true;
  // The incoming request body retains its known Content-Length for R2 streaming.
  await bucket.put(key,req.body,{httpMetadata:{contentType:'text/csv'}});
  const truth=await bucket.get(dataset.label_key),prediction=await bucket.get(key);
  if(!truth||!prediction)throw new Error('Evaluation storage unavailable');
  const labels=new Uint8Array(await truth.arrayBuffer());if(labels.length!==dataset.row_count)throw new Error('Label count mismatch');
  const digest=createHash('sha256');
  const result=await scoreCSV(prediction.body,labels,task!,b=>digest.update(b));
  await db.prepare('UPDATE submissions SET status=?,auc=?,binary_auc=?,details=?,row_count=?,file_hash=? WHERE id=?').bind('scored',result.auc,result.binary_auc,JSON.stringify(result),result.rows,digest.digest('hex'),id).run();
  const standing=await personalRank(db,dataset.id,task!,student);
  return json({submission_id:id,task,auc:result.auc,binary_auc:result.binary_auc,accuracy:result.accuracy,macro_f1:result.macro_f1,confusion_matrix:result.confusion_matrix,scoring_version:result.scoring_version,rows:result.rows,remaining:10-quota.used,standing});
 }catch(e){const expected=e instanceof SubmissionError;const message=expected?e.message:'评分服务暂时失败，请稍后重试；本次已退还额度。';
  if(recorded)await db.prepare('UPDATE submissions SET status=?,error=? WHERE id=?').bind(expected?'invalid':'service_error',message,id).run();
  if(charged&&!expected)await db.prepare('UPDATE daily_quotas SET used=max(0,used-1) WHERE student_id=? AND day=?').bind(student,day).run();
  return json({error:message,submission_id:recorded?id:null},expected?400:503);
 }finally{await db.prepare('DELETE FROM scoring_lock WHERE id=1 AND owner=?').bind(id).run();}
}

export const POST=withCors(handler);
export const OPTIONS=options;
