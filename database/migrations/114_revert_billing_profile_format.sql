/* 114_revert_billing_profile_format.sql
   Retour arriere de 114.

   Apres ce retrait, les numeros repartent a la forme {PREFIX}-{YYYY}-{SEQ}, et la TVA comme les
   moyens de paiement redeviennent globaux (shop_settings). Les gabarits, statuts TVA et listes
   de paiement propres aux entites sont DETRUITS. A ne jouer que si l'on revient aussi sur le
   code. */

ALTER TABLE billing_profile
    DROP COLUMN IF EXISTS number_format,
    DROP COLUMN IF EXISTS tva_applies,
    DROP COLUMN IF EXISTS payment_methods;
