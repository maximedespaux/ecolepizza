-- 100_company_break_slug.sql
-- Point de rupture (breakpoint) de la section « À l'arrivée via une entreprise »
-- du parcours documentaire, par formation. Analogue à emargement_break_slug
-- (parcours du dossier, migration 076), mais appliqué au sous-parcours entreprise
-- (training_program.company_steps, migration 092).
--
-- Sémantique : pour un stagiaire inscrit VIA UNE ENTREPRISE, la feuille d'émargement
-- n'est signable que lorsque les documents de la section entreprise situés À ou AVANT
-- ce point sont signés — documents de GROUPE (signature collective ORG + Entreprise)
-- comme documents STAGIAIRE (signature du stagiaire). Ce contrôle S'AJOUTE au point
-- de rupture du parcours du dossier : les deux doivent être satisfaits.
--
-- La colonne avait été introduite en 082 puis retirée en 091 ; elle est rétablie ici
-- avec la nouvelle sémantique (adossée à company_steps). Idempotent.
ALTER TABLE training_program
    ADD COLUMN IF NOT EXISTS company_break_slug VARCHAR(191) DEFAULT NULL AFTER company_steps;
