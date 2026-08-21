-- 067_revert_training_location.sql — ROLLBACK MANUEL.
ALTER TABLE training_session DROP COLUMN IF EXISTS location_id;
DROP TABLE IF EXISTS training_location;
