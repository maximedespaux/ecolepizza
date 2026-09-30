/* 196_mail_regles_document.sql

   LES RÈGLES D'E-MAIL DÉCLENCHÉES PAR UN DOCUMENT, et le CIBLAGE d'un stagiaire / d'une entreprise
   — demandé le 2026-09-30, en prolongement des envois programmés (178/179).

   Jusqu'ici une règle partait d'une DATE (fin de session, début, inscription) décalée, filtrée au plus
   par formation. On ajoute deux choses :

     1. DES DÉCLENCHEURS D'ÉVÉNEMENT — « document envoyé pour signature » et « document signé » — qui
        partent À L'INSTANT où le document change d'état (pas au passage des trente minutes), pour un
        MODÈLE au choix (`template_slug` NULL = n'importe quel document). Ces deux déclencheurs
        s'écrivent dans la colonne `declencheur` qui existe déjà (varchar) : 'document_envoye',
        'document_signe'. Ils n'utilisent ni sens ni décalage.

     2. LE DESTINATAIRE et LE CIBLAGE, sur toutes les règles :
        - `destinataire` : à qui part le message — 'stagiaire', 'entreprise' (le représentant), ou
          'stagiaire_entreprise' (les deux). Les règles de DATE existantes valent 'stagiaire', d'où
          le défaut ;
        - `learner_id` / `company_id` : viser UN stagiaire précis, ou UNE entreprise précise (tous ses
          stagiaires), au lieu d'une formation entière. NULL = pas de restriction de ce côté.

   DÉDUPLICATION DES ÉVÉNEMENTS : une règle de date ne part qu'une fois par dossier (`mail_regle_envoi`,
   clé regle+dossier). Une règle d'événement, elle, se compte PAR DOCUMENT — d'où `mail_regle_doc`
   (regle, document, destinataire) : le même document signé ne redéclenche pas deux fois, même si le
   crochet était rappelé. À PART de `mail_regle_envoi` pour ne pas mêler les deux comptages.

   LE CODE MARCHE AVANT ET APRÈS. Sans ces colonnes : les règles de date fonctionnent comme avant
   (destinataire = stagiaire, aucun ciblage), et créer une règle d'événement répond « migration 196
   non jouée » (503) au lieu de planter. Sans `mail_regle_doc`, un événement ne déclenche rien.

   VÉRIFICATION (par l'API, sans SQL) : `GET /api/mailing/regles` rend, sur une règle, la clé
   `destinataire` ; créer une règle « document signé » répond 200 (et non 503). Ou une requête, qui
   doit rendre 5 (4 colonnes + la table) :
   SELECT
     (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='impastio' AND table_name='mail_regle'
        AND column_name IN ('template_slug','destinataire','learner_id','company_id'))
   + (SELECT COUNT(*) FROM information_schema.TABLES WHERE table_schema='impastio' AND table_name='mail_regle_doc');

   REVERT : retire les colonnes et la table. Les règles d'événement déjà créées deviennent illisibles
   par le passage (declencheur inconnu → ignoré) ; les règles de date repartent au stagiaire. */

ALTER TABLE mail_regle
    ADD COLUMN IF NOT EXISTS template_slug varchar(60)  DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS destinataire  varchar(24)  NOT NULL DEFAULT 'stagiaire',
    ADD COLUMN IF NOT EXISTS learner_id    uuid         DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS company_id    uuid         DEFAULT NULL;

/* La trace ET le garde-fou anti-doublon des règles d'événement. `document_id` sans clé étrangère
   (un document supprimé n'a plus à être rejoué ; la ligne peut rester sans nuire). Collation par
   défaut de la base. */
CREATE TABLE IF NOT EXISTS mail_regle_doc (
    regle_id      uuid         NOT NULL,
    document_id   uuid         NOT NULL,
    destinataire  varchar(24)  NOT NULL,
    statut        varchar(12)  NOT NULL DEFAULT 'envoye',
    cree_le       datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (regle_id, document_id, destinataire),
    CONSTRAINT fk_mail_regle_doc_regle FOREIGN KEY (regle_id)
        REFERENCES mail_regle (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
