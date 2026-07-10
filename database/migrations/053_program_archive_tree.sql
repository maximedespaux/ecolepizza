-- 053_program_archive_tree.sql
-- Arborescence d'archivage d'une formation : dossiers + documents (modèles / QCM)
-- attribués, en JSON. Sert à organiser l'export ZIP du coffre Qualiopi
-- (racine automatique : {Année}/{Semaine}/{Code formation}).
ALTER TABLE training_program
    ADD COLUMN IF NOT EXISTS archive_tree longtext DEFAULT NULL;
