import {bindings} from './server';
// Delete only confirmed non-best files. Keep records, and retry failed cleanup later.
export async function pruneSubmissionFiles(){
 const {db,bucket}=bindings();
 const rows=await db.prepare(`SELECT id,object_key FROM submissions s
 WHERE object_key<>'' AND (status IN ('invalid','service_error') OR
 (status='scored' AND EXISTS (SELECT 1 FROM submissions b
 WHERE b.status='scored' AND b.dataset_version=s.dataset_version
 AND b.student_id=s.student_id AND b.task=s.task
 AND (b.auc>s.auc OR (b.auc=s.auc AND (b.created_at<s.created_at OR
 (b.created_at=s.created_at AND b.id<s.id))))))) LIMIT 100`).all();
 for(const row of rows.results){
  if(!/^submissions\/[a-f0-9-]+\.csv$/.test(row.object_key))continue;
  await bucket.delete(row.object_key);
  await db.prepare("UPDATE submissions SET object_key='' WHERE id=? AND object_key=?").bind(row.id,row.object_key).run();
 }
 return rows.results.length;
}
