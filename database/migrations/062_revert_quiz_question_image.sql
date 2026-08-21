-- 062_revert_quiz_question_image.sql — ROLLBACK MANUEL.
ALTER TABLE quiz_question DROP COLUMN IF EXISTS image;
