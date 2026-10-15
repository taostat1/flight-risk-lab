import {withCors,options} from '@/lib/cors';
import {bindings,json} from '@/lib/server';
export const dynamic='force-dynamic';
async function handler(req:Request){try{const {db}=bindings();const row=await db.prepare('SELECT id,row_count FROM dataset_versions WHERE active=1').first();return json({policy_version:3,ready:!!row,rows:row?.row_count??0,version:row?.id??null,daily_limit:10});}catch{return json({ready:false,rows:0,daily_limit:10});}}

export const GET=withCors(handler);
export const OPTIONS=options;
