-- 063_revert_quiz_grid_rows.sql — ROLLBACK MANUEL.
ALTER TABLE quiz_question
    MODIFY COLUMN type enum('SINGLE','MULTI','SCALE') NOT NULL DEFAULT 'SINGLE';
DROP TABLE IF EXISTS quiz_row;
