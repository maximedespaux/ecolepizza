-- 055_program_needs_emargement.sql
-- Une formation utilise-t-elle la feuille d'émargement ? (par défaut oui). Décocher
-- masque l'émargement (grille de session + item « système » dans l'archivage).
ALTER TABLE training_program
    ADD COLUMN IF NOT EXISTS needs_emargement tinyint(1) NOT NULL DEFAULT 1;
