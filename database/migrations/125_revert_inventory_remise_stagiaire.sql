/* 125_revert_inventory_remise_stagiaire.sql
   Retour arriere de 125. Les remises stagiaires parametrees sur les articles sont DETRUITES, et
   les commandes deja passees perdent la trace du taux qui leur avait ete applique.

   Les MONTANTS ne bougent pas : `shop_request_line.unit_price_ht` porte le prix net, remise deja
   deduite, et les factures emises gardent leurs totaux. Seule l'explication disparait — la
   colonne « Remise » des modeles retombe sur « — » pour ces lignes.

   A ne jouer que si l'on revient aussi sur le code. */

ALTER TABLE inventory_item
    DROP COLUMN IF EXISTS learner_discount_pct;

ALTER TABLE inventory_item
    DROP COLUMN IF EXISTS learner_discount_eur;

ALTER TABLE shop_request_line
    DROP COLUMN IF EXISTS discount_pct;

ALTER TABLE shop_request_line
    DROP COLUMN IF EXISTS unit_price_gross_ht;
