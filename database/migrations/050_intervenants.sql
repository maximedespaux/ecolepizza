-- 050_intervenants.sql
-- Intervenants externes : comptes à part entière (rôle INTERVENANT), réutilisables,
-- affectés à une session pour certaines demi-journées, et signant l'émargement.

-- 1) Nouveau rôle.
ALTER TABLE user MODIFY COLUMN role
    enum('PLATFORM_OWNER','SUPER_ADMIN','ADMIN_ORGANISME','SECRETARIAT','FORMATEUR',
         'STAGIAIRE','ENTREPRISE','FINANCEUR','AUDITEUR','INTERVENANT')
    NOT NULL DEFAULT 'SECRETARIAT';

-- 2) Affectation d'un intervenant à une session (spécialité affichée sur l'émargement).
CREATE TABLE IF NOT EXISTS session_intervenant (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         NOT NULL,
    session_id      uuid         NOT NULL,
    user_id         uuid         NOT NULL,
    specialty       varchar(160) DEFAULT NULL,          -- ex. « Expert hygiène HACCP »
    created_at      timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    UNIQUE KEY uq_session_interv (session_id, user_id),
    KEY idx_si_org (organization_id),
    CONSTRAINT fk_si_org     FOREIGN KEY (organization_id) REFERENCES organization (id) ON DELETE CASCADE,
    CONSTRAINT fk_si_session FOREIGN KEY (session_id)      REFERENCES training_session (id) ON DELETE CASCADE,
    CONSTRAINT fk_si_user    FOREIGN KEY (user_id)         REFERENCES user (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 3) Demi-journées effectivement assurées par l'intervenant (journée = 2 lignes).
CREATE TABLE IF NOT EXISTS session_intervenant_slot (
    id                     uuid NOT NULL DEFAULT uuid(),
    session_intervenant_id uuid NOT NULL,
    date                   date NOT NULL,
    slot                   enum('MATIN','APRES_MIDI','EXAMEN','DISTANCIEL') NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sis (session_intervenant_id, date, slot),
    KEY idx_sis_parent (session_intervenant_id),
    CONSTRAINT fk_sis_parent FOREIGN KEY (session_intervenant_id)
        REFERENCES session_intervenant (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
