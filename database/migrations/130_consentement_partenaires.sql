/* 130_consentement_partenaires.sql
   LE CONSENTEMENT DU STAGIAIRE À LA TRANSMISSION DE SES COORDONNÉES AUX PARTENAIRES.

   CE QUI SE PASSE AUJOURD'HUI, ET POURQUOI CETTE TABLE EXISTE. L'organisme envoie aux partenaires,
   session par session et par courriel, les nom, prénom, e-mail, téléphone, formation et dates de
   ses stagiaires — et le partenaire les DÉMARCHE ensuite. C'est de la prospection commerciale par
   un tiers : elle exige le consentement PRÉALABLE de chaque personne, et l'organisme doit pouvoir
   PROUVER qu'il l'a obtenu (art. 7.1 du RGPD).

   Ce consentement n'existait nulle part : ni recueilli, ni tracé, et rien n'empêchait un stagiaire
   ayant refusé de figurer dans le courriel — puisque le courriel est écrit à la main.

   TROIS COLONNES, ET CHACUNE RÉPOND À UNE EXIGENCE PRÉCISE :

     · `partner_consent` — NULL, 0 ou 1, et les trois états sont DIFFÉRENTS. NULL veut dire
       « jamais demandé » : ce n'est pas un refus, mais ce n'est surtout pas un accord. Un booléen
       à deux états aurait forcé à choisir un défaut, et le seul défaut acceptable aurait été
       « refusé » — ce qui aurait rendu impossible de distinguer « il a dit non » de « on ne lui a
       jamais posé la question ». Or c'est exactement ce qu'un contrôle demande.

     · `partner_consent_at` — la DATE. Un consentement sans date ne prouve rien : il faut pouvoir
       dire qu'il précède la transmission, pas qu'il l'a suivie.

     · `partner_consent_text` — LE TEXTE EXACT accepté. Le consentement doit être « éclairé » : ce
       qui est prouvé, c'est l'accord à une formulation donnée. Si l'organisme reformule sa demande
       l'an prochain, les accords passés portent sur l'ancienne — et il faut le savoir plutôt que
       de le supposer. On garde donc la phrase, pas un numéro de version qui renverrait à un texte
       lui-même modifiable.

   CE QUE LA MIGRATION NE FAIT PAS, ET C'EST VOLONTAIRE : elle ne pose AUCUN consentement par
   défaut. Tous les stagiaires existants restent à NULL. Un consentement présumé n'est pas un
   consentement, et pré-cocher aurait transformé une correction en aggravation.

   LE CODE MARCHE AVANT COMME APRÈS : sans ces colonnes, l'écran de confidentialité du stagiaire
   n'affiche pas la case, et l'export partenaire refuse de produire une liste — un export qui ne
   sait pas lire les consentements ne doit rien envoyer, pas envoyer tout le monde. */

ALTER TABLE learner
    ADD COLUMN IF NOT EXISTS partner_consent TINYINT(1) DEFAULT NULL
        COMMENT 'Transmission des coordonnées aux partenaires : NULL = jamais demandé, 0 = refusé, 1 = accepté',
    ADD COLUMN IF NOT EXISTS partner_consent_at DATETIME DEFAULT NULL
        COMMENT 'Date de la dernière réponse — un consentement sans date ne prouve rien',
    ADD COLUMN IF NOT EXISTS partner_consent_text VARCHAR(500) DEFAULT NULL
        COMMENT 'Formulation exacte acceptée ou refusée — le consentement porte sur un texte, pas sur une case';

/* JOURNAL DES ENVOIS. Sans lui, on peut prouver un consentement mais pas ce qui est parti : à qui,
   quand, combien de personnes, pour quelle session. C'est la moitié manquante de la preuve — et
   c'est aussi ce qui permet de répondre à un stagiaire qui demande « à qui avez-vous donné mes
   coordonnées ? », question à laquelle il a droit (art. 15). */
CREATE TABLE IF NOT EXISTS partner_disclosure (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         NOT NULL,
    partner_id      uuid         NOT NULL,
    session_id      uuid         DEFAULT NULL,
    /* Le NOMBRE de personnes concernées, et la liste de leurs identifiants. On garde les
       identifiants et non une copie des coordonnées : recopier ici e-mails et téléphones créerait
       une seconde base de données personnelles à protéger et à purger, pour ne rien prouver de
       plus. */
    learner_ids     TEXT         DEFAULT NULL,
    learners_count  INT          NOT NULL DEFAULT 0,
    fields_sent     VARCHAR(255) DEFAULT NULL,   /* nom, email, telephone, formation… */
    sent_by         uuid         DEFAULT NULL,   /* le membre du personnel qui a lancé l'envoi */
    sent_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_disclosure_org (organization_id, sent_at),
    KEY idx_disclosure_partner (partner_id, sent_at),
    CONSTRAINT fk_disclosure_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
