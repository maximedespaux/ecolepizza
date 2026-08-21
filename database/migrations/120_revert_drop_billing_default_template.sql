/* 120_revert_drop_billing_default_template.sql
   Retour arriere de 120 : on RECREE la colonne default_template_slug (vide). A ne jouer qu'en
   revenant aussi sur le code qui l'utilisait. */

ALTER TABLE billing_profile
    ADD COLUMN IF NOT EXISTS default_template_slug varchar(120) DEFAULT NULL
    COMMENT 'Ancien : modele de facture propre a l entite. Remplace par document_template.buyer_audience.';
