/* 179_mails_programmes.sql
   LES ENVOIS PROGRAMMÉS — un e-mail qui part tout seul, X jours ou mois après une date
   (demandé le 2026-09-23, après la 178).

   CE QUE ÇA AJOUTE. La 178 a donné à l'école l'écriture de ses e-mails ; il lui manquait de
   pouvoir dire QUAND. « Trois mois après la fin de la session », « sept jours avant le début »,
   « deux jours après l'inscription » : une règle nomme sa date de départ, son décalage et son
   texte. C'est aussi ce qui permet de créer de NOUVEAUX e-mails automatiques — les cinq d'origine
   étaient les seuls possibles, parce qu'ils vivaient dans le code.

   `mail_regle` — LA RÈGLE. Trois déclencheurs (`fin_session`, `debut_session`, `inscription`), un
   sens (avant/après), un nombre et une unité (jour/mois/année). Le filtre `program_id` restreint
   à une formation : le suivi à froid d'un RS7404 n'est pas celui d'un niveau 1.

   `depuis` EST LE GARDE-FOU, et c'est la colonne qu'il ne faut pas retirer. Une règle « trois mois
   après la fin » créée aujourd'hui, appliquée au passé, écrirait d'un coup à trois ans d'anciens
   stagiaires — un envoi massif que rien ne rattrape. La règle ne vaut donc QUE pour les dates
   cibles atteintes après sa création : `depuis` porte cette date, et le passage quotidien ne
   regarde jamais avant.

   `mail_regle_envoi` — CE QUI EST DÉJÀ PARTI, une ligne par règle et par dossier. C'est ce qui
   empêche le deuxième envoi : le passage repasse toutes les demi-heures, et sans cette table il
   renverrait le même message à chaque passage. Clé primaire sur (regle_id, enrollment_id) : la
   base refuse le doublon, même si deux passages se chevauchaient.

   Le code marche AVANT la migration : l'onglet dit « pas encore disponible », le passage
   programmé ne trouve pas la table et s'arrête sans rien écrire. APRÈS, tout apparaît.
   Rejouable sans risque. */
CREATE TABLE IF NOT EXISTS mail_regle (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         NOT NULL,
    nom             varchar(120) NOT NULL,
    /* fin_session, debut_session, inscription — la liste vit dans `lib/mailsProgrammes.js`,
       et un test refuse qu'elle diverge. */
    declencheur     varchar(20)  NOT NULL,
    /* avant / apres : « 7 jours avant le début » est une convocation, « 3 mois après la fin »
       un suivi. La même règle sert aux deux. */
    sens            varchar(6)   NOT NULL DEFAULT 'apres',
    decalage        int          NOT NULL DEFAULT 0,
    unite           varchar(6)   NOT NULL DEFAULT 'jour',
    /* NULL = toutes les formations. Une formation supprimée emporte ses règles : elles ne
       viseraient plus rien. */
    program_id      uuid         DEFAULT NULL,
    objet           varchar(200) NOT NULL,
    corps           text         NOT NULL,
    actif           tinyint(1)   NOT NULL DEFAULT 1,
    /* La date à partir de laquelle la règle s'applique : sa création. Voir plus haut. */
    depuis          date         NOT NULL,
    created_at      timestamp    NOT NULL DEFAULT current_timestamp(),
    updated_at      timestamp    NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
    created_by      uuid         DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_mail_regle_org (organization_id, actif),
    CONSTRAINT fk_mail_regle_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE,
    CONSTRAINT fk_mail_regle_prog FOREIGN KEY (program_id)
        REFERENCES training_program (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS mail_regle_envoi (
    regle_id      uuid      NOT NULL,
    enrollment_id uuid      NOT NULL,
    learner_id    uuid      DEFAULT NULL,
    envoye_le     timestamp NOT NULL DEFAULT current_timestamp(),
    /* envoye / echec : un échec est GARDÉ, pour que le passage suivant ne recommence pas en
       boucle sur une adresse qui n'existe pas. L'écran le montre, et l'école corrige la fiche. */
    statut        varchar(10) NOT NULL DEFAULT 'envoye',
    PRIMARY KEY (regle_id, enrollment_id),
    KEY idx_mail_regle_envoi_date (regle_id, envoye_le),
    CONSTRAINT fk_mail_regle_envoi_regle FOREIGN KEY (regle_id)
        REFERENCES mail_regle (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
