import {withCors,options} from '@/lib/cors';
import {getStaff} from '@/lib/staff-auth';
import {env} from '@/runtime/env';
import {bindings,json,isAdmin,sameOrigin} from '@/lib/server';
export const dynamic='force-dynamic';
async function handler(req:Request){
 const secret=(env as unknown as {IMPORT_TOKEN?:string}).IMPORT_TOKEN;
 const supplied=req.headers.get('x-import-token');
 const allowed=!!secret&&supplied===secret||(await getStaff(req))?.role==='teacher';
 if(!allowed||!sameOrigin(req))return json({error:'仅教师可导入。'},403);
 const {db,bucket}=bindings();const u=new URL(req.url),kind=u.searchParams.get('kind');
 if(kind==='labels'){
  const bytes=new Uint8Array(await req.arrayBuffer());
  if(bytes.length<100||bytes.length>2000000||bytes.some(x=>x>3))return json({error:'标签文件无效。'},400);
  const counts=[0,0,0,0];for(const y of bytes)counts[y]++;if(counts.some(x=>!x))return json({error:'缺少类别。'},400);
  const version=u.searchParams.get('version')??'blind-v1';if(!/^[a-z0-9-]{1,40}$/.test(version))return json({error:'版本无效。'},400);
  const key='private/groundtruth/'+version+'.bin';
  const existing=await db.prepare('SELECT id FROM dataset_versions WHERE id=?').bind(version).first();
  if(existing)return json({error:'该版本已存在，不能覆盖标签。'},409);
  await bucket.put(key,bytes);
  await db.batch([db.prepare('UPDATE dataset_versions SET active=0'),db.prepare('INSERT INTO dataset_versions(id,row_count,label_key,class_counts,created_at,active) VALUES(?,?,?,?,?,1)').bind(version,bytes.length,key,JSON.stringify(counts),new Date().toISOString())]);
  return json({ok:true,rows:bytes.length,version});
 }
 if(kind==='test_features'){
  if(!req.body)return json({error:'文件为空。'},400);
  await bucket.put('student/test_features.parquet',req.body,{httpMetadata:{contentType:'application/octet-stream'}});return json({ok:true});
 }
 return json({error:'不支持的导入类型。'},400);
}

export const POST=withCors(handler);
export const OPTIONS=options;
