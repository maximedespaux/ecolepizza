-- 082_company_break_slug.sql
-- Point de rupture (breakpoint) du PARCOURS ENTREPRISE, par formation.
-- Analogue à emargement_break_slug (parcours stagiaire, migration 076) mais pour
-- le parcours documentaire de niveau entreprise.
ALTER TABLE training_program
    ADD COLUMN IF NOT EXISTS company_break_slug VARCHAR(191) DEFAULT NULL AFTER emargement_break_slug;
