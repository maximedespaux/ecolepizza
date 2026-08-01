/* 124_revert_shop_request_facturation.sql
   Retire les quatre colonnes ajoutees par la 124.

   LA 124 A ETE RETIREE. Elle stockait sur `shop_request` le destinataire de la facture choisi par
   le STAGIAIRE a la commande (`bill_to`, `company_id`), plus l'entite emettrice et le modele.
   Le choix a ete redonne a l'ECOLE, qui le fait a l'emission : elle seule connait l'accord de
   prise en charge avec l'employeur, et elle devait de toute facon reverifier derriere le
   stagiaire. Ses choix partent desormais directement dans la requete de facturation et
   atterrissent sur la FACTURE — plus rien n'a besoin d'etre conserve sur la demande.

   Le fichier ALLER a ete supprime : cette migration ne doit plus etre jouee nulle part. Ce
   revert-ci ne subsiste que pour les bases ou elle L'A DEJA ETE.

   AUCUNE PERTE DE DONNEE UTILE : plus aucun code ne lit ni n'ecrit ces colonnes. Les factures
   deja emises ne bougent pas — l'acheteur y est ecrit, il ne se recalcule pas.

   Sans risque a ne PAS jouer : quatre colonnes inertes, toutes avec une valeur par defaut. Le
   seul cout est de laisser dans le schema des colonnes qui semblent porter du sens alors que
   rien ne les alimente — ce qui trompera le prochain qui lira la table. */

ALTER TABLE shop_request
    DROP COLUMN IF EXISTS bill_to;

ALTER TABLE shop_request
    DROP COLUMN IF EXISTS company_id;

ALTER TABLE shop_request
    DROP COLUMN IF EXISTS billing_profile_id;

ALTER TABLE shop_request
    DROP COLUMN IF EXISTS template_slug;
