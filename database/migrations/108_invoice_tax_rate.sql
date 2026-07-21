/* 108_invoice_tax_rate.sql
   Le taux de TVA d'une facture, par ligne.

   POURQUOI. La facture ne portait AUCUN taux : `tva_exoneree` disait seulement oui/non, et
   lib/facturx.js appliquait 20 % en dur dans les deux sens (XML et PDF). Or la base connaît
   les vrais taux depuis longtemps — inventory_item.tax_rate, shop_request_line.tax_rate — et
   sale.controller les calcule correctement. Ce calcul juste n'était simplement jamais
   conservé : la facture émise repartait à 20 %.

   Conséquence chiffrée : 100 EUR de farine à 5,5 % étaient facturés 20 EUR de TVA au lieu de
   5,50 EUR. Et un panier mêlant deux taux était structurellement infacturable, le format
   Factur-X exigeant un groupe de taxe par taux.

   LE TAUX VA SUR LA LIGNE, PAS SUR LA FACTURE. Un panier peut mêler un livre à 5,5 % et une
   pelle à 20 % — un taux unique au niveau facture rendrait ce cas inexprimable, ce qui est
   exactement le défaut qu'on corrige. Le taux d'en-tête existe aussi, en repli, pour les
   factures sans ligne détaillée (le cas le plus courant : une formation).

   NULL = « on ne sait pas », et le code retombe alors sur l'ancien comportement (20 %, ou 0
   si exonéré). Les factures déjà émises ne sont donc pas réécrites : leur montant reste celui
   qui a été envoyé au client, ce qui est la seule option acceptable pour une pièce comptable.
   Seules les nouvelles porteront leur vrai taux.

   Commentaires en blocs : mêmes raisons qu'en 101/102. */

ALTER TABLE invoice
    ADD COLUMN IF NOT EXISTS tax_rate decimal(5,2) DEFAULT NULL
    COMMENT 'Taux de TVA en pourcentage. NULL = ancien comportement (20 pct, ou 0 si exonere).';

ALTER TABLE invoice_line
    ADD COLUMN IF NOT EXISTS tax_rate decimal(5,2) DEFAULT NULL
    COMMENT 'Taux de TVA de cette ligne. Prime sur celui de la facture.';
