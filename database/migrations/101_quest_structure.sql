/* 101_quest_structure.sql
   STRUCTURE de Pizza Quest, pilotée par l'organisme (phase 1 : catégories + prérequis).

   Jusqu'ici la « carte » de Pizza Quest était plate : un monde par formation du stagiaire,
   sans regroupement ni ordre. L'organisme veut pouvoir ranger ses formations (thème + niveau)
   et dire laquelle doit être faite AVANT une autre.

   UNE SEULE table de catégories avec un discriminant `kind` plutôt que deux tables jumelles :
   thème et palier ont exactement les mêmes colonnes (nom, couleur, icône, ordre) et les mêmes
   écrans de gestion. Deux tables identiques imposeraient deux fois le même CRUD, deux fois les
   mêmes routes, et le jour où l'on ajoute un troisième axe de classement, une table de plus.

   NOTE — commentaires en blocs et pas en `--` : ce fichier est parfois collé dans une console
   SQL web qui écrase les retours à la ligne. Avec `--`, tout ce qui suit le premier commentaire
   passe en commentaire et PLUS RIEN ne s'exécute. Un bloc se referme, donc le script survit.

   NOTE — type `uuid` et pas CHAR(36) : c'est le type natif MariaDB (stocké en BINARY(16)),
   et c'est celui de organization.id / training_program.id. Une clé étrangère CHAR(36) vers
   une colonne `uuid` est refusée pour incompatibilité de type (errno 150). */

CREATE TABLE IF NOT EXISTS quest_category (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         NOT NULL,
    /* THEME = de quoi ça parle (Pizza, Gestion, Hygiène). TIER = à quel niveau on est
       (Débutant, Confirmé, Expert). Une formation porte l'un, l'autre, les deux ou aucun. */
    kind            ENUM('THEME','TIER') NOT NULL,
    name            VARCHAR(120) NOT NULL,
    slug            VARCHAR(120) NOT NULL,
    color           VARCHAR(20)  DEFAULT NULL,   /* #rrggbb ; sinon couleur déduite du nom */
    icon            VARCHAR(40)  DEFAULT NULL,   /* nom d'icône (cf. components/Icon.jsx) */
    sort_order      INT          NOT NULL DEFAULT 0,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    /* Unicité PAR AXE : rien n'interdit un thème « Expert » et un palier « Expert ». */
    UNIQUE KEY uq_questcat_slug (organization_id, kind, slug),
    KEY idx_questcat_org (organization_id, kind, sort_order),
    CONSTRAINT fk_questcat_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

/* Rattachement d'une formation à ses catégories. Volontairement SANS clé étrangère : la
   suppression d'une catégorie est traitée dans le contrôleur (remise à NULL des formations
   concernées), et l'absence de contrainte garde la migration rejouable sans erreur 121 sur
   un nom déjà pris. Une référence orpheline se résout de toute façon en LEFT JOIN → NULL. */
ALTER TABLE training_program
    ADD COLUMN IF NOT EXISTS quest_theme_id uuid DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS quest_tier_id  uuid DEFAULT NULL;

/* Prérequis : « pour attaquer CETTE formation, il faut avoir terminé CELLE-LÀ ».

   Table de liaison et pas une colonne `requires_program_id` sur training_program : une
   formation peut en exiger plusieurs (un Expert qui demande Niveau I ET Niveau II), et une
   colonne unique obligerait à choisir laquelle citer.

   L'absence de CYCLE (A exige B qui exige A — les deux définitivement verrouillées) ne peut
   pas s'exprimer en SQL : elle est vérifiée à l'écriture dans questStructure.controller.js. */
CREATE TABLE IF NOT EXISTS quest_prerequisite (
    id                  uuid      NOT NULL DEFAULT uuid(),
    organization_id     uuid      NOT NULL,
    program_id          uuid      NOT NULL,   /* la formation qu'on veut atteindre */
    requires_program_id uuid      NOT NULL,   /* celle qu'il faut avoir terminée avant */
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_prereq (program_id, requires_program_id),
    KEY idx_prereq_org (organization_id),
    KEY idx_prereq_req (requires_program_id),
    CONSTRAINT fk_prereq_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE,
    CONSTRAINT fk_prereq_prog FOREIGN KEY (program_id)
        REFERENCES training_program (id) ON DELETE CASCADE,
    CONSTRAINT fk_prereq_reqprog FOREIGN KEY (requires_program_id)
        REFERENCES training_program (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
