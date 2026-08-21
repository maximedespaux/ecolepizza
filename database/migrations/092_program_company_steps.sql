-- 092_program_company_steps.sql
-- Section « à l'arrivée via une entreprise » du parcours documentaire : liste
-- ORDONNÉE de slugs (documents de groupe 🏢 ET documents stagiaire) qui composent
-- le sous-parcours d'intake entreprise. Stockée en JSON (tableau de slugs).
-- Sert de repère visuel sur la fiche entreprise (parcours du groupe).
ALTER TABLE training_program
    ADD COLUMN IF NOT EXISTS company_steps JSON DEFAULT NULL AFTER emargement_break_slug;
