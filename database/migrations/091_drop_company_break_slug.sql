-- 091_drop_company_break_slug.sql
-- Nettoyage (rework signatures) : parcours documentaire unifié = un seul point de
-- rupture (emargement_break_slug). Le second point de rupture « entreprise » est retiré.
ALTER TABLE training_program DROP COLUMN IF EXISTS company_break_slug;
