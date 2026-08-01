/* 122_invoice_line_discount.sql
   La remise, conservee comme DONNEE sur la ligne de facture.

   POURQUOI. La caisse sait remiser depuis toujours (un taux par ligne, ou un taux global), mais
   la remise n'etait ecrite NULLE PART : elle etait fondue dans le prix unitaire net, et sa seule
   trace lisible etait du texte colle au libelle, « Biberon valve (remise 10%) ». Impossible d'en
   tirer une colonne « Remise » sur la facture, ni un total des remises accorde : il aurait fallu
   relire une chaine de caracteres pour retrouver un chiffre, et la remise globale n'apparaissait
   meme pas dans ce libelle.

   DEUX COLONNES, ET PAS UNE. Le taux SEUL ne suffit pas a retrouver les euros : il faudrait
   diviser le net par (1 - taux), ce qui rend une troisieme decimale et fait diverger le total
   des remises du total facture. C'est exactement la derive au centime que sale.controller.js
   documente avoir deja payee. Le prix BRUT seul ne suffit pas non plus : le taux qu'on en deduit
   sort a 10,01 % la ou l'operateur avait tape 10, et une facture qui affiche un taux
   irreconciliable avec son prix n'est pas verifiable par le client.
   On garde donc les deux : le brut fait les euros (deux montants deja arrondis, soustraction
   exacte), le taux fait l'affichage (fidele a la saisie).

   NULL = aucune remise, ou ligne emise AVANT cette migration. Les deux colonnes sont
   optionnelles partout (hasColumn) : sans cette migration la facture sort comme avant, et le
   jeton Remise affiche « — ». Les factures deja emises ne sont pas retouchees — ce sont des
   documents comptables partis chez des clients.

   Commentaires en blocs : memes raisons qu'en 101/102. */

ALTER TABLE invoice_line
    ADD COLUMN IF NOT EXISTS discount_pct decimal(5,2) DEFAULT NULL
    COMMENT 'Taux de remise appliquee a la ligne, en %. NULL ou 0 = aucune remise.';

ALTER TABLE invoice_line
    ADD COLUMN IF NOT EXISTS unit_price_gross_ht decimal(10,2) DEFAULT NULL
    COMMENT 'Prix unitaire HT AVANT remise. Avec unit_price_ht (net), donne la remise en euros.';
