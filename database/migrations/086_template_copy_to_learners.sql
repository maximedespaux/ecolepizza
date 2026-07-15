-- 086_template_copy_to_learners.sql
-- Option d'un modèle « Document entreprise » : donner une COPIE du document (signé)
-- à chaque stagiaire du groupe (visible/téléchargeable dans son espace).
ALTER TABLE document_template
    ADD COLUMN IF NOT EXISTS copy_to_learners TINYINT(1) NOT NULL DEFAULT 0 AFTER company_level;
