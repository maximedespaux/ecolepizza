-- 091_revert_drop_company_break_slug.sql — ROLLBACK MANUEL (recrée la colonne, vide).
ALTER TABLE training_program
    ADD COLUMN IF NOT EXISTS company_break_slug VARCHAR(191) DEFAULT NULL AFTER emargement_break_slug;
