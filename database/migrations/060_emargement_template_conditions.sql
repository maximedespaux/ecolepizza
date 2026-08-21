-- 060_emargement_template_conditions.sql
-- Conditions d'application (JSON) sur les modèles de feuille d'émargement, comme
-- pour les autres documents (financement, certifiante, hygiène, jours, conditions…).
ALTER TABLE emargement_template
    ADD COLUMN IF NOT EXISTS applies_when longtext DEFAULT NULL;
