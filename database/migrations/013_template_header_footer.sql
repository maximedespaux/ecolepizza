-- 013_template_header_footer.sql
-- En-tête et pied de page éditables par modèle (éditeur intégré). Si header_html
-- est vide, le rendu utilise le papier à en-tête généré depuis l'organisme.
-- Idempotent (MariaDB 10.2+).

ALTER TABLE document_template
    ADD COLUMN IF NOT EXISTS header_html longtext DEFAULT NULL AFTER body_html,
    ADD COLUMN IF NOT EXISTS footer_html longtext DEFAULT NULL AFTER header_html;
