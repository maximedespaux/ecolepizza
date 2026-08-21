-- 041_program_color.sql
-- Couleur personnalisée d'une formation (badge / pastille). Si NULL, la couleur
-- est déduite automatiquement (palette unifiée : niveau ou code).
ALTER TABLE training_program
    ADD COLUMN IF NOT EXISTS color varchar(20) DEFAULT NULL;
