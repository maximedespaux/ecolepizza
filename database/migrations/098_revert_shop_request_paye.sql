-- Revert 098_shop_request_paye.sql
-- Repli : ramène les demandes « PAYE » à « PRETE » avant de retirer la valeur de l'ENUM.
UPDATE shop_request SET status = 'PRETE' WHERE status = 'PAYE';
ALTER TABLE shop_request
    MODIFY status ENUM('NOUVELLE','EN_PREPARATION','PRETE','REMISE','FACTUREE','ANNULEE')
        NOT NULL DEFAULT 'NOUVELLE';
