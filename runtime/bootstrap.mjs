import {readFile} from 'node:fs/promises';
export async function bootstrapSQL(base=import.meta.url){
 const schema=await readFile(new URL('./schema.sql',base),'utf8');
 const fn=await readFile(new URL('./http-function.sql',base),'utf8');
 // One DO statement: schema, tables, function and privilege changes commit together.
 return `DO $bootstrap$
 BEGIN
 PERFORM pg_advisory_xact_lock(6142026);
 CREATE SCHEMA IF NOT EXISTS flight_portal;
 REVOKE ALL ON SCHEMA flight_portal FROM PUBLIC;
 PERFORM set_config('search_path','flight_portal,pg_catalog',true);
 ${schema}
 ${fn}
 REVOKE ALL ON ALL TABLES IN SCHEMA flight_portal FROM PUBLIC;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
 REVOKE ALL ON SCHEMA flight_portal FROM anon;
 REVOKE ALL ON ALL TABLES IN SCHEMA flight_portal FROM anon;
 REVOKE ALL ON ALL FUNCTIONS IN SCHEMA flight_portal FROM anon;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
 REVOKE ALL ON SCHEMA flight_portal FROM authenticated;
 REVOKE ALL ON ALL TABLES IN SCHEMA flight_portal FROM authenticated;
 REVOKE ALL ON ALL FUNCTIONS IN SCHEMA flight_portal FROM authenticated;
 END IF;
 END $bootstrap$;`;
}
