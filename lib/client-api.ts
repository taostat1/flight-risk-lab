let staffToken='';let studentToken='';
export function setStudentToken(token:string){studentToken=token;}
export function getStudentToken(){return studentToken;}
const backend='https://flight-risk-api-328778-12-1506862752.sh.run.tcloudbase.com';
export function setStaffToken(token:string){staffToken=token;}
export function apiUrl(path:string){return typeof window!=='undefined'&&window.location.hostname==='taostat1.github.io'?backend+path:path;}
export function apiFetch(path:string,options:RequestInit={}){const headers=new Headers(options.headers);const token=path.startsWith('/api/staff/')||path.startsWith('/api/admin/')?staffToken:studentToken;if(token)headers.set('Authorization','Bearer '+token);return fetch(apiUrl(path),{...options,headers});}
export function rootUrl(){return typeof window!=='undefined'&&window.location.hostname==='taostat1.github.io'?'/flight-risk-lab/':'/';}
