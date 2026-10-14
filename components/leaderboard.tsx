'use client';
import {apiFetch} from '@/lib/client-api';
import {useEffect,useState} from 'react';
type Entry={alias:string,auc:number,rank:number};
export default function Leaderboard({task,revision}:{task:string,revision:number}){
 const [entries,setEntries]=useState<Entry[]>([]),[error,setError]=useState('');
 useEffect(()=>{let live=true;async function load(){try{const r=await apiFetch('/api/leaderboard?task='+task);if(!r.ok)throw new Error();const d:any=await r.json();if(live){setEntries(d.entries);setError('');}}catch{if(live)setError('排行榜暂时无法加载，请稍后刷新。');}}load();const timer=setInterval(load,30000);return()=>{live=false;clearInterval(timer);};},[task,revision]);
 return <section className="card leaderboard" aria-labelledby={'leaderboard-'+task}><div className="section-head"><span className="step">{task==='binary'?'03':'04'}</span><div><h2 id={'leaderboard-'+task}>{task==='binary'?'二分类':'四分类'}排行榜</h2><p>每位同学的最高 AUC · 独立排名 · 每30秒更新</p></div></div><p className="fine">按最终类别计算 AUC，仅公开别名、最高分和名次。两个任务分别排名；按显示的5位小数并列排名（1、1、3）。姓名、学号、历史记录与文件仅教师、助教可见。</p>{error&&<p className="error">{error}</p>}<div className="table-scroll"><table><thead><tr><th>名次</th><th>别名</th><th>{task==='binary'?'ROC AUC':'Macro OVR AUC'}</th></tr></thead><tbody>{entries.map((e,i)=><tr key={task+'-'+i}><td><span className={'rank-badge '+(e.rank<=3?'podium':'')}>{e.rank}</span></td><td>{e.alias}</td><td className="score-cell">{e.auc.toFixed(5)}</td></tr>)}</tbody></table>{!entries.length&&!error&&<p className="empty">尚无有效成绩，提交后即可上榜。</p>}</div></section>;
}
