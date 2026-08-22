/* Revert de 138 : retire les interrupteurs d'e-mails par organisme.

   SANS RISQUE. Le code retombe sur « activé par défaut » dès que les colonnes sont absentes
   (mailActif renvoie true si la colonne manque), et le formulaire des réglages les écarte du
   UPDATE via son repli ER_BAD_FIELD_ERROR. Rien ne casse à les retirer. */

ALTER TABLE organization DROP COLUMN IF EXISTS mail_credentials;
ALTER TABLE organization DROP COLUMN IF EXISTS mail_reset;
ALTER TABLE organization DROP COLUMN IF EXISTS mail_forgot;
ALTER TABLE organization DROP COLUMN IF EXISTS mail_security;
ALTER TABLE organization DROP COLUMN IF EXISTS mail_notifications;
