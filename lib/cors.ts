export function allowedOrigin(req:Request){const origin=req.headers.get('origin');return !origin||origin===new URL(req.url).origin;}
export function options(req:Request){return new Response(null,{status:allowedOrigin(req)?204:403});}
export function withCors<T extends unknown[]>(fn:(req:Request,...rest:T)=>Promise<Response>){return async(req:Request,...rest:T)=>{if(!allowedOrigin(req))return Response.json({error:'请求来源无效。'},{status:403});return fn(req,...rest);};}
