import {env} from '../runtime/env';
export type Staff={email:string,role:string};
const encoder=new TextEncoder();
export const COOKIE='__Host-flight_staff';
export const SESSION_SECONDS=8*60*60;
function db(){if(!env.DB)throw new Error('Storage not configured');return env.DB;}
export function hex(bytes:ArrayBuffer|Uint8Array){return Array.from(new Uint8Array(bytes)).map(n=>n.toString(16).padStart(2,'0')).join('');}
export async function digest(value:string){return hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));}
export async function passwordHash(password:string,salt:string){const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:encoder.encode(salt),iterations:100000},key,256));}
export function equal(a:string,b:string){let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;}
export function tokenFrom(req:Request){const auth=req.headers.get('authorization');if(auth)return /^Bearer ([a-f0-9]{64})$/.exec(auth)?.[1]??'';return (req.headers.get('cookie')??'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)??'';}
export async function getStaff(req:Request):Promise<Staff|null>{const token=tokenFrom(req);if(!/^[a-f0-9]{64}$/.test(token))return null;return db().prepare('SELECT a.email,a.role FROM staff_sessions s JOIN staff_accounts a ON a.email=s.email WHERE s.token_hash=? AND s.expires_at>?').bind(await digest(token),Date.now()).first<Staff>();}
export async function ensureStaff(){const raw=(env as unknown as {STAFF_ACCOUNTS_JSON?:string}).STAFF_ACCOUNTS_JSON;if(!raw)return;const accounts=JSON.parse(raw) as {email:string,role:string,salt:string,hash:string}[];for(const a of accounts)await db().prepare('INSERT OR IGNORE INTO staff_accounts(email,role,salt,password_hash) VALUES(?,?,?,?)').bind(a.email,a.role,a.salt,a.hash).run();}
export async function limited(req:Request,email:string){const now=Date.now(),window=Math.floor(now/900000);const keys=['account:'+email,'ip:'+(req.headers.get('cf-connecting-ip')??'unknown')];const rows=await db().batch(keys.map(k=>db().prepare('INSERT INTO staff_login_limits(key,window,used) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET window=excluded.window,used=CASE WHEN window=excluded.window THEN used+1 ELSE 1 END RETURNING used').bind(k,window)));return rows.some(r=>Number((r.results[0] as {used:number})?.used)>10);}
export async function readBody(req:Request){if(!req.body)throw new Error('empty');const reader=req.body.getReader();let size=0,text='';const decoder=new TextDecoder();while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();throw new Error('large');}text+=decoder.decode(value,{stream:true});}return JSON.parse(text+decoder.decode());}
export function sessionCookie(token:string,seconds=SESSION_SECONDS){return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${seconds}`;}
