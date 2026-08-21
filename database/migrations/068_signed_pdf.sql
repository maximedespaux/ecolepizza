-- 068_signed_pdf.sql
-- Deux signatures cryptographiques par document (stagiaire PUIS organisme).
--   · learner.sign_cert : certificat P12 auto-signé du stagiaire (chiffré au repos),
--     généré à sa 1re signature — comme organization.sign_cert pour l'organisme.
--   · document_signed_pdf : PDF final SIGNÉ « figé ». Une fois signé, le PDF ne doit
--     plus être régénéré (toute régénération invalide les signatures) : on stocke les
--     octets signés (chiffrés) et on les sert tels quels au téléchargement.
ALTER TABLE learner
    ADD COLUMN IF NOT EXISTS sign_cert LONGTEXT NULL DEFAULT NULL;

CREATE TABLE IF NOT EXISTS document_signed_pdf (
    document_id     CHAR(36)  NOT NULL PRIMARY KEY,   -- generated_document.id
    organization_id CHAR(36)  NOT NULL,
    pdf             LONGTEXT  NOT NULL,               -- PDF signé (base64, chiffré au repos)
    signer_count    INT       NOT NULL DEFAULT 1,     -- nb de signatures cryptographiques
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_signed_pdf_org (organization_id)
);
