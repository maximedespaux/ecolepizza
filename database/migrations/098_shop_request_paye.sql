-- 098_shop_request_paye.sql
-- Ajoute l'étape « PAYE » (payé) au parcours d'une demande boutique et réordonne le
-- flux : Reçue → En préparation → Prête → Payé → Facturé → Remis (REMISE relibellé
-- « Remis » côté interface, sa valeur en base ne change pas).
ALTER TABLE shop_request
    MODIFY status ENUM('NOUVELLE','EN_PREPARATION','PRETE','PAYE','FACTUREE','REMISE','ANNULEE')
        NOT NULL DEFAULT 'NOUVELLE';
