/* 119_revert_document_template_buyer_audience.sql
   Retour arriere de 119. Le destinataire par modele est DETRUIT : tous les modeles FACTURE
   redeviennent indistincts (selection par l'unique modele). A ne jouer qu'en revenant aussi
   sur le code. */

ALTER TABLE document_template
    DROP COLUMN IF EXISTS buyer_audience;
