-- 094_learner_avatar_image.sql
-- Photo de profil du stagiaire (visage, logo d'entreprise…), en complément des avatars
-- illustrés. Le stagiaire importe une image, la recadre dans le navigateur, et c'est un
-- carré 500x500 déjà compressé qui arrive ici — aucun traitement d'image côté serveur.
--
-- Pourquoi une table à part plutôt qu'une colonne sur `learner` : la fiche stagiaire est
-- lue dans toutes les listes, la carte, les exports et le suivi. Un BLOB dans `learner`
-- serait tiré dans chacune de ces requêtes (SELECT l.* un peu partout) pour n'être affiché
-- presque nulle part. Ici l'image ne se charge que si on la demande explicitement.
--
-- `learner.avatar` (VARCHAR(30), migration 070) reste la source du CHOIX d'avatar et prend
-- la valeur sentinelle « img » (éventuellement « img|#hexa » pour la couleur de fond) quand
-- le stagiaire utilise sa photo. Supprimer la ligne ici suffit donc à revenir aux avatars
-- illustrés, sans toucher à `learner`.
-- ON DELETE CASCADE n'est pas un confort : cette table contient des PHOTOS DE VISAGE. Sans la
-- clé étrangère, supprimer un stagiaire laisserait sa photo en base indéfiniment, orpheline et
-- invisible — impossible à retrouver le jour où il demande l'effacement de ses données. La
-- cascade fait partir l'image avec la fiche, sans rien à penser.
--
-- Les identifiants sont en `uuid` (type natif MariaDB), comme learner.id et organization.id :
-- un CHAR(36) ici serait d'un type incompatible et la clé étrangère serait refusée.
CREATE TABLE IF NOT EXISTS learner_avatar (
    learner_id      uuid        NOT NULL,
    organization_id uuid        NOT NULL,
    mime            VARCHAR(30) NOT NULL,           -- image/webp ou image/jpeg
    bytes           MEDIUMBLOB  NOT NULL,           -- 500x500 recadré : ~30-80 Ko en pratique
    updated_at      TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (learner_id),                       -- une photo par stagiaire, pas d'historique
    KEY idx_learner_avatar_org (organization_id),
    CONSTRAINT fk_lavatar_learner FOREIGN KEY (learner_id)
        REFERENCES learner (id) ON DELETE CASCADE,
    CONSTRAINT fk_lavatar_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
