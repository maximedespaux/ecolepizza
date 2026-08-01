/* 127_pieces_stagiaire.sql
   Les PIECES JUSTIFICATIVES que le stagiaire doit FOURNIR.

   POURQUOI. Les seize types de documents de l'application vont tous dans le meme sens :
   l'ecole produit, le stagiaire recoit et signe. Certaines formations exigent l'inverse — une
   copie de piece d'identite recto/verso, une attestation d'hebergement, un justificatif de
   niveau. Rien ne permettait de le demander, encore moins de suivre qui l'a fourni.

   TROIS CHOSES QU'UN DOCUMENT GENERE N'A PAS, et qui expliquent ces quatre tables :
     · PLUSIEURS FICHIERS pour une meme piece — une carte d'identite a un recto ET un verso ;
     · un ETAT, parce qu'un depot se verifie : attendue -> deposee -> validee, ou REFUSEE avec
       un motif. « Illisible, recommencez » doit pouvoir se dire sans telephoner ;
     · un CONTROLE HUMAIN, donc la trace de qui a valide et quand.

   OU CELA SE DECLARE. Dans le parcours documentaire de la formation, a cote des documents et
   des QCM. Le parcours a deja un precedent : une etape peut etre un QCM (`program_step.quiz_id`)
   plutot qu'un document. Une piece a fournir est une TROISIEME nature au meme endroit — d'ou
   `program_step.piece_id`, et non une liste separee. On garde ainsi l'ordre, le glisser-deposer,
   et surtout le POINT DE RUPTURE : « pas d'acces a l'emargement tant que la piece d'identite
   n'est pas validee » devient reglable sans ecrire une ligne.

   STOCKAGE EN BLOB, comme `community_image` et `learner_avatar` : aucun fichier sur disque,
   donc aucun orphelin a nettoyer, et la suppression suit la cascade.

   ############################################################################################
   #  ATTENTION — QUESTION DE CONSERVATION NON TRANCHEE (RGPD)                                #
   #                                                                                          #
   #  Une copie de carte d'identite est une DONNEE PERSONNELLE SENSIBLE. La question « combien #
   #  de temps la garde-t-on ? » n'est PAS tranchee a ce jour (2026-08-01).                    #
   #                                                                                          #
   #  Choix d'attente, explicitement provisoire : SUPPRESSION MANUELLE UNIQUEMENT. Un scan     #
   #  reste donc en base indefiniment tant que personne ne le supprime — ce qui est exactement #
   #  ce que le principe de minimisation interdit.                                            #
   #                                                                                          #
   #  `piece_depot.purge_at` est cree DES MAINTENANT, volontairement NULL partout : le jour ou #
   #  la regle est arretee, il suffira de la remplir et d'ecrire la purge, sans nouvelle       #
   #  migration ni reprise de donnees.                                                        #
   #                                                                                          #
   #  Voir le bloc « QUESTION OUVERTE » en tete de CLAUDE.md. A reposer jusqu'a reponse.       #
   ############################################################################################

   Commentaires en blocs : memes raisons qu'en 101/102. */

/* Le referentiel : CE QU'ON PEUT demander. Partage par tout l'organisme, comme les modeles. */
CREATE TABLE IF NOT EXISTS piece_type (
    id               uuid         NOT NULL DEFAULT uuid(),
    organization_id  uuid         NOT NULL,
    code             varchar(60)  NOT NULL,
    label            varchar(160) NOT NULL,
    /* Ce qu'on attend, en clair, affiche au stagiaire au moment de deposer : « Recto ET verso,
       lisibles, non rognes ». C'est ce texte qui evite la moitie des refus. */
    consigne         varchar(400) DEFAULT NULL,
    /* Nombre de fichiers attendus — 2 pour un recto/verso. Indicatif : on ne bloque pas a 1,
       on le DIT. Un passeport n'a qu'une page, une carte de sejour en a deux. */
    fichiers_attendus tinyint     NOT NULL DEFAULT 1,
    active           tinyint(1)   NOT NULL DEFAULT 1,
    created_at       timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    UNIQUE KEY uq_piece_type (organization_id, code),
    CONSTRAINT fk_piece_type_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

/* Le DEPOT d'un stagiaire pour son dossier. Une ligne par (dossier, piece) : c'est elle qui
   porte l'etat et le motif de refus, pas les fichiers — refuser un recto/verso, c'est refuser
   la piece, pas une face. */
CREATE TABLE IF NOT EXISTS piece_depot (
    id               uuid        NOT NULL DEFAULT uuid(),
    organization_id  uuid        NOT NULL,
    enrollment_id    uuid        NOT NULL,
    piece_type_id    uuid        NOT NULL,
    /* ATTENDUE : rien de depose. DEPOSEE : en attente de verification. VALIDEE / REFUSEE :
       verifiee. Un refus GARDE les fichiers — le stagiaire doit pouvoir voir ce qu'il avait
       envoye pour comprendre le motif. */
    statut           varchar(12) NOT NULL DEFAULT 'ATTENDUE',
    motif_refus      varchar(400) DEFAULT NULL,
    verifie_par      uuid        DEFAULT NULL,
    verifie_le       timestamp   NULL DEFAULT NULL,
    depose_le        timestamp   NULL DEFAULT NULL,
    /* Date d'effacement automatique des FICHIERS. NULL = jamais, ce qui est l'etat actuel et le
       choix d'attente. Colonne creee des maintenant pour n'avoir qu'une regle a ecrire le jour
       ou la question de conservation sera tranchee — cf. l'encadre en tete de fichier. */
    purge_at         timestamp   NULL DEFAULT NULL,
    created_at       timestamp   NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    UNIQUE KEY uq_depot (enrollment_id, piece_type_id),
    KEY idx_depot_org (organization_id),
    KEY idx_depot_statut (organization_id, statut),
    KEY idx_depot_purge (purge_at),
    CONSTRAINT fk_depot_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE,
    CONSTRAINT fk_depot_enr FOREIGN KEY (enrollment_id)
        REFERENCES enrollment (id) ON DELETE CASCADE,
    CONSTRAINT fk_depot_type FOREIGN KEY (piece_type_id)
        REFERENCES piece_type (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

/* Les FICHIERS d'un depot — recto, verso, page 2. `sort_order` les garde dans l'ordre ou le
   stagiaire les a envoyes : un verso presente avant son recto se lit mal. */
CREATE TABLE IF NOT EXISTS piece_fichier (
    id            uuid         NOT NULL DEFAULT uuid(),
    depot_id      uuid         NOT NULL,
    sort_order    int          NOT NULL DEFAULT 1,
    nom           varchar(200) DEFAULT NULL,
    mime          varchar(60)  NOT NULL,
    bytes         longblob     NOT NULL,
    taille        int          NOT NULL DEFAULT 0,
    created_at    timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_fichier_depot (depot_id, sort_order),
    CONSTRAINT fk_fichier_depot FOREIGN KEY (depot_id)
        REFERENCES piece_depot (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

/* L'ETAPE DE PARCOURS qui exige la piece. Meme colonne optionnelle que `quiz_id` : une etape
   est un document, OU un QCM, OU une piece a fournir. `ADD COLUMN IF NOT EXISTS` -> rejouable,
   et le code marche avant comme apres (la colonne absente = aucune piece demandee). */
ALTER TABLE program_step
    ADD COLUMN IF NOT EXISTS piece_id uuid DEFAULT NULL
    COMMENT 'Piece justificative exigee a cette etape (piece_type.id). NULL = document ou QCM.';
