-- 042_backfill_learner_levels.sql
-- Les badges (niveaux/codes) sont désormais stockés sur learner.levels (source
-- unique, modifiable à la main). On rétro-remplit UNIQUEMENT les stagiaires qui
-- n'ont encore aucun badge, à partir des badges de leurs sessions (niveau sinon
-- code de la formation). On ne touche pas aux stagiaires déjà renseignés, pour ne
-- pas réintroduire des badges retirés manuellement.
UPDATE learner l
JOIN (
    SELECT e.learner_id,
           GROUP_CONCAT(DISTINCT COALESCE(NULLIF(p.level, ''), p.code)) AS codes
    FROM enrollment e
    JOIN training_session s ON s.id = e.session_id
    JOIN training_program p ON p.id = s.program_id
    WHERE COALESCE(NULLIF(p.level, ''), p.code) IS NOT NULL
    GROUP BY e.learner_id
) sc ON sc.learner_id = l.id
SET l.levels = sc.codes
WHERE l.levels IS NULL OR l.levels = '';
