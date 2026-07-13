-- 083_company_archive_tree.sql
-- Arborescence d'archivage dédiée aux documents de niveau ENTREPRISE, distincte de
-- l'arborescence stagiaire (archive_tree, migration 053).
ALTER TABLE training_program
    ADD COLUMN IF NOT EXISTS company_archive_tree JSON DEFAULT NULL AFTER archive_tree;
