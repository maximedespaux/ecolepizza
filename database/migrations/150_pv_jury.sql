/*
 * LE PROCÈS-VERBAL DE JURY — on branche enfin la migration 100.
 *
 * `exam_session` et `exam_result` existent depuis la 100 et n aucun écran, aucune route, aucun
 * contrôleur ne s en sert. Elles ont été écrites en réponse au refus du dossier RNCP n° 21983
 * — « quand on regarde les PV qui sont fournis, on n arrive pas à savoir quelle est la
 * certification qui a été visée » — et elles portent déjà tout ce qui manquait : la
 * certification visée, le numéro de PV, le centre, la voie d accès et le jury nommément.
 *
 * ON NE CRÉE DONC PAS UNE TABLE DE PLUS. Le PV de l organisme demande quatre choses que la 100
 * n avait pas prévues, et c est tout ce qu ajoute ce fichier :
 *   · l HEURE de la commission — « le vendredi 3 juillet 2026 à 9 h 30 » ; une date seule ne
 *     dit pas quand la commission s est tenue, et deux commissions peuvent siéger le même jour ;
 *   · le REPRÉSENTANT de l organisme certificateur, présent et nommé sur le PV, avec sa
 *     fonction. Ce n est pas un membre du jury : il ne délibère pas, il atteste ;
 *   · les ALÉAS ET DYSFONCTIONNEMENTS, section à part entière du PV. Vide la plupart du temps,
 *     et c est précisément ce qui donne du poids aux fois où elle ne l est pas ;
 *   · le lien vers la SESSION DE FORMATION dont le jury évalue les stagiaires — la 100 l avait
 *     prévu (`training_session_id`), on s en sert.
 *
 * LES CREATE TABLE SONT REPRIS DE LA 100, en IF NOT EXISTS. Ils ne font rien si elle a été
 * jouée — c est le cas sur la base de production — et rendent ce fichier autonome si elle ne
 * l avait pas été, plutôt que d échouer sur un ALTER d une table absente.
 */

CREATE TABLE IF NOT EXISTS exam_session (
    id                  uuid         NOT NULL DEFAULT uuid(),
    organization_id     uuid         NOT NULL,
    training_session_id uuid         DEFAULT NULL,
    certification       varchar(160) NOT NULL DEFAULT 'Artisan pizzaïolo',
    rncp_code           varchar(20)  DEFAULT NULL,
    voie_acces          enum('FORMATION_CONTINUE','CANDIDATURE_INDIVIDUELLE','VAE')
                        NOT NULL DEFAULT 'FORMATION_CONTINUE',
    pv_ref              varchar(32)  NOT NULL,
    date_examen         date         NOT NULL,
    lieu                varchar(200) NOT NULL,
    centre              varchar(200) NOT NULL,
    jury                JSON         DEFAULT NULL,
    status              enum('OUVERTE','CLOTUREE','ANNULEE') NOT NULL DEFAULT 'OUVERTE',
    annulation_motif    varchar(500) DEFAULT NULL,
    cloture_at          timestamp    NULL DEFAULT NULL,
    created_at          timestamp    NOT NULL DEFAULT current_timestamp(),
    updated_at          timestamp    NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
    PRIMARY KEY (id),
    UNIQUE KEY uq_exam_pv (organization_id, pv_ref),
    KEY idx_exam_org_date (organization_id, date_examen),
    KEY idx_exam_training (training_session_id),
    CONSTRAINT fk_exam_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE,
    CONSTRAINT fk_exam_training FOREIGN KEY (training_session_id)
        REFERENCES training_session (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS exam_result (
    id              uuid      NOT NULL DEFAULT uuid(),
    exam_session_id uuid      NOT NULL,
    learner_id      uuid      NOT NULL,
    blocs_presentes JSON      DEFAULT NULL,
    scores          JSON      DEFAULT NULL,
    elims           JSON      DEFAULT NULL,
    verdicts        JSON      DEFAULT NULL,
    decision        enum('EN_COURS','CERTIFIE','BLOCS_ACQUIS','AJOURNE','ABSENT','EXCLU')
                    NOT NULL DEFAULT 'EN_COURS',
    observations    varchar(1000) DEFAULT NULL,
    created_at      timestamp NOT NULL DEFAULT current_timestamp(),
    updated_at      timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
    PRIMARY KEY (id),
    UNIQUE KEY uq_exres_cand (exam_session_id, learner_id),
    KEY idx_exres_learner (learner_id),
    CONSTRAINT fk_exres_session FOREIGN KEY (exam_session_id)
        REFERENCES exam_session (id) ON DELETE CASCADE,
    CONSTRAINT fk_exres_learner FOREIGN KEY (learner_id)
        REFERENCES learner (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

/* ── Ce que le PV de l organisme demande en plus ─────────────────────────────────────────── */

ALTER TABLE exam_session
    ADD COLUMN IF NOT EXISTS heure varchar(10) DEFAULT NULL AFTER date_examen;

/* Le représentant de l organisme certificateur : présent, nommé, avec sa fonction. Il ne
   délibère pas — il atteste. Le confondre avec un membre du jury fausserait le décompte de la
   majorité extérieure, qui est une condition de validité de la session. */
ALTER TABLE exam_session
    ADD COLUMN IF NOT EXISTS representant varchar(200) DEFAULT NULL AFTER jury;
ALTER TABLE exam_session
    ADD COLUMN IF NOT EXISTS representant_fonction varchar(160) DEFAULT NULL AFTER representant;

/* Section à part entière du PV. Vide la plupart du temps — et c est justement ce qui donne du
   poids aux fois où elle ne l est pas. */
ALTER TABLE exam_session
    ADD COLUMN IF NOT EXISTS aleas varchar(2000) DEFAULT NULL AFTER representant_fonction;
