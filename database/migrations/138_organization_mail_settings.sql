/* Réglages « Mailing » par organisme : quels e-mails transactionnels l'organisme autorise.

   POURQUOI. Jusqu'ici, dès qu'un SMTP est configuré, TOUS les e-mails partent : identifiants de
   compte, réinitialisations, alerte de changement d'e-mail/mot de passe, notifications. Un
   organisme peut vouloir en couper certains — ne pas doubler les notifications par e-mail, ou
   (à ses risques) désactiver l'alerte de sécurité. On met UN interrupteur par TYPE d'e-mail.

   DÉFAUT = 1 (activé) sur chaque colonne : le comportement d'AVANT la migration est conservé à
   l'identique — rien ne se coupe tant que l'organisme n'a pas explicitement décoché une case.

   LE CODE MARCHE AVANT ET APRÈS. Il lit ces colonnes comme « activé si la colonne est absente,
   NULL, ou 1 » (cf. lib/orgContext.js mailActif) ; seul un 0 explicite coupe. Donc aucune
   régression tant que la migration n'est pas jouée, et le formulaire des réglages écarte
   gracieusement ces champs si les colonnes n'existent pas encore (retry ER_BAD_FIELD_ERROR). */

ALTER TABLE organization ADD COLUMN IF NOT EXISTS mail_credentials   TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE organization ADD COLUMN IF NOT EXISTS mail_reset         TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE organization ADD COLUMN IF NOT EXISTS mail_forgot        TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE organization ADD COLUMN IF NOT EXISTS mail_security      TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE organization ADD COLUMN IF NOT EXISTS mail_notifications TINYINT(1) NOT NULL DEFAULT 1;
