/* 195_reglement_moyen_paiement.sql

   LE MOYEN DE PAIEMENT du règlement d'un dossier — demandé le 2026-09-30, dans la foulée de la carte
   « Règlement » (194). L'école veut noter COMMENT l'acompte et le solde ont été réglés : espèces,
   chèque, virement, carte ; et, pour un chèque ou un virement, le NUMÉRO / la RÉFÉRENCE.

   SÉPARÉMENT pour l'acompte ET pour le solde (décidé le même jour) : un acompte peut être payé par
   chèque et le solde par virement. Quatre colonnes sur `enrollment` :
     · `acompte_moyen` / `solde_moyen`  : le moyen (ESPECES, CHEQUE, VIREMENT, CARTE — la LISTE vit
        dans `lib/moyensPaiement.js`, partagée écran/serveur ; varchar et non enum pour qu'un moyen
        de plus ne demande pas de migration) ;
     · `acompte_ref`   / `solde_ref`    : le n° de chèque ou la référence de virement (vide sinon).

   Ces valeurs deviennent des JETONS du groupe « Stagiaire » ({Moyen acompte}, {Réf acompte},
   {Moyen solde}, {Réf solde}) : une facture peut imprimer « réglé par chèque n° 12345 ». Elles se
   saisissent sur la carte « Règlement » (fiche stagiaire), à côté du « payé le … » de la 194.

   LE CODE MARCHE AVANT ET APRÈS. Sans ces colonnes, la carte n'affiche pas le moyen et le dit, la
   saisie répond « migration 195 non jouée » (503), et les jetons correspondants sortent vides (donc
   facultatifs, cf. OPTIONAL_TOKENS). varchar, pas enum : ajouter un moyen plus tard ne demandera
   aucune migration.

   VÉRIFICATION (par l'API, sans SQL) : choisir « Chèque » + un n° pour l'acompte d'un dossier répond
   200 (et non 503), puis GET /api/stagiaires/:id/reglements rend `acompte.moyen: "CHEQUE"` et la
   référence. Ou une requête, qui doit rendre 4 :
   SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='impastio'
     AND table_name='enrollment' AND column_name IN ('acompte_moyen','acompte_ref','solde_moyen','solde_ref')

   REVERT : efface les moyens et références saisis ; les montants et les dates (194) restent. */

ALTER TABLE enrollment
    ADD COLUMN IF NOT EXISTS acompte_moyen varchar(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS acompte_ref   varchar(80) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS solde_moyen   varchar(20) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS solde_ref     varchar(80) DEFAULT NULL;
