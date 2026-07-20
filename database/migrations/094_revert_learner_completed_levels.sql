-- Revert 094_learner_completed_levels.sql
ALTER TABLE learner
    DROP COLUMN IF EXISTS completed_levels;
