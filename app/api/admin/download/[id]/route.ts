import {withCors,options} from '@/lib/cors';
import {bindings,json,isAdmin} from '@/lib/server';
export const dynamic='force-dynamic';
async function handler(req:Request){if(!await isAdmin(req))return json({error:'仅教师可访问。'},403);const id=new URL(req.url).pathname.split('/').pop()??'';if(!/^[A-Za-z0-9-]{1,64}$/.test(id))return json({error:'提交编号无效。'},400);const {db,bucket}=bindings();const row=await db.prepare('SELECT object_key FROM submissions WHERE id=?').bind(id).first<{object_key:string}>();if(!row)return json({error:'未找到提交。'},404);const file=await bucket.get(row.object_key);if(!file)return json({error:'未找到文件。'},404);return new Response(file.body,{headers:{'Content-Type':'text/csv','Content-Disposition':`attachment; filename="submission-${id}.csv"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}

export const GET=withCors(handler);
export const OPTIONS=options;
