/* 120_drop_billing_default_template.sql
   Retrait de billing_profile.default_template_slug.

   POURQUOI. On avait attache le modele de facture a l'entite emettrice (chaque vendeur son
   modele). Ce n'est plus le bon axe : ce qui fait varier la facture, c'est QUI achete
   (particulier ou entreprise), pas sous quelle identite on emet. Le choix du modele passe
   desormais par document_template.buyer_audience (migration 119). Cette colonne-ci n'a plus
   d'emploi ; le code ne la lit ni ne l'ecrit plus. On la retire pour ne pas laisser un reglage
   mort que quelqu'un croirait actif.

   Sans risque pour les factures emises : elles figent deja leur presentation dans le PDF. */

ALTER TABLE billing_profile
    DROP COLUMN IF EXISTS default_template_slug;
