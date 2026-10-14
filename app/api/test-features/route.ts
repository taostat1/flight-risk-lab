import {withCors,options} from '@/lib/cors';
import {bindings,json} from '@/lib/server';
export const dynamic='force-dynamic';
async function handler(req:Request){const {bucket}=bindings();const f=await bucket.get('student/test_features.parquet');if(!f)return json({error:'测试数据尚未开放。'},404);return new Response(f.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="test_features.parquet"','X-Content-Type-Options':'nosniff','Cache-Control':'public,max-age=3600'}});}

export const GET=withCors(handler);
export const OPTIONS=options;
