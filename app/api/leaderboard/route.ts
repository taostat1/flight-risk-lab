import {withCors,options} from '@/lib/cors';
import {bindings,json} from '@/lib/server';
import {leaderboard} from '@/lib/leaderboard';
export const dynamic='force-dynamic';
async function handler(req:Request){
 const task=new URL(req.url).searchParams.get('task')??'binary';
 if(!['binary','multiclass'].includes(task))return json({error:'任务类型无效。'},400);
 const {db}=bindings();const active=await db.prepare('SELECT id FROM dataset_versions WHERE active=1').first<{id:string}>();
 return json({task,entries:active?await leaderboard(db,active.id,task):[]});
}

export const GET=withCors(handler);
export const OPTIONS=options;
