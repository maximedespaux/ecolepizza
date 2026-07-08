-- 021_quiz_day.sql
-- QCM planifiés par jour de formation (ex. « QCM du jour 2 »), envoyés
-- manuellement ou automatiquement le matin du jour J. Lien direct document→QCM.

ALTER TABLE quiz
    ADD COLUMN IF NOT EXISTS day       int        DEFAULT NULL AFTER slug,   -- jour de formation (1 = 1er jour)
    ADD COLUMN IF NOT EXISTS auto_send tinyint(1) NOT NULL DEFAULT 0 AFTER day;

ALTER TABLE generated_document
    ADD COLUMN IF NOT EXISTS quiz_id uuid DEFAULT NULL;   -- document adossé à un QCM
