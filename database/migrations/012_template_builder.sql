-- 012_template_builder.sql
-- Éditeur de document intégré : un modèle peut désormais être construit dans
-- l'application (corps HTML avec jetons) au lieu d'un fichier Word téléversé.
--   kind = 'builder' : le rendu vient de body_html (jetons {…} remplacés) ;
--   kind = 'docx'    : ancien mode, rendu depuis le fichier .docx (colonne file).
-- Idempotent (MariaDB 10.2+).

ALTER TABLE document_template
    ADD COLUMN IF NOT EXISTS kind      varchar(10) NOT NULL DEFAULT 'builder' AFTER doc_type,
    ADD COLUMN IF NOT EXISTS body_html longtext    DEFAULT NULL              AFTER kind;
