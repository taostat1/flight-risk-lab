import COS from 'cos-nodejs-sdk-v5';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {mkdtemp,stat,rm} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
export function bucket(config){
 for(const k of ['COS_BUCKET','COS_REGION','COS_SECRET_ID','COS_SECRET_KEY'])if(!config[k])throw new Error('Missing '+k);
 const cos=new COS({SecretId:config.COS_SECRET_ID,SecretKey:config.COS_SECRET_KEY,SecurityToken:config.COS_SESSION_TOKEN,Timeout:180000});
 const params=Key=>({Bucket:config.COS_BUCKET,Region:config.COS_REGION,Key});
 return {
  async put(key,body,options={}){
   const dir=await mkdtemp(path.join(tmpdir(),'flight-upload-'));const file=path.join(dir,'object');
   try{
    const input=body instanceof ReadableStream?Readable.fromWeb(body):Readable.from([Buffer.from(body)]);
    await pipeline(input,createWriteStream(file));const {size}=await stat(file);
    await cos.putObject({...params(key),Body:createReadStream(file),ContentLength:size,ContentType:options.httpMetadata?.contentType??'application/octet-stream'});
   }finally{await rm(dir,{recursive:true,force:true});}
  },
  async delete(key){
   if(!/^submissions\/[a-f0-9-]+\.csv$/.test(key))throw new Error('Invalid deletion scope');
   await cos.deleteObject(params(key));
  },
  async get(key){
   const url=await new Promise((resolve,reject)=>cos.getObjectUrl({...params(key),Sign:true,Expires:600},(e,d)=>e?reject(e):resolve(d.Url)));
   const response=await fetch(url,{signal:AbortSignal.timeout(180000)});
   if(response.status===404)return null;
   if(!response.ok)throw new Error('Object storage unavailable: '+response.status);
   return {body:response.body,arrayBuffer:()=>response.arrayBuffer()};
  }
 };
}
