import {bindings} from './server';
import {tokenFrom,digest} from './staff-auth';
export async function getStudent(req:Request){
 const token=tokenFrom(req);if(!token)return null;
 return bindings().db.prepare(`SELECT a.student_id,a.student_name,a.must_change
 FROM student_accounts a JOIN student_sessions s ON a.student_id=s.student_id
 WHERE s.token_hash=? AND s.expires_at>?`).bind(await digest(token),Date.now()).first<{student_id:string,student_name:string,must_change:number}>();
}
