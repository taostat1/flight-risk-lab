export class SubmissionError extends Error {}
export function auc(scores: Float64Array, labels: Uint8Array, positive: (label:number)=>boolean): number {
 const order=new Uint32Array(scores.length);let positives=0;
 for(let i=0;i<order.length;i++){order[i]=i;if(positive(labels[i]))positives++;}
 const negatives=order.length-positives;
 if(!positives||!negatives)throw new Error('Evaluation labels need both classes');
 order.sort((a,b)=>scores[a]-scores[b]);
 let wins=0,negBefore=0,i=0;
 while(i<order.length){let j=i,p=0,n=0;const value=scores[order[i]];
  while(j<order.length && scores[order[j]]===value){if(positive(labels[order[j]]))p++;else n++;j++;}
  wins+=p*(negBefore+.5*n);negBefore+=n;i=j;
 }
 return wins/(positives*negatives);
}
export const SCORING_VERSION='hard-label-v1';
export function metricsFromConfusion(matrix:number[][]){
 const n=matrix.flat().reduce((a,b)=>a+b,0),k=matrix.length;
 const each=matrix.map((row,i)=>{const tp=row[i],positives=row.reduce((a,b)=>a+b,0),predicted=matrix.reduce((a,r)=>a+r[i],0),fn=positives-tp,fp=predicted-tp,tn=n-tp-fn-fp;
  if(!positives||positives===n)throw new Error('Evaluation labels need all classes');
  return {auc:.5*(tp/positives+tn/(n-positives)),f1:2*tp/(2*tp+fp+fn)||0};});
 return {auc:each.reduce((a,x)=>a+x.auc,0)/k,accuracy:matrix.reduce((a,r,i)=>a+r[i],0)/n,macro_f1:each.reduce((a,x)=>a+x.f1,0)/k,class_auc:each.map(x=>x.auc)};
}
export async function scoreCSV(stream:ReadableStream<Uint8Array>,labels:Uint8Array,task:string,onBytes?:(b:Uint8Array)=>void){
 if(!['binary','multiclass'].includes(task))throw new SubmissionError('任务类型无效。');
 const multi=task==='multiclass',k=multi?4:2,n=labels.length;
 const confusion=Array.from({length:k},()=>Array(k).fill(0) as number[]),binary=[[0,0],[0,0]],seen=new Uint8Array(n);
 const decoder=new TextDecoder('utf-8',{fatal:true});let pending='',header=false,rowCount=0,bytes=0;
 function line(raw:string){const s=raw.replace(/\r$/,'');if(!s.trim())return;
  if(!header){const expected=multi?'test_id,y_class':'test_id,y_disruption';if(s.replace(/^\uFEFF/,'').trim()!==expected)throw new SubmissionError('表头必须为 '+expected);header=true;return;}
  const a=s.split(',');if(a.length!==2||!/^\d+$/.test(a[0].trim()))throw new SubmissionError('每行必须为编号和最终类别两列。');
  const id=Number(a[0])-1;if(!Number.isSafeInteger(id)||id<0||id>=n||seen[id])throw new SubmissionError('编号必须覆盖全部测试记录，不得重复或超出范围。');
  const v=a[1].trim();if(!(multi?/^[0-3]$/:/^[01]$/).test(v))throw new SubmissionError(multi?'最终类别必须是整数0、1、2或3。':'最终类别必须是整数0或1。');
  const predicted=Number(v),truth=multi?labels[id]:Number(labels[id]>=2);
  if(labels[id]>3)throw new Error('Invalid evaluation label');
  confusion[truth][predicted]++;binary[Number(labels[id]>=2)][multi?Number(predicted>=2):predicted]++;seen[id]=1;rowCount++;
 }
 const reader=stream.getReader();
 try{while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>12*1024*1024)throw new SubmissionError('文件不得超过12MB。');onBytes?.(value);pending+=decoder.decode(value,{stream:true});let start=0,end;while((end=pending.indexOf('\n',start))>=0){if(end-start>128)throw new SubmissionError('记录行长度异常。');line(pending.slice(start,end));start=end+1;}pending=pending.slice(start);if(pending.length>128)throw new SubmissionError('记录行长度异常。');}pending+=decoder.decode();if(pending.trim())line(pending);
 }catch(e){if(e instanceof TypeError)throw new SubmissionError('请保存为UTF-8编码的CSV文件。');throw e;}finally{reader.releaseLock();}
 if(!header||rowCount!==n)throw new SubmissionError(`必须提交全部 ${n.toLocaleString('en-US')} 条测试记录，当前为 ${rowCount.toLocaleString('en-US')} 条。`);
 const metrics=metricsFromConfusion(confusion);
 return {...metrics,confusion_matrix:confusion,binary_auc:multi?metricsFromConfusion(binary).auc:null,rows:rowCount,scoring_version:SCORING_VERSION};
}
