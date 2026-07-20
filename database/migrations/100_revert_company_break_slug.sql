-- 100_revert_company_break_slug.sql
-- Annule 100_company_break_slug.sql : retire le point de rupture du sous-parcours
-- entreprise. Les stagiaires arrivés via une entreprise ne sont alors plus soumis
-- qu'au point de rupture du parcours du dossier (emargement_break_slug).
ALTER TABLE training_program DROP COLUMN IF EXISTS company_break_slug;
