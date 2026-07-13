-- 075_revert_learner_profile_visibility.sql — ROLLBACK MANUEL.
ALTER TABLE learner DROP COLUMN IF EXISTS profile_visibility;
