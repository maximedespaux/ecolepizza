-- 076_program_emargement_break.sql
-- « Point d'accès à l'émargement » : une position DANS le parcours documentaire d'une formation
-- (on clique la flèche entre deux jalons). On mémorise le slug de l'étape située JUSTE AVANT le
-- point de rupture. Le stagiaire doit avoir signé tous les documents qu'il doit signer situés
-- avant/à ce point (par sort_order du parcours de la formation) avant de pouvoir émarger sa
-- session. NULL = aucun blocage. Réglage PAR FORMATION (training_program).
ALTER TABLE training_program
    ADD COLUMN IF NOT EXISTS emargement_break_slug VARCHAR(191) NULL DEFAULT NULL;

-- Nettoyage des approches précédentes (par document, puis au niveau organisme).
ALTER TABLE document_template DROP COLUMN IF EXISTS emargement_break;
ALTER TABLE organization DROP COLUMN IF EXISTS emargement_break_order;
