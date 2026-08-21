/* 130_registre_consentements.sql
   LE REGISTRE DES CONSENTEMENTS — une LIGNE PAR DÉCISION, jamais une colonne écrasée.

   ─────────────────────────────────────────────────────────────────────────────────────────────
   POURQUOI PAS TROIS COLONNES SUR `learner`, qui était la première idée.

   Un drapeau `partner_consent` sur la fiche du stagiaire ne garde que l'état COURANT. Or ce qu'il
   faut pouvoir démontrer, c'est l'état AU MOMENT DE CHAQUE ENVOI :

       mars : le stagiaire accepte  →  avril : l'organisme transmet  →  juin : il retire son accord

   Avec une colonne, la fiche affiche « refusé » en juillet, et l'envoi d'avril devient
   indéfendable alors qu'il était parfaitement licite. La preuve du consentement (art. 7.1) est
   une preuve DATÉE : elle exige un historique, pas une valeur.

   D'où une table en AJOUT SEUL : chaque réponse crée une ligne, aucune n'est modifiée ni
   supprimée. L'état courant est la ligne la plus récente pour un stagiaire et une finalité.

   ET L'ABSENCE DE LIGNE VEUT DIRE « JAMAIS DEMANDÉ ». C'est ce qui permet de se passer d'un
   troisième état artificiel : on ne présume rien, et on distingue naturellement « il a dit non »
   de « on ne lui a jamais posé la question » — deux situations que la CNIL ne traite pas pareil.

   ─────────────────────────────────────────────────────────────────────────────────────────────
   UN CONSENTEMENT EST SPÉCIFIQUE : IL PORTE SUR UNE FINALITÉ ET SUR DES DESTINATAIRES.

   « J'accepte que vous transmettiez mes coordonnées à vos partenaires » ne couvre PAS un
   partenaire ajouté l'année suivante : la personne n'a pas pu consentir à ce qu'elle ignorait.
   D'où deux colonnes qui font tout le sel de cette table :

     · `finalite`     — à QUOI la personne a dit oui. Aujourd'hui la prospection par les
                        partenaires ; demain une newsletter, des photos de session, un annuaire
                        d'anciens. Chacune se demande et se retire SÉPARÉMENT.
     · `destinataires`— À QUI, capturé au moment du recueil, EN TEXTE et non par clés étrangères.
                        Volontaire : ce qui doit être prouvé, c'est ce que la personne a LU. Des
                        identifiants suivraient les renommages et les suppressions de partenaires,
                        et le registre finirait par dire autre chose que ce qui a été montré.

   `formulation` garde la phrase exacte, pour la même raison : un consentement « éclairé » porte
   sur un texte. Si l'organisme reformule sa demande, les accords passés restent attachés à
   l'ancienne rédaction — et il faut pouvoir le constater plutôt que le supposer.

   ─────────────────────────────────────────────────────────────────────────────────────────────
   AUCUN CONSENTEMENT N'EST CRÉÉ PAR CETTE MIGRATION. La table naît vide : tous les stagiaires sont
   donc « jamais demandé ». Semer des accords présumés aurait transformé une mise en conformité en
   aggravation.

   Le code marche avant comme après : sans la table, l'écran du stagiaire n'affiche pas la
   demande, et l'export partenaire refuse de produire une liste — un export qui ne sait pas lire
   les consentements ne doit envoyer PERSONNE, surtout pas tout le monde. */

CREATE TABLE IF NOT EXISTS consent_record (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         NOT NULL,
    learner_id      uuid         NOT NULL,
    /* La finalité, en clair plutôt qu'en ENUM : en ajouter une ne doit pas demander une migration,
       sinon on finira par en détourner une existante — et le registre mentira. */
    finalite        varchar(60)  NOT NULL,
    /* Ce que la personne a répondu. Pas de troisième valeur : « jamais demandé » = aucune ligne. */
    accorde         TINYINT(1)   NOT NULL,
    /* Ce qui lui a été MONTRÉ au moment de répondre — en texte, figé. */
    destinataires   varchar(500) DEFAULT NULL,
    formulation     varchar(600) NOT NULL,
    /* D'où vient la réponse : l'espace du stagiaire, un formulaire papier saisi par le
       secrétariat, l'inscription. Une réponse recueillie hors ligne doit rester distinguable —
       c'est elle qu'on ira rechercher en cas de contestation. */
    source          varchar(40)  NOT NULL DEFAULT 'espace_stagiaire',
    /* Qui a enregistré la réponse, si ce n'est pas le stagiaire lui-même. */
    saisi_par       uuid         DEFAULT NULL,
    decide_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    /* L'index sert la question posée à chaque lecture : « quelle est la dernière réponse de ce
       stagiaire pour cette finalité ? » */
    KEY idx_consent_courant (organization_id, learner_id, finalite, decide_at),
    CONSTRAINT fk_consent_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

/* JOURNAL DES ENVOIS — la moitié manquante de la preuve.
   Le registre montre qu'une personne avait consenti ; il ne montre pas ce qui est parti. Sans ce
   journal, impossible de répondre à « à qui avez-vous donné mes coordonnées ? », question à
   laquelle le stagiaire a droit (art. 15).
   On garde les IDENTIFIANTS des personnes concernées, pas une copie de leurs coordonnées :
   recopier ici e-mails et téléphones créerait une seconde base de données personnelles à protéger
   et à purger, sans rien prouver de plus. */
CREATE TABLE IF NOT EXISTS partner_disclosure (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         NOT NULL,
    partner_id      uuid         NOT NULL,
    session_id      uuid         DEFAULT NULL,
    learner_ids     TEXT         DEFAULT NULL,
    learners_count  INT          NOT NULL DEFAULT 0,
    champs_envoyes  varchar(255) DEFAULT NULL,   /* nom, email, telephone, formation… */
    envoye_par      uuid         DEFAULT NULL,
    sent_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_disclosure_org (organization_id, sent_at),
    KEY idx_disclosure_partner (partner_id, sent_at),
    CONSTRAINT fk_disclosure_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

/* RATTRAPAGE d'une première version de cette migration (colonnes sur `learner`), au cas où elle
   aurait été jouée avant d'être remplacée par ce registre. Sans effet si elle ne l'a pas été. */
ALTER TABLE learner
    DROP COLUMN IF EXISTS partner_consent,
    DROP COLUMN IF EXISTS partner_consent_at,
    DROP COLUMN IF EXISTS partner_consent_text;
