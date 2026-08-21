-- 032_invoice_line.sql
-- Lignes de facture : une facture peut couvrir plusieurs dossiers / formations
-- (ex. même entreprise, stagiaires sur des formations différentes).
-- Le total invoice.amount_net = somme des lignes.
CREATE TABLE IF NOT EXISTS invoice_line (
    id            uuid          NOT NULL DEFAULT uuid(),
    invoice_id    uuid          NOT NULL,
    enrollment_id uuid          DEFAULT NULL,
    description   varchar(255)  DEFAULT NULL,
    amount_net    decimal(10,2) NOT NULL DEFAULT 0.00,
    sort_order    int           NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_iline_invoice (invoice_id),
    CONSTRAINT fk_iline_invoice    FOREIGN KEY (invoice_id)    REFERENCES invoice (id) ON DELETE CASCADE,
    CONSTRAINT fk_iline_enrollment FOREIGN KEY (enrollment_id) REFERENCES enrollment (id) ON DELETE SET NULL
);
