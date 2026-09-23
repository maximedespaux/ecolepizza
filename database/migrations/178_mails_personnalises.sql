/* 178_mails_personnalises.sql
   LES E-MAILS DE L'ÉCOLE, ÉCRITS PAR L'ÉCOLE (demandé le 2026-09-23).

   DEUX BESOINS, DEUX TABLES. Jusqu'ici, « Mailing » n'offrait que cinq interrupteurs : on pouvait
   couper un e-mail, jamais en changer un mot — les textes vivaient dans le code. L'école voulait
   pouvoir les réécrire, et pouvoir écrire elle-même à un groupe de stagiaires.

   `mail_modele` — LE TEXTE D'UN E-MAIL AUTOMATIQUE, quand l'école l'a réécrit. Une ligne par type
   (`cle` : credentials, reset, forgot, security, notifications). Rien n'y est créé d'avance :
   sans ligne, c'est le texte livré avec l'application qui sert, et c'est le cas normal. Retirer la
   ligne, c'est revenir au texte d'origine — d'où un vrai DELETE ici, et non un drapeau « actif ».

   CE QUI EST MODIFIABLE, ET CE QUI NE L'EST PAS. On enregistre l'OBJET, le TITRE et deux zones de
   prose (`intro`, `pied`). La charpente de l'e-mail — l'encadré des identifiants, le bouton, la
   phrase « Si ce n'est PAS vous » d'une alerte de sécurité — reste dans le code : une école qui
   réécrirait tout pourrait, sans le vouloir, envoyer une alerte de sécurité sans son bouton
   d'annulation. Le texte est du TEXTE, pas du HTML : il est échappé au rendu, donc aucun e-mail
   ne peut être cassé ni détourné par ce qu'on tape ici.

   `mail_envoi` — LA TRACE D'UN ENVOI À UN GROUPE. Qui l'a envoyé, à combien de personnes, avec
   quel texte. C'est la même exigence que le journal des transmissions aux partenaires : un envoi
   part chez des tiers, il doit rester une preuve de ce qui est parti et à qui.

   Le code marche AVANT la migration : les écrans disent « pas encore disponible », les e-mails
   automatiques gardent leur texte d'origine, et l'envoi à un groupe est refusé (503). APRÈS, tout
   apparaît. Rejouable sans risque. */
CREATE TABLE IF NOT EXISTS mail_modele (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         NOT NULL,
    /* credentials, reset, forgot, security, notifications — la liste vit dans
       `lib/mailsPersonnalises.js`, et un test refuse qu'elle diverge. */
    cle             varchar(40)  NOT NULL,
    objet           varchar(200) NOT NULL,
    titre           varchar(200) NOT NULL,
    /* Deux zones de prose, en TEXTE : ce qui précède la charpente, et la note qui la suit. */
    intro           text         DEFAULT NULL,
    pied            text         DEFAULT NULL,
    updated_at      timestamp    NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
    updated_by      uuid         DEFAULT NULL,
    PRIMARY KEY (id),
    /* UN SEUL TEXTE PAR TYPE ET PAR ORGANISME : deux lignes pour « credentials » feraient
       dépendre l'e-mail envoyé de l'ordre de lecture de la base. */
    UNIQUE KEY uq_mail_modele (organization_id, cle),
    CONSTRAINT fk_mail_modele_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS mail_envoi (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         NOT NULL,
    objet           varchar(200) NOT NULL,
    corps           text         NOT NULL,
    /* « Session du 5 octobre », « Formation NIV1 », « 12 stagiaires choisis » : ce qu'on lit
       dans l'historique sans avoir à recouper des identifiants. */
    cible           varchar(200) DEFAULT NULL,
    destinataires   int          NOT NULL DEFAULT 0,
    echecs          int          NOT NULL DEFAULT 0,
    /* Les identifiants des stagiaires visés, comme `partner_disclosure` : la preuve de QUI a
       reçu, sans dupliquer leurs coordonnées dans une seconde table. */
    learner_ids     text         DEFAULT NULL,
    envoye_par      uuid         DEFAULT NULL,
    created_at      timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_mail_envoi_org (organization_id, created_at),
    CONSTRAINT fk_mail_envoi_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
