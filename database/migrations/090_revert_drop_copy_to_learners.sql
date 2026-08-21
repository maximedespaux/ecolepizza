-- 090_revert_drop_copy_to_learners.sql — ROLLBACK MANUEL (recrée la colonne, vide).
ALTER TABLE document_template
    ADD COLUMN IF NOT EXISTS copy_to_learners TINYINT(1) NOT NULL DEFAULT 0 AFTER company_level;
