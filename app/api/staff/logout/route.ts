import {json,bindings} from '@/lib/server';
import {tokenFrom,digest,sessionCookie} from '@/lib/staff-auth';
import {withCors,options} from '@/lib/cors';
export const dynamic='force-dynamic';
export const OPTIONS=options;
export const POST=withCors(async(req:Request)=>{const token=tokenFrom(req);if(token)await bindings().db.prepare('DELETE FROM staff_sessions WHERE token_hash=?').bind(await digest(token)).run();const res=json({ok:true});res.headers.set('Set-Cookie',sessionCookie('',0));return res;});
