/* 179_revert_mails_programmes.sql
   Retour arrière de la 179.

   ⚠️ CE QUI SE PERD : les règles d'envoi programmé, et surtout la MÉMOIRE de ce qui est déjà
   parti. Rejouer la 179 ensuite repartirait d'une table vide : une règle recréée à l'identique
   renverrait son message à des stagiaires qui l'ont déjà reçu — sauf que `depuis` vaudra le jour
   de la recréation, ce qui borne les dégâts aux dates cibles atteintes après coup.
   Les e-mails déjà envoyés, eux, sont partis : rien ne les rappelle.

   Sans risque si la 179 n'a jamais été jouée. */
DROP TABLE IF EXISTS mail_regle_envoi;
DROP TABLE IF EXISTS mail_regle;
