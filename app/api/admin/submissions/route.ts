import {withCors,options} from '@/lib/cors';
import {bindings,json,isAdmin} from '@/lib/server';
export const dynamic='force-dynamic';
async function handler(req:Request){if(!await isAdmin(req))return json({error:'仅教师可访问。'},403);const {db}=bindings();const offset=Math.max(0,Number(new URL(req.url).searchParams.get('offset'))||0);const data=await db.prepare('SELECT s.*,s.public_alias AS alias FROM submissions s ORDER BY s.created_at DESC LIMIT 100 OFFSET ?').bind(offset).all();const total=await db.prepare('SELECT count(*) n FROM submissions').first();return json({records:data.results,total:total?.n??0});}

export const GET=withCors(handler);
export const OPTIONS=options;
