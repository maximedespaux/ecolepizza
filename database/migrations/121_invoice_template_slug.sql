/* 121_invoice_template_slug.sql
   Le modele de facture CHOISI A LA VENTE, fige sur la facture.

   POURQUOI. On departageait le modele de facture par le DESTINATAIRE (buyer_audience, 119). Le
   vendeur prefere finalement CHOISIR explicitement le modele au moment d'encaisser (« quel type
   de facture ? »), dans le panier. Le choix est donc fige sur la facture elle-meme : deux ventes
   du meme jour peuvent sortir sous deux modeles differents, et une facture emise garde le sien.

   NULL = aucun modele designe a la vente (facture manuelle, ancienne vente) : le rendu retombe
   alors sur la selection automatique (buyer_audience, puis modele unique). La colonne est
   optionnelle partout : sans cette migration, la vente sort comme avant. Blocs : cf. 101/102. */

ALTER TABLE invoice
    ADD COLUMN IF NOT EXISTS template_slug varchar(120) DEFAULT NULL
    COMMENT 'Modele de facture choisi a la vente (slug document_template). NULL = auto.';
