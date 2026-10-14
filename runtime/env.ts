import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {database} from './database.mjs';
import {bucket} from './storage.mjs';
// Tests supply only synthetic data, through the runtime entry point.
export const env:any={};
export function configureTest(db:any,storage:any){if(process.env.NODE_ENV!=='test')throw new Error('Test configuration disabled');env.DB=db;env.BUCKET=storage;}
export async function initialize(){
 if(!process.env.DATABASE_URL)throw new Error('Missing DATABASE_URL');
 pg.types.setTypeParser(20,Number);
 const mode=process.env.PG_SSL_MODE??'verify-full';
 if(!['verify-full','require','disable'].includes(mode))throw new Error('Invalid PG_SSL_MODE');
 const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:5,connectionTimeoutMillis:10000,ssl:mode==='disable'?false:{rejectUnauthorized:mode!=='require',...(process.env.PG_CA_PEM?{ca:process.env.PG_CA_PEM}:{})},options:'-c search_path=flight_portal -c statement_timeout=30000'});
 const c=await pool.connect();
 try{await c.query('BEGIN');await c.query("SELECT pg_advisory_xact_lock(6142026)");await c.query('CREATE SCHEMA IF NOT EXISTS flight_portal');await c.query('REVOKE ALL ON SCHEMA flight_portal FROM PUBLIC');await c.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));await c.query('REVOKE ALL ON ALL TABLES IN SCHEMA flight_portal FROM PUBLIC');
 // No anonymous/client database role may read hidden labels or student records.
 const roles=await c.query("SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated')");for(const {rolname} of roles.rows){await c.query(`REVOKE ALL ON SCHEMA flight_portal FROM "${rolname}"`);await c.query(`REVOKE ALL ON ALL TABLES IN SCHEMA flight_portal FROM "${rolname}"`);}
 await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 env.DB=database(pool);env.BUCKET=bucket(process.env);env.STAFF_ACCOUNTS_JSON=process.env.STAFF_ACCOUNTS_JSON;
 return pool;
}
