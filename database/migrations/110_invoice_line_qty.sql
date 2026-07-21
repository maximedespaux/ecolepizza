/* 110_invoice_line_qty.sql
   Quantité et prix unitaire sur une ligne de facture.

   POURQUOI. `invoice_line` ne portait que `description` et `amount_net`. La quantité était
   noyée DANS le libellé — « Biberon valve 455 ml × 2 » — et le prix unitaire nulle part. Un
   modèle de facture ne pouvait donc pas présenter un tableau Désignation / Quantité / P.U. /
   Montant, qui est pourtant la forme attendue d'une facture.

   Ces deux valeurs sont CONNUES au moment de la vente (sale.controller les calcule pour
   décrémenter le stock) et à la facturation d'une demande boutique. Elles étaient simplement
   perdues à l'écriture, comme l'était le taux de TVA avant la 108. Même défaut, même remède :
   conserver ce que le code a déjà en main.

   NULL = information non disponible (factures antérieures, ou ligne de formation qui n'a pas
   de quantité). Le modèle affiche alors une cellule vide plutôt qu'un « 1 » inventé : mieux
   vaut un blanc franc qu'un chiffre faux sur une pièce comptable.

   decimal(10,3) pour la quantité : certains articles se vendent au poids.

   Commentaires en blocs : mêmes raisons qu'en 101/102. */

ALTER TABLE invoice_line
    ADD COLUMN IF NOT EXISTS qty decimal(10,3) DEFAULT NULL
    COMMENT 'Quantite facturee. NULL = non applicable (ligne de formation).';

ALTER TABLE invoice_line
    ADD COLUMN IF NOT EXISTS unit_price_ht decimal(10,2) DEFAULT NULL
    COMMENT 'Prix unitaire HT. NULL = non disponible (facture anterieure a la 110).';
