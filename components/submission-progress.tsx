'use client';
import {useEffect,useState} from 'react';
export type SubmissionPhase='idle'|'waiting'|'uploading'|'scoring'|'complete';
export default function SubmissionProgress({phase,startedAt,loaded,total}:{phase:SubmissionPhase,startedAt:number,loaded:number,total:number}){
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{setNow(Date.now());if(phase==='idle'||phase==='complete')return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[phase,startedAt]);
 if(phase==='idle')return null;
 const elapsed=Math.max(0,Math.floor((now-startedAt)/1000));const clock=elapsed>=60?`${Math.floor(elapsed/60)}分${elapsed%60}秒`:`${elapsed}秒`;
 const current={waiting:0,uploading:1,scoring:2,complete:3}[phase];
 const percent=total?Math.min(100,Math.floor(loaded/total*100)):0;
 const title={waiting:'等待评分时段',uploading:'正在上传文件',scoring:'上传完成，正在评分',complete:'评分完成'}[phase];
 return <section className="submission-progress" aria-label="提交进度"><ol className="submission-steps">{['等待评分时段','上传文件','计算成绩'].map((label,i)=><li key={label} className={current>i?'done':current===i?'active':''} aria-current={current===i?'step':undefined}><span>{current>i?'✓':i+1}</span>{label}</li>)}</ol><div className="progress-heading"><strong role="status">{title}</strong>{phase==='waiting'&&<span>已等待 {clock}</span>}{phase==='uploading'&&<span>{percent}% · {(loaded/1000000).toFixed(2)} / {(total/1000000).toFixed(2)} MB</span>}{phase==='scoring'&&<span>已用时 {clock}</span>}</div>{(phase==='uploading'||phase==='scoring'||phase==='complete')&&<progress aria-label="文件上传进度" max={100} value={phase==='uploading'?percent:100}/>}<p>{phase==='waiting'?'获得可用评分时段后自动开始上传。':phase==='uploading'?'进度根据实际文件传输更新，请保持页面打开。':phase==='scoring'?'文件已传输完成。100% 仅表示上传完成，成绩和排名将在评分结束后显示。':'成绩与排名已显示在下方。'}</p></section>;
}
