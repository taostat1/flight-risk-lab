CREATE TABLE IF NOT EXISTS flight_portal.http_receipts(request_id text PRIMARY KEY,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE OR REPLACE FUNCTION flight_portal.http_run_v1(rid text, statements jsonb, is_write boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path=flight_portal,pg_catalog
AS $function$
DECLARE saved jsonb; output jsonb := '[]'::jsonb; item jsonb; query_text text; rows_json jsonb; row_record record;
BEGIN
 IF jsonb_typeof(statements)<>'array' OR jsonb_array_length(statements)>20 THEN RAISE EXCEPTION 'Invalid statement batch'; END IF;
 IF is_write THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(rid,6142026));
  SELECT result INTO saved FROM flight_portal.http_receipts WHERE request_id=rid;
  IF FOUND THEN RETURN saved; END IF;
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(statements) LOOP
  query_text := item #>> '{}';
  rows_json := '[]'::jsonb;
  FOR row_record IN EXECUTE query_text LOOP
   rows_json := rows_json || jsonb_build_array(to_jsonb(row_record));
  END LOOP;
  output := output || jsonb_build_array(rows_json);
 END LOOP;
 IF is_write THEN INSERT INTO flight_portal.http_receipts(request_id,result) VALUES(rid,output); END IF;
 RETURN output;
END
$function$;
REVOKE ALL ON FUNCTION flight_portal.http_run_v1(text,jsonb,boolean) FROM PUBLIC;
