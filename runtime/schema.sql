CREATE TABLE IF NOT EXISTS dataset_versions(id text PRIMARY KEY,row_count integer NOT NULL,label_key text NOT NULL,class_counts text NOT NULL,created_at text NOT NULL,active integer NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_dataset ON dataset_versions(active) WHERE active=1;
CREATE TABLE IF NOT EXISTS scoring_lock(id integer PRIMARY KEY,owner text NOT NULL,expires bigint NOT NULL);
CREATE TABLE IF NOT EXISTS daily_quotas(student_id text NOT NULL,day text NOT NULL,used integer NOT NULL CHECK(used>=0 AND used<=10),PRIMARY KEY(student_id,day));
CREATE TABLE IF NOT EXISTS submissions(id text PRIMARY KEY,student_id text NOT NULL,student_name text NOT NULL,public_alias text NOT NULL DEFAULT '',task text NOT NULL,created_at text NOT NULL,day text NOT NULL,status text NOT NULL,auc double precision,binary_auc double precision,details text,row_count integer,file_hash text,object_key text NOT NULL,error text,dataset_version text NOT NULL);
CREATE INDEX IF NOT EXISTS submissions_board ON submissions(dataset_version,status,task,student_id);
CREATE INDEX IF NOT EXISTS submissions_created ON submissions(created_at DESC);
CREATE TABLE IF NOT EXISTS staff_accounts(email text PRIMARY KEY,role text NOT NULL,salt text NOT NULL,password_hash text NOT NULL);
CREATE TABLE IF NOT EXISTS staff_sessions(token_hash text PRIMARY KEY,email text NOT NULL,expires_at bigint NOT NULL);
CREATE TABLE IF NOT EXISTS staff_login_limits(key text PRIMARY KEY,"window" bigint NOT NULL,used integer NOT NULL);

CREATE TABLE IF NOT EXISTS student_accounts(student_id text PRIMARY KEY,student_name text NOT NULL,salt text NOT NULL,password_hash text NOT NULL,must_change integer NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS student_sessions(token_hash text PRIMARY KEY,student_id text NOT NULL,expires_at bigint NOT NULL);
CREATE TABLE IF NOT EXISTS student_login_limits(student_id text PRIMARY KEY,"window" bigint NOT NULL,used integer NOT NULL);
