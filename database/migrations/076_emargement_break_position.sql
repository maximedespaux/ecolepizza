-- 076_emargement_break_position.sql
-- « Point d'accès à l'émargement » : une position DANS le parcours documentaire (entre deux
-- étapes), et non un document. On stocke le seuil = le sort_order de l'étape située juste avant
-- le point de rupture. Le stagiaire doit avoir signé tous les documents qu'il doit signer dont
-- le sort_order <= ce seuil avant de pouvoir émarger sa session. NULL = aucun blocage.
ALTER TABLE organization
    ADD COLUMN IF NOT EXISTS emargement_break_order INT NULL DEFAULT NULL;

-- Nettoyage : l'ancienne approche par document (colonne par étape) est abandonnée.
ALTER TABLE document_template DROP COLUMN IF EXISTS emargement_break;
