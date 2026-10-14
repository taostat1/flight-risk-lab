import {randomUUID} from 'node:crypto';
import {postgresSQL} from './database.mjs';
// Statements are application-owned. Values are escaped in one pass; substituted
// values are never rescanned as placeholders. The HTTP envelope remains parameterized.
export function literal(value){
 if(value===null||value===undefined)return 'NULL';
 if(typeof value==='number'){if(!Number.isFinite(value))throw new Error('Invalid numeric parameter');return String(value);}
 if(typeof value==='boolean')return value?'TRUE':'FALSE';
 if(typeof value!=='string'||value.includes('\0'))throw new Error('Unsupported SQL parameter');
 return "E'"+value.replaceAll('\\','\\\\').replaceAll("'","''")+"'";
}
export function bindSQL(sql,values){let query=postgresSQL(sql);if(/^\s*(INSERT|UPDATE|DELETE)\b/i.test(query)&&! /\bRETURNING\b/i.test(query))query+=' RETURNING *';return query.replace(/\$(\d+)/g,(_,n)=>{if(+n<1||+n>values.length)throw new Error('Missing SQL parameter');return literal(values[+n-1]);});}
export function httpDatabase(config,{fetchImpl=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const id=config.CLOUDBASE_ENV_ID,key=config.CLOUDBASE_API_KEY;
 if(!/^[a-z0-9-]+$/.test(id??'')||!key)throw new Error('Set CLOUDBASE_ENV_ID and server-only CLOUDBASE_API_KEY');
 const endpoint=`https://${id}.api.tcloudbasegateway.com/v1/rdb/exec-pgsql`;
 async function execute(sql,parameters=[],retry=false){
  let last;
  for(let attempt=0;attempt<(retry?3:1);attempt++){
   try{
    const r=await fetchImpl(endpoint,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Accept:'application/json',Authorization:'Bearer '+key},body:JSON.stringify({sql,parameters,role:'cloudbase_postgres'}),signal:AbortSignal.timeout(45000)});
    const data=await r.json();
    if(!r.ok){const e=new Error('CloudBase database request failed');e.code=typeof data?.code==='string'?data.code:'HTTP_'+r.status;e.uncertain=r.status>=500||r.status===429;if(!e.uncertain)throw e;last=e;}
    else{if(!Array.isArray(data))throw new Error('Unexpected CloudBase response');return data;}
   }catch(e){if(e.uncertain===false)throw e;last=e;}
   if(attempt<2&&retry)await sleep(250*(attempt+1));
  }
  const error=new Error('Database response not confirmed');error.code=last?.code??'DATABASE_NETWORK';error.uncertain=true;throw error;
 }
 async function run(statements){
  const requestId=randomUUID();const sqls=statements.map(s=>bindSQL(s.sql,s.values));
  const write=sqls.some(s=>!/^\s*SELECT\b|^\s*WITH eligible\b/i.test(s));
  // Repeated transport attempts reuse the exact request id. The DB function
  // serializes that id and returns the original committed result.
  const rows=await execute('SELECT flight_portal.http_run_v1($1::text,$2::jsonb,$3::boolean) AS result',[requestId,JSON.stringify(sqls),write],true);
  const results=rows[0]?.result;if(!Array.isArray(results)||results.length!==statements.length)throw new Error('Invalid atomic query result');
  return results.map(results=>({results,success:true,meta:{changes:results.length}}));
 }
 const prepare=sql=>{const s={sql,values:[],bind(...values){return {...s,values};},async first(){return (await run([this]))[0].results[0]??null;},async all(){return (await run([this]))[0];},async run(){return (await run([this]))[0];}};return s;};
 return {prepare,batch:run,execute};
}
