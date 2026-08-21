-- 065_template_layout.sql
-- Réglages de mise en page par modèle (éditeur intégré) : notamment le mode
-- « bord à bord » (sans marge) par zone en-tête / corps / pied.
-- Stocké en JSON : { "bleed": { "header": true, "body": false, "footer": true } }.
ALTER TABLE document_template
    ADD COLUMN IF NOT EXISTS layout TEXT NULL DEFAULT NULL;
