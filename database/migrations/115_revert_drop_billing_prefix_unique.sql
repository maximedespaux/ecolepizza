/* 115_revert_drop_billing_prefix_unique.sql
   Retour arriere de 115 : retablit l'unicite du prefixe par entite.

   ATTENTION : cette contrainte ECHOUERA si plusieurs entites partagent deja un prefixe (ce que
   115 rendait possible). Il faut d'abord leur donner des prefixes distincts, sinon l'ajout de
   l'index est rejete. A ne jouer qu'avec le code d'avant, qui gerait le prefixe comme un champ. */

ALTER TABLE billing_profile
    ADD UNIQUE KEY uq_billing_prefix (organization_id, invoice_prefix);
