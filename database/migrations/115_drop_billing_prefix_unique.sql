/* 115_drop_billing_prefix_unique.sql
   Le préfixe de numéro n'est plus une donnée à part.

   POURQUOI. Le format de numéro (114) englobe le préfixe : on l'écrit dans le gabarit, en toutes
   lettres — « TXT.{YYYY}.{SEQ} » plutôt qu'un champ « préfixe » séparé plus {PREFIX}. Le champ
   faisait donc double emploi, et sa contrainte d'unicité gênait : sans champ à remplir, toutes
   les entités retombaient sur le même préfixe par défaut, et la deuxième création se heurtait à
   uq_billing_prefix.

   On retire donc l'unicité du préfixe. LE GARDE-FOU CONTRE LES DOUBLONS DE NUMÉRO RESTE ENTIER :
   c'est uq_invoice_number, sur le numéro de facture lui-même, qui refuse deux fois la même
   valeur — la vraie règle, celle qui compte. L'unicité du préfixe n'en était qu'un proxy, devenu
   inutile.

   La colonne invoice_prefix SUBSISTE (défaut 'F') : le gabarit par défaut {PREFIX}-{YYYY}-{SEQ}
   s'en sert encore, et les formats existants qui référencent {PREFIX} continuent de fonctionner.
   Elle n'est simplement plus éditée ni contrainte.

   Commentaires en blocs : mêmes raisons qu'en 101/102. */

ALTER TABLE billing_profile
    DROP INDEX IF EXISTS uq_billing_prefix;
