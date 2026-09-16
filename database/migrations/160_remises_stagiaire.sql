/* 160_remises_stagiaire.sql
   LES PIECES QUE L'ORGANISME REMET AU STAGIAIRE — le miroir exact de la 127.

   POURQUOI. L'application couvrait trois cas sur quatre. Le meme fichier pour tout le monde :
   un modele de document dont le corps est un PDF, servi tel quel (livret d'accueil, reglement
   interieur). Un fichier propre a un stagiaire qu'il FOURNIT : la 127 (piece d'identite,
   justificatif). Un fichier recu de l'exterieur : la 145 (convention scannee, accord OPCO).
   Manquait le quatrieme : un fichier PROPRE A UN STAGIAIRE que l'ECOLE lui remet — un diplome
   obtenu ailleurs, l'attestation d'un certificateur, une carte professionnelle, un courrier
   nominatif. Il n'avait nulle part ou aller.

   POURQUOI PAS UN DOCUMENT GENERE. Un document genere naît d'un MODELE rempli par les jetons du
   dossier : son contenu est fabrique par l'application. Ici le fichier vient d'AILLEURS et
   arrive tel quel ; il n'y a ni modele a remplir ni jetons a resoudre. Et le modele figé, lui,
   est identique pour tous — c'est precisement ce qui le disqualifie.

   MEME STRUCTURE QUE LA 127, DELIBEREMENT : un referentiel de ce qu'on PEUT remettre, un depot
   par dossier qui porte l'etat, des fichiers a part. Deux mecanismes jumeaux qui se ressemblent
   s'apprennent une fois ; deux qui divergent s'apprennent deux fois et se contredisent un jour.

   L'ACCUSE DE RECEPTION EST LE CŒUR, et c'est lui qui justifie une table plutot qu'un champ.
   Deposer n'est pas remettre : un fichier que personne n'ouvre ne prouve rien lors d'un controle.
   L'etape n'est terminee que quand le stagiaire a confirme, et la date de sa confirmation est
   conservee. On ne deduit JAMAIS la reception d'un telechargement — ouvrir n'est pas accepter.

   OU CELA SE DECLARE. Dans le parcours documentaire, a cote des documents, des QCM et des pieces
   a fournir. `program_step.remise_id` est la QUATRIEME nature d'etape au meme endroit, pour la
   meme raison qu'en 127 : on garde l'ordre, le glisser-deposer et le point de rupture.

   STOCKAGE EN BLOB CHIFFRE, comme `piece_fichier` : aucun fichier sur disque, donc aucun
   orphelin, la suppression suit la cascade, et rien n'apparait en clair dans une sauvegarde.
   `taille` garde la taille CLAIRE, pour l'afficher sans dechiffrer.

   Commentaires en blocs : memes raisons qu'en 101/102/127. */

/* Le referentiel : CE QU'ON PEUT remettre. Partage par tout l'organisme, comme `piece_type`. */
CREATE TABLE IF NOT EXISTS remise_type (
    id               uuid         NOT NULL DEFAULT uuid(),
    organization_id  uuid         NOT NULL,
    code             varchar(60)  NOT NULL,
    label            varchar(160) NOT NULL,
    /* Ce que le stagiaire lit AVANT d'accuser reception : « Conservez-le, il vous sera demande
       a l'inscription au CAP ». C'est ce texte qui evite qu'un document remis se perde. */
    consigne         varchar(400) DEFAULT NULL,
    active           tinyint(1)   NOT NULL DEFAULT 1,
    created_at       timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    UNIQUE KEY uq_remise_type (organization_id, code),
    CONSTRAINT fk_remise_type_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

/* LA REMISE a un stagiaire, pour son dossier. Une ligne par (dossier, type) : c'est elle qui
   porte l'etat et l'accuse de reception, pas les fichiers — accuser reception d'un recto/verso,
   c'est accuser la piece, pas une face. */
CREATE TABLE IF NOT EXISTS remise_document (
    id               uuid        NOT NULL DEFAULT uuid(),
    organization_id  uuid        NOT NULL,
    enrollment_id    uuid        NOT NULL,
    remise_type_id   uuid        NOT NULL,
    /* ATTENDUE : l'ecole n'a rien depose. REMISE : le fichier est la, le stagiaire ne l'a pas
       encore confirme. RECUE : il a confirme, et `accuse_le` dit quand.
       PAS de statut de refus : le stagiaire qui recoit le mauvais document appelle l'ecole, qui
       remplace le fichier. Inventer un aller-retour ici donnerait un etat de plus a comprendre
       pour un cas que le telephone regle en une minute. */
    statut           varchar(12) NOT NULL DEFAULT 'ATTENDUE',
    remis_par        uuid        DEFAULT NULL,
    remis_le         timestamp   NULL DEFAULT NULL,
    /* LA DATE QUI COMPTE AU CONTROLE. Ecrite par le stagiaire lui-meme, jamais deduite d'un
       telechargement : ouvrir un fichier n'est pas en accuser reception. */
    accuse_le        timestamp   NULL DEFAULT NULL,
    created_at       timestamp   NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    UNIQUE KEY uq_remise (enrollment_id, remise_type_id),
    KEY idx_remise_org (organization_id),
    KEY idx_remise_statut (organization_id, statut),
    CONSTRAINT fk_remise_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE,
    CONSTRAINT fk_remise_enr FOREIGN KEY (enrollment_id)
        REFERENCES enrollment (id) ON DELETE CASCADE,
    CONSTRAINT fk_remise_type FOREIGN KEY (remise_type_id)
        REFERENCES remise_type (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

/* Les FICHIERS d'une remise. `sort_order` les garde dans l'ordre depose : un verso presente
   avant son recto se lit mal, ici comme en 127. */
CREATE TABLE IF NOT EXISTS remise_fichier (
    id            uuid         NOT NULL DEFAULT uuid(),
    remise_id     uuid         NOT NULL,
    sort_order    int          NOT NULL DEFAULT 1,
    nom           varchar(200) DEFAULT NULL,
    mime          varchar(60)  NOT NULL,
    bytes         longblob     NOT NULL,
    taille        int          NOT NULL DEFAULT 0,
    created_at    timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_remise_fichier (remise_id, sort_order),
    CONSTRAINT fk_remise_fichier FOREIGN KEY (remise_id)
        REFERENCES remise_document (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

/* L'ETAPE DE PARCOURS qui remet la piece. Quatrieme colonne optionnelle a cote de `quiz_id` et
   `piece_id` : une etape est un document, OU un QCM, OU une piece a fournir, OU une remise.
   `ADD COLUMN IF NOT EXISTS` -> rejouable, et le code marche avant comme apres (colonne absente
   = aucune remise proposee, le parcours se comporte comme aujourd'hui). */
ALTER TABLE program_step
    ADD COLUMN IF NOT EXISTS remise_id uuid DEFAULT NULL
    COMMENT 'Piece REMISE par l organisme a cette etape (remise_type.id). Cf. migration 160.';
