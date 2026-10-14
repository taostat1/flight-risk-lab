// Public responses must explicitly select these fields; student IDs never leave this module.
export const rankingSQL=`WITH eligible AS (
 SELECT * FROM submissions WHERE status='scored' AND dataset_version=? AND json_extract(details,'$.scoring_version')='hard-label-v1'
), best AS (
 SELECT student_id,max(auc) AS best_auc FROM eligible WHERE task=? GROUP BY student_id
), aliases AS (
 SELECT student_id,public_alias AS alias,ROW_NUMBER() OVER (PARTITION BY student_id ORDER BY created_at DESC,id DESC) AS seq FROM eligible
), ranked AS (
 SELECT best.student_id,a.alias,best.best_auc,RANK() OVER (ORDER BY round(best.best_auc,5) DESC) AS rank
 FROM best JOIN aliases a USING(student_id) WHERE a.seq=1
)`;
export async function leaderboard(db:D1Database,version:string,task:string){
 const result=await db.prepare(rankingSQL+' SELECT alias,round(best_auc,5) AS auc,rank FROM ranked ORDER BY rank,alias,student_id').bind(version,task).all();
 return result.results;
}
export async function personalRank(db:D1Database,version:string,task:string,student:string){
 return db.prepare(rankingSQL+' SELECT alias,round(best_auc,5) AS best_auc,rank,(SELECT count(*) FROM ranked) AS participants FROM ranked WHERE student_id=?').bind(version,task,student).first();
}
