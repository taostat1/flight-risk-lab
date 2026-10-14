import {json} from '@/lib/server';
import {getStaff} from '@/lib/staff-auth';
import {withCors,options} from '@/lib/cors';
export const dynamic='force-dynamic';
export const OPTIONS=options;
export const GET=withCors(async(req:Request)=>{const staff=await getStaff(req);return staff?json({staff}):json({error:'请先登录。'},401);});
