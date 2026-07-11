-- 064_quiz_row_points.sql
-- Points attribués PAR LIGNE pour les questions en grille (au lieu d'une répartition
-- automatique des points de la question). 0 = ligne non notée.
ALTER TABLE quiz_row
    ADD COLUMN IF NOT EXISTS points int NOT NULL DEFAULT 1;
