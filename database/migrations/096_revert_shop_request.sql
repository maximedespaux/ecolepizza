-- 096_revert_shop_request.sql
-- Annule 096_shop_request.sql.
-- ⚠️ Détruit TOUTES les demandes de la boutique et leurs lignes. Les factures déjà émises
-- (table `invoice`) survivent : elles ne dépendent pas de cette table, c'est la demande qui
-- pointait vers la facture, pas l'inverse. On perd en revanche le lien demande ↔ facture.
DROP TABLE IF EXISTS shop_request_line;
DROP TABLE IF EXISTS shop_request;
