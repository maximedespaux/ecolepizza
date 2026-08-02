/* 116_invoice_payment_split.sql
   Une facture peut etre reglee en PLUSIEURS moyens de paiement.

   POURQUOI. La caisse ne retenait qu'UN moyen de paiement par vente. En pratique un client
   regle souvent en partie especes, le reste en carte : « 1000 = 300 especes + 700 carte ». Le
   detail compte pour le rapprochement de caisse (combien d'especes, combien de carte).

   `payment_split` porte la ventilation en JSON : [{"method":"Especes","amount":300},
   {"method":"CB","amount":700}]. La colonne `payment_method` existante GARDE un resume court
   (le 1er moyen, ou « Reparti ») pour les affichages deja en place. Le montant TOTAL de la
   facture ne bouge pas : la ventilation ne fait que dire COMMENT il a ete regle, pas COMBIEN.

   NULL = paiement simple (un seul moyen, dans payment_method) ou vente impayee — rien ne change
   tant que cette migration n'est pas jouee, ni pour les factures deja emises.

   Commentaires en blocs : memes raisons qu'en 101/102. */

ALTER TABLE invoice
    ADD COLUMN IF NOT EXISTS payment_split text DEFAULT NULL
    COMMENT 'Ventilation du reglement en JSON [{method, amount}]. NULL = paiement simple.';
