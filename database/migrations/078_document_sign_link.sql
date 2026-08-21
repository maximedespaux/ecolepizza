-- 078_document_sign_link.sql
-- Lien de signature PARTAGEABLE (sans compte) : permet à un signataire externe — typiquement
-- le représentant d'une entreprise — d'ouvrir un document et de signer un « créneau »
-- (document_signature.slot). Un jeton aléatoire, une échéance, à usage unique.
-- NB : document_id est de type `uuid` (comme generated_document.id) — indispensable pour la
-- clé étrangère (un CHAR(36) provoquerait errno 150 « Foreign key incorrectly formed »).
CREATE TABLE IF NOT EXISTS document_sign_link (
    token           VARCHAR(64)  NOT NULL PRIMARY KEY,
    organization_id uuid         NOT NULL,
    document_id     uuid         NOT NULL,
    slot            VARCHAR(60)  NOT NULL DEFAULT 'representant',
    label           VARCHAR(120) NULL,
    expires_at      DATETIME     NULL,
    used_at         DATETIME     NULL,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_signlink_document FOREIGN KEY (document_id) REFERENCES generated_document (id) ON DELETE CASCADE,
    INDEX idx_signlink_document (document_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
