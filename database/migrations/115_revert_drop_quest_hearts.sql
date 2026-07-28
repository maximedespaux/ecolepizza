/* 115_revert_drop_quest_hearts.sql
   Retour arriere de 115 : recree la structure des coeurs.

   ATTENTION : recree la table et les colonnes, mais VIDES. L'etat des coeurs de chaque
   stagiaire a ete detruit par la 115 et ne se recalcule pas — chacun repartirait avec ses
   coeurs pleins. C'est sans gravite pour un compteur qui se reconstitue seul avec le temps,
   mais autant le savoir avant de jouer ce fichier.

   Les valeurs par defaut reprennent celles d'origine (migration 104) : 5 coeurs, un coeur
   toutes les 5 minutes.

   A ne jouer que si l'on revient aussi sur le code — il faudrait alors restaurer
   `api/lib/questlives.js`, les routes /quest/vies et l'onglet d'administration, tous
   supprimes en meme temps. */

ALTER TABLE organization
    ADD COLUMN IF NOT EXISTS quest_max_hearts TINYINT UNSIGNED NULL DEFAULT 5
    COMMENT 'Nombre de coeurs de Pizza Quest. NULL = valeur par defaut.';

ALTER TABLE organization
    ADD COLUMN IF NOT EXISTS quest_regen_minutes SMALLINT UNSIGNED NULL DEFAULT 5
    COMMENT 'Minutes de reconstitution d un coeur. 0 = pas de limite.';

CREATE TABLE IF NOT EXISTS learner_quest_life (
    learner_id      CHAR(36)          NOT NULL,
    organization_id CHAR(36)          NOT NULL,
    hearts          TINYINT UNSIGNED  NOT NULL DEFAULT 5,
    updated_at      DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (learner_id),
    KEY idx_quest_life_org (organization_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
