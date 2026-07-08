-- 031_attendance_trainer_sign.sql
-- Signature d'émargement PAR FORMATEUR et par demi-journée : chaque formateur
-- affecté à la session signe sa propre ligne (remplace la signature unique de feuille).
CREATE TABLE IF NOT EXISTS attendance_trainer_sign (
    id             uuid      NOT NULL DEFAULT uuid(),
    sheet_id       uuid      NOT NULL,
    user_id        uuid      NOT NULL,
    signer_name    varchar(255) DEFAULT NULL,
    signature_data longtext     DEFAULT NULL,
    signed_at      datetime     DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_ats (sheet_id, user_id),
    KEY idx_ats_sheet (sheet_id),
    CONSTRAINT fk_ats_sheet FOREIGN KEY (sheet_id) REFERENCES attendance_sheet (id) ON DELETE CASCADE,
    CONSTRAINT fk_ats_user  FOREIGN KEY (user_id)  REFERENCES user (id) ON DELETE CASCADE
);
