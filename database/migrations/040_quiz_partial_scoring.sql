-- 040_quiz_partial_scoring.sql
-- QCM : notation « points par bonne réponse » pour les questions à choix multiple.
-- Quand partial_scoring = 1 (question MULTI), chaque bonne réponse cochée rapporte
-- `points` et chaque mauvaise réponse cochée en retire autant (score de la question
-- borné à 0). Le maximum de la question devient points × (nombre de bonnes réponses).
ALTER TABLE quiz_question
    ADD COLUMN IF NOT EXISTS partial_scoring tinyint(1) NOT NULL DEFAULT 0;
