-- 056_program_horaires.sql
-- Horaires détaillés de la formation (texte libre) affichés en en-tête de la
-- feuille d'émargement (ex. « le matin lundi 8h45 à 12h00 … »).
ALTER TABLE training_program
    ADD COLUMN IF NOT EXISTS horaires text DEFAULT NULL;
