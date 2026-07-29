/* 114_community_post.sql
   L'espace d'echange : poser une QUESTION, y repondre, marquer ce qui a aide.

   POURQUOI. La Communaute ne savait faire qu'une chose : partager une fiche technique et la
   commenter. C'est une bibliotheque. Or ce qui manque a une promotion de trente stagiaires
   dispersee apres la formation, ce n'est pas un rayonnage de plus : c'est un endroit ou
   demander « ma pate colle, qu'est-ce que je rate ? » et recevoir une reponse de quelqu'un qui
   a eu le meme probleme. Une question resolue sert ensuite a tous ceux qui la reliront — c'est
   ce qui transforme un rayonnage en base de connaissance.

   POURQUOI UNE TABLE A PART, ET NON UN `kind` DE PLUS SUR `recipe`. La solution la plus courte
   aurait ete d'etendre l'ENUM recipe.kind ('PATE','PREPARATION','RECETTE') d'une valeur
   'QUESTION'. Elle a ete ecartee : une question n'a ni ingredient, ni rendement, ni cout, ni
   parametres de pate. Elle aurait porte une quinzaine de colonnes NULL, et surtout chaque
   calcul de la Communaute (cout matiere, prix conseille, barre d'hydratation) aurait eu besoin
   d'une garde « sauf si c'est une question ». Une table qui ment sur son nom finit par couter
   plus cher que la jointure qu'elle economise.

   Le FIL RESTE UNIQUE cote ecran : deux sources, un seul flux trie par date. Avec une trentaine
   de stagiaires actifs, deux onglets separes donneraient deux salles a moitie vides, et
   personne ne va voir l'onglet ou il n'a rien poste.

   TROIS TABLES :

   · community_post — la publication. `kind` distingue la QUESTION (posee par un stagiaire) de
     l'ANNONCE (ecrite par l'ecole, epinglee en tete). `resolved_answer_id` porte la reponse que
     l'AUTEUR a marquee « ca m'a aide » : une seule, et c'est lui seul qui la designe — un vote
     collectif classerait les gens, pas les reponses.

   · community_answer — les reponses. Table distincte de recipe_comment : un commentaire de
     fiche et une reponse a une question ne se moderent pas pareil, et l'une doit pouvoir etre
     designee comme la bonne, l'autre non.

   · community_image — la photo, sur le modele EXACT de learner_avatar (migration 094) : les
     octets en base, servis par une route authentifiee. C'est un metier manuel ; on y partage
     aujourd'hui des chiffres et jamais le resultat. Une photo doit survivre a un changement
     d'appareil, donc elle ne peut pas vivre dans le navigateur.

   ON DELETE CASCADE sur les reponses et les images : elles n'existent que par leur publication,
   une reponse orpheline n'a aucun sens. En revanche `resolved_answer_id` est en SET NULL —
   supprimer la reponse marquee ne doit pas emporter la question avec elle.

   Commentaires en blocs : memes raisons qu'en 101/102. */

CREATE TABLE IF NOT EXISTS community_post (
    id                  CHAR(36)     NOT NULL,
    organization_id     CHAR(36)     NOT NULL,
    author_user_id      CHAR(36)     NOT NULL,
    author_name         VARCHAR(120) DEFAULT NULL COMMENT 'Nom fige a la publication (l auteur peut quitter l ecole).',
    kind                ENUM('QUESTION','ANNONCE') NOT NULL DEFAULT 'QUESTION',
    title               VARCHAR(200) NOT NULL,
    body                TEXT         DEFAULT NULL,
    pinned              TINYINT(1)   NOT NULL DEFAULT 0 COMMENT 'Annonce epinglee en tete du fil.',
    resolved_answer_id  CHAR(36)     DEFAULT NULL COMMENT 'Reponse marquee « ca m a aide » par l auteur. NULL = sans reponse retenue.',
    created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_post_org (organization_id, created_at),
    KEY idx_post_author (author_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS community_answer (
    id            CHAR(36)     NOT NULL,
    post_id       CHAR(36)     NOT NULL,
    user_id       CHAR(36)     DEFAULT NULL,
    author_name   VARCHAR(120) DEFAULT NULL,
    body          TEXT         NOT NULL,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_answer_post (post_id, created_at),
    CONSTRAINT fk_answer_post FOREIGN KEY (post_id) REFERENCES community_post (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS community_image (
    id              CHAR(36)    NOT NULL,
    post_id         CHAR(36)    NOT NULL,
    organization_id CHAR(36)    NOT NULL,
    mime            VARCHAR(40) NOT NULL,
    bytes           LONGBLOB    NOT NULL,
    created_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_image_post (post_id),
    KEY idx_image_org (organization_id),
    CONSTRAINT fk_image_post FOREIGN KEY (post_id) REFERENCES community_post (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE community_post
    ADD CONSTRAINT fk_post_resolved FOREIGN KEY (resolved_answer_id)
        REFERENCES community_answer (id) ON DELETE SET NULL;
