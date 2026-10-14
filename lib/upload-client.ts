export type TransferProgress={loaded:number,total:number};
// Progress comes only from browser upload events, never an estimated timer.
export function uploadCSV(url:string,file:Blob,headers:Record<string,string>,onProgress:(value:TransferProgress)=>void,onUploaded:()=>void):Promise<any>{
 return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();let finished=false;
  const fail=(message:string)=>{if(!finished){finished=true;reject(new Error(message));}};
  xhr.upload.onprogress=e=>{if(!finished)onProgress({loaded:Math.min(e.loaded,file.size),total:file.size});};
  xhr.upload.onload=()=>{if(!finished){onProgress({loaded:file.size,total:file.size});onUploaded();}};
  xhr.onload=()=>{if(finished)return;let data;try{data=JSON.parse(xhr.responseText);}catch{fail('服务响应异常，结果尚未确认。请先查看排行榜或联系教师核对，避免重复提交。');return;}if(xhr.status<200||xhr.status>=300){fail(data.error??'提交失败。');return;}finished=true;resolve(data);};
  xhr.onerror=()=>fail('网络连接中断，结果尚未确认。请先查看排行榜或联系教师核对，避免重复提交。');
  xhr.ontimeout=()=>fail('请求超时，结果尚未确认。请先查看排行榜或联系教师核对，避免重复提交。');
  xhr.onabort=()=>fail('上传已中止。');
  xhr.open('POST',url,true);xhr.timeout=10*60*1000;
  for(const [key,value] of Object.entries(headers))xhr.setRequestHeader(key,value);
  xhr.send(file);
 });
}
