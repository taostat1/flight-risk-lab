import http from 'node:http';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {initialize} from './env';
import * as status from '@/app/api/status/route';
import * as board from '@/app/api/leaderboard/route';
import * as submit from '@/app/api/submit/route';
import * as slot from '@/app/api/submit-slot/route';
import * as template from '@/app/api/submission-template/route';
import * as features from '@/app/api/test-features/route';
import * as login from '@/app/api/staff/login/route';
import * as logout from '@/app/api/staff/logout/route';
import * as me from '@/app/api/staff/me/route';
import * as password from '@/app/api/staff/password/route';
import * as submissions from '@/app/api/admin/submissions/route';
import * as download from '@/app/api/admin/download/[id]/route';
import * as importer from '@/app/api/admin/import/route';
const routes:Record<string,any>={'/api/status':status,'/api/leaderboard':board,'/api/submit':submit,'/api/submit-slot':slot,'/api/submission-template':template,'/api/test-features':features,'/api/staff/login':login,'/api/staff/logout':logout,'/api/staff/me':me,'/api/staff/password':password,'/api/admin/submissions':submissions,'/api/admin/import':importer};
export async function dispatch(req:Request){const pathname=new URL(req.url).pathname;const route=routes[pathname]??(/^\/api\/admin\/download\/[a-zA-Z0-9-]+$/.test(pathname)?download:null);if(!route)return Response.json({error:'未找到接口。'},{status:404});const handler=route[req.method];return handler?handler(req):Response.json({error:'不支持的请求方式。'},{status:405});}
export function createServer(origin?:string){
 const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'public');
 return http.createServer(async(incoming,outgoing)=>{
  const send=(status:number,data:unknown)=>{outgoing.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});outgoing.end(JSON.stringify(data));};
  try{
   if(incoming.url==='/healthz'){send(200,{ok:true});return;}
   const requestOrigin=origin??('https://'+incoming.headers.host);
   const url=new URL(incoming.url??'/',requestOrigin);
   if(!url.pathname.startsWith('/api/')){
    if(!['GET','HEAD'].includes(incoming.method??'')){send(405,{error:'Method not allowed'});return;}
    const relative=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).replace(/^\//,'');const target=path.resolve(root,relative);
    if(!target.startsWith(root+path.sep)||(!relative.startsWith('assets/')&&!['index.html','favicon.svg','file.svg','globe.svg','window.svg'].includes(relative))){send(404,{error:'Not found'});return;}
    const data=await readFile(target).catch(()=>null);if(!data){send(404,{error:'Not found'});return;}
    const type={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[path.extname(target)]??'application/octet-stream';
    outgoing.writeHead(200,{'Content-Type':type,'X-Content-Type-Options':'nosniff','Cache-Control':relative.startsWith('assets/')?'public,max-age=31536000,immutable':'no-cache'});outgoing.end(incoming.method==='HEAD'?undefined:data);return;
   }
   const max=url.pathname==='/api/admin/import'?256*1024*1024:12*1024*1024;
   const headers=new Headers();for(const [k,v] of Object.entries(incoming.headers))if(v)headers.set(k,Array.isArray(v)?v.join(','):v);
   // Never trust an arbitrary browser-supplied IP header for login limits.
   headers.set('cf-connecting-ip',incoming.socket.remoteAddress??'unknown');
   let body:any;
   if(!['GET','HEAD'].includes(incoming.method??'')){
    const length=Number(headers.get('content-length')??0);if(!Number.isSafeInteger(length)||length<0||length>max){send(413,{error:'文件超过大小限制。'});return;}
    let count=0;body=Readable.toWeb(incoming).pipeThrough(new TransformStream({transform(chunk,controller){count+=chunk.byteLength;if(count>max)throw new Error('Request too large');controller.enqueue(chunk);}}));
   }
   const request=new Request(url,{method:incoming.method,headers,body,...(body?{duplex:'half'}:{})} as any);
   const result=await dispatch(request);outgoing.writeHead(result.status,Object.fromEntries(result.headers));
   if(result.body)await pipeline(Readable.fromWeb(result.body as any),outgoing);else outgoing.end();
  }catch(e:any){console.error('Request failed',{code:e?.code??'internal_error'});if(!outgoing.headersSent)send(503,{error:'服务暂时不可用，请稍后重试。'});else outgoing.destroy();}
 });
}
if(process.env.NODE_ENV!=='test'){
 const origin=process.env.PUBLIC_ORIGIN;
 if(origin&&!/^https:\/\/[^/]+$/.test(origin))throw new Error('Set PUBLIC_ORIGIN to the exact HTTPS domain without a trailing slash');
 await initialize();const server=createServer(origin);server.requestTimeout=600000;server.headersTimeout=60000;server.listen(Number(process.env.PORT??8080),'0.0.0.0',()=>console.log('Flight portal listening on port '+(process.env.PORT??8080)));
}
