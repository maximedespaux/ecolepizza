/* 125_inventory_remise_stagiaire.sql
   Une remise reservee aux stagiaires, article par article.

   POURQUOI. L'ecole veut faire un geste sur certains articles pour ceux qui suivent la formation
   — « tu es stagiaire, cette pelle est a -15 % pour toi ». Aujourd'hui un seul prix existe
   (inventory_item.unit_price) : la seule facon de faire ce geste etait de baisser le prix POUR
   TOUT LE MONDE, y compris a la vente au comptoir a un client de passage, ou de remiser a la main
   a chaque commande — donc de l'oublier une fois sur deux.

   VISIBLE UNIQUEMENT DANS LA BOUTIQUE STAGIAIRE. La caisse (Ventes.jsx) garde le prix catalogue :
   elle sert aussi bien un stagiaire qu'un tiers, et c'est l'operateur qui decide d'une remise au
   cas par cas (cf. la remise de ligne, migration 122). Appliquer celle-ci partout reviendrait a
   baisser le prix tout court, ce que `unit_price` fait deja.

   NULL ou 0 = pas de remise, l'article est au prix catalogue. C'est le defaut : aucune commande
   existante ne change de prix.

   Le taux est fige sur la LIGNE de demande au moment de la commande (shop_request_line), pas
   relu a la facturation : le stagiaire a vu un prix, c'est celui-la qui l'engage, meme si
   l'ecole change sa remise le lendemain. Meme raison que le SKU fige sur la ligne de facture (118).

   Commentaires en blocs : memes raisons qu'en 101/102. */

/* DEUX FORMES DE REMISE, une seule renseignee a la fois.

   Un pourcentage ne dit pas la meme chose qu'un montant. « -10 % » suit le prix : si l'article
   passe de 40 a 60 EUR, le geste passe de 4 a 6 EUR tout seul. « -5 EUR » reste 5 EUR quoi qu'il
   arrive — c'est ce qu'on veut quand on annonce un prix rond au stagiaire (« la pelle, 35 EUR
   pour toi ») plutot qu'une reduction proportionnelle.

   Les deux colonnes coexistent, mais l'ecran n'en laisse remplir qu'une, et le code donne la
   PRIORITE AU MONTANT si les deux se retrouvaient renseignees — un montant est une promesse plus
   concrete qu'un taux, et c'est celle qu'on tiendra.

   NULL des deux cotes = pas de remise, prix catalogue. C'est le defaut. */

ALTER TABLE inventory_item
    ADD COLUMN IF NOT EXISTS learner_discount_pct decimal(5,2) DEFAULT NULL
    COMMENT 'Remise stagiaire en %. NULL ou 0 = aucune. Ignoree si learner_discount_eur est mis.';

ALTER TABLE inventory_item
    ADD COLUMN IF NOT EXISTS learner_discount_eur decimal(10,2) DEFAULT NULL
    COMMENT 'Remise stagiaire en euros HT, par unite. NULL ou 0 = aucune. Prioritaire sur le %.';

/* Le taux applique, fige a la commande — et le prix AVANT remise, pour que la facture puisse
   afficher l economie faite (jetons {Remise} / {Total remise}, cf. migration 122). */
ALTER TABLE shop_request_line
    ADD COLUMN IF NOT EXISTS discount_pct decimal(5,2) DEFAULT NULL
    COMMENT 'Remise stagiaire appliquee a cette ligne, figee a la commande.';

ALTER TABLE shop_request_line
    ADD COLUMN IF NOT EXISTS unit_price_gross_ht decimal(10,2) DEFAULT NULL
    COMMENT 'Prix unitaire HT avant remise stagiaire. Avec unit_price_ht (net), donne l economie.';
