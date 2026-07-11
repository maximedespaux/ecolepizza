-- 064_revert_quiz_row_points.sql — ROLLBACK MANUEL.
ALTER TABLE quiz_row DROP COLUMN IF EXISTS points;
