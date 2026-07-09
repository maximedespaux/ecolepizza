-- 046_encrypt_widen.sql
-- Les données de traçabilité (IP, appareil) sont désormais CHIFFRÉES au repos ;
-- la valeur chiffrée est plus longue que l'originale → on élargit les colonnes.
-- NB : on utilise varchar(1000) (et non TEXT) car MySQL interdit DEFAULT NULL
--      sur une colonne TEXT ; varchar(1000) suffit largement au chiffré (~600 car.).
ALTER TABLE generated_document
    MODIFY COLUMN signer_ip varchar(255) DEFAULT NULL,
    MODIFY COLUMN signer_user_agent varchar(1000) DEFAULT NULL;

ALTER TABLE attendance_record
    MODIFY COLUMN signer_ip varchar(255) DEFAULT NULL,
    MODIFY COLUMN signer_user_agent varchar(1000) DEFAULT NULL;
