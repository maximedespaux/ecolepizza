-- 093_custom_token_category.sql
-- Catégorie (groupe de palette) d'un jeton personnalisé : permet de le ranger dans
-- un groupe existant (ex. « Groupe entreprise », « Stagiaire »…). Vide = « Personnalisé ».
ALTER TABLE custom_token
    ADD COLUMN IF NOT EXISTS category VARCHAR(80) DEFAULT NULL AFTER label;
