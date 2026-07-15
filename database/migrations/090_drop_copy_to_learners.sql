-- 090_drop_copy_to_learners.sql
-- Nettoyage (rework signatures) : la fonctionnalité « Donner une copie aux stagiaires »
-- des documents entreprise est retirée (les documents signés par l'entreprise n'ont pas
-- à être copiés aux stagiaires). À jouer APRÈS avoir validé le nouveau modèle.
ALTER TABLE document_template DROP COLUMN IF EXISTS copy_to_learners;
