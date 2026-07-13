-- 070_revert_learner_gamification.sql — ROLLBACK MANUEL.
DROP TABLE IF EXISTS learner_quest_progress;
ALTER TABLE learner DROP COLUMN IF EXISTS avatar;
