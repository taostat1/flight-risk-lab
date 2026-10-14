import { env } from '../runtime/env';
import {getStaff} from './staff-auth';
import {allowedOrigin} from './cors';
export const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function bindings(){if(!env.DB||!env.BUCKET)throw new Error('Storage not configured');return {db:env.DB,bucket:env.BUCKET};}
export async function isAdmin(req:Request){return !!await getStaff(req);}
export const sameOrigin=allowedOrigin;
export function shanghaiDay(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
