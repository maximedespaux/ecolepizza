-- 076_template_emargement_break.sql
-- « Point d'accès à l'émargement » (breakpoint) dans le parcours documentaire.
-- L'étape marquée définit la limite : le stagiaire doit avoir signé tous les documents
-- qu'il doit signer jusqu'à cette étape (incluse) avant de pouvoir émarger sa session.
-- Aucune étape marquée = pas de blocage (comportement actuel conservé).
ALTER TABLE document_template
    ADD COLUMN IF NOT EXISTS emargement_break TINYINT(1) NOT NULL DEFAULT 0;
