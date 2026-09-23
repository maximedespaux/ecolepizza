/* 178_revert_mails_personnalises.sql
   Retour arrière de la 178.

   ⚠️ CE QUI SE PERD : les textes d'e-mail réécrits par l'école — les automatiques reviennent au
   texte livré avec l'application, sans que personne ne soit prévenu — et l'HISTORIQUE des envois
   à un groupe, c'est-à-dire la trace de ce qui est parti chez des stagiaires. Les e-mails déjà
   envoyés, eux, sont partis : rien ne les rappelle.

   Sans risque si la 178 n'a jamais été jouée. */
DROP TABLE IF EXISTS mail_envoi;
DROP TABLE IF EXISTS mail_modele;
