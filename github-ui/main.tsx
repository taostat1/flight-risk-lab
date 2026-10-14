import React from 'react';
import {createRoot} from 'react-dom/client';
import SubmissionForm from '../components/submission-form';
import StaffPortal from '../components/staff-portal';
import '../app/globals.css';
function Student(){return <main><nav><a className="brand" href="./"><span className="mark">↗</span><span>航班风险分析<small>数据挖掘与机器学习 · 在线评测</small></span></a><a className="nav-link" href="?view=staff">教师 / 助教入口 <span>↗</span></a></nav><div className="page-toolbar"><h1>预测提交与评测</h1><span className="system-label"><i/>课程评测平台</span></div><SubmissionForm/><footer><span>数据挖掘与机器学习 / 航班运行风险</span><span>个人身份与提交记录仅对教师、助教开放</span></footer></main>}
createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).get('view')==='staff'?<StaffPortal/>:<Student/>);
