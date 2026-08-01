/* 114_billing_profile_format.sql
   L'entité émettrice se suffit à elle-même : format de numéro, TVA, moyens de paiement.

   POURQUOI. Une fois les entités émettrices en place, les « réglages de facturation » globaux
   (shop_settings) faisaient double emploi : préfixe et compteur vivaient déjà sur l'entité. Le
   reste — assujettissement à la TVA, moyens de paiement — appartient tout autant à l'entité qui
   facture : deux sociétés peuvent avoir un statut TVA et des modes de règlement différents.
   Regrouper le tout sur l'émettrice supprime un écran, et surtout un endroit où deux réglages
   pour la même question pouvaient se contredire.

   FORMAT DE NUMÉRO LIBRE. Le numéro n'était modelable que par son préfixe : « F-2026-0001 ».
   `number_format` laisse composer la forme entière avec des jetons — « TXT.{YYYY}.901.{SEQ:4} »
   donne « TXT.2026.901.0001 ». Jetons : {PREFIX} {YYYY} {YY} {MM} {DD} {SEQ} {SEQ:n}. NULL =
   la forme historique {PREFIX}-{YYYY}-{SEQ}, pour que rien ne change sans qu'on le demande.

   {SEQ} EST OBLIGATOIRE dans un format non vide : c'est la seule partie qui varie d'une facture
   à l'autre. Un format qui l'omettrait produirait deux fois le même numéro — rejeté à
   l'unicité (uq_invoice_number). La validation à l'enregistrement l'exige ; on ne laisse pas un
   organisme se fabriquer des doublons.

   Commentaires en blocs : mêmes raisons qu'en 101/102. */

ALTER TABLE billing_profile
    ADD COLUMN IF NOT EXISTS number_format varchar(120) DEFAULT NULL
    COMMENT 'Gabarit du numero de facture (jetons PREFIX/YYYY/YY/MM/DD/SEQ). NULL = {PREFIX}-{YYYY}-{SEQ}.';

/* TVA de l'entite : 1 = TVA appliquee, 0 = exoneree. Defaut 1, comme shop_settings. */
ALTER TABLE billing_profile
    ADD COLUMN IF NOT EXISTS tva_applies tinyint(1) NOT NULL DEFAULT 1;

/* Moyens de paiement proposes en caisse pour cette entite (liste separee par des virgules).
   NULL = on retombe sur ceux de shop_settings, puis sur la liste par defaut. */
ALTER TABLE billing_profile
    ADD COLUMN IF NOT EXISTS payment_methods varchar(255) DEFAULT NULL;
