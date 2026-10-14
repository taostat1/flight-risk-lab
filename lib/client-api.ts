let staffToken='';
export function setStaffToken(token:string){staffToken=token;}
export function apiUrl(path:string){return path;}
export function apiFetch(path:string,options:RequestInit={}){const headers=new Headers(options.headers);if(staffToken)headers.set('Authorization','Bearer '+staffToken);return fetch(path,{...options,headers});}
export function rootUrl(){return '/';}
