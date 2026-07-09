-- 046_encrypt_widen.sql
-- Les données de traçabilité (IP, appareil) sont désormais CHIFFRÉES au repos ;
-- la valeur chiffrée est plus longue que l'originale → on élargit les colonnes.
ALTER TABLE generated_document
    MODIFY COLUMN signer_ip varchar(255) DEFAULT NULL,
    MODIFY COLUMN signer_user_agent text DEFAULT NULL;

ALTER TABLE attendance_record
    MODIFY COLUMN signer_ip varchar(255) DEFAULT NULL,
    MODIFY COLUMN signer_user_agent text DEFAULT NULL;
