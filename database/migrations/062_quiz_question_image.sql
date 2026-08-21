-- 062_quiz_question_image.sql
-- Image optionnelle rattachée à une question de QCM (data URL) : affichée dans
-- l'éditeur et à la passation, au-dessus de la question.
ALTER TABLE quiz_question
    ADD COLUMN IF NOT EXISTS image longtext DEFAULT NULL;
