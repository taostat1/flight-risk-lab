// Compatibility layer for the existing parameterized course queries.
export function postgresSQL(sql){
 let q=sql.replace(/json_extract\(details,'\$\.scoring_version'\)/g,"(details::jsonb ->> 'scoring_version')")
  .replace(/round\(best\.best_auc,5\)/g,'round(best.best_auc::numeric,5)::float8')
  .replace(/round\(best_auc,5\)/g,'round(best_auc::numeric,5)::float8')
  .replace(/max\(0,used-1\)/g,'GREATEST(0,used-1)')
  .replace(/SET used=used\+1 WHERE used<10/g,'SET used=daily_quotas.used+1 WHERE daily_quotas.used<10')
  .replace(/\bwindow\b/g,'"window"')
  .replace(/CASE WHEN "window"=excluded\."window" THEN used\+1/g,'CASE WHEN staff_login_limits."window"=excluded."window" THEN staff_login_limits.used+1');
 if(q.includes('INSERT OR IGNORE'))q=q.replace('INSERT OR IGNORE','INSERT')+' ON CONFLICT DO NOTHING';
 let i=0;return q.replace(/\?/g,()=>'$'+(++i));
}
function result(r){return {results:r.rows??[],success:true,meta:{changes:r.rowCount??r.affectedRows??0}};}
export function database(client){
 const prepare=sql=>{const s={sql,values:[],bind(...v){return {...s,values:v};},async first(){return (await client.query(postgresSQL(this.sql),this.values)).rows[0]??null;},async all(){return result(await client.query(postgresSQL(this.sql),this.values));},async run(){return result(await client.query(postgresSQL(this.sql),this.values));}};return s;};
 return {prepare,async batch(statements){const c=client.connect?await client.connect():client;try{await c.query('BEGIN');const results=[];for(const s of statements)results.push(result(await c.query(postgresSQL(s.sql),s.values)));await c.query('COMMIT');return results;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release?.();}}};
}
