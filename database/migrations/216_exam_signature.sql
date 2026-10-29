/*
 * LES SIGNATURES DU PROCÈS-VERBAL DE JURY (demandé le 2026-10-29) — une par signataire.
 *
 * POURQUOI UNE TABLE. Le procès-verbal n'est PAS un document du dossier : il se rend à la demande
 * depuis les données figées de la commission (cf. examen.controller), donc il n'a pas de ligne dans
 * `generated_document` où poser une signature. On stocke donc ses signatures à part : une ligne par
 * signataire — membre de la commission OU candidat —, qui porte l'image manuscrite (chiffrée au
 * repos, comme les pièces et les photos de la Communauté), le nom figé au moment de signer, et les
 * traces de preuve (IP, appareil, empreinte du PV signé). Le rendu du PV (tranche suivante) ira
 * chercher ces images pour les poser dans ses cases ; ici on ne fait que les RECEVOIR.
 *
 * `signer_kind` + `signer_ref` : 'MEMBRE' → le compte (user_id) du membre choisi dans le registre ;
 * 'CANDIDAT' → le stagiaire (learner_id). La clé UNIQUE (session, nature, référence) garantit une
 * seule signature par signataire — un lien de signature rejoué est refusé par la base.
 *
 * Le code marche AVANT comme APRÈS : sans cette table, la signature du PV répond « migration 216 non
 * jouée » (503) et le reste de la commission fonctionne. ON DELETE CASCADE : les signatures suivent
 * leur commission si elle est supprimée. Collation utf8mb4_general_ci, celle d'`exam_session` (100),
 * sinon la clé étrangère est refusée.
 */
CREATE TABLE IF NOT EXISTS exam_signature (
    id                uuid         NOT NULL DEFAULT uuid(),
    organization_id   uuid         NOT NULL,
    exam_session_id   uuid         NOT NULL,
    signer_kind       varchar(10)  NOT NULL,       /* MEMBRE | CANDIDAT */
    signer_ref        uuid         NOT NULL,        /* user_id (membre) ou learner_id (candidat) */
    signer_name       varchar(200) DEFAULT NULL,    /* instantané du nom au moment de signer */
    signature         longtext     NOT NULL,        /* image data-URL, CHIFFRÉE au repos (AES-256-GCM) */
    signer_ip         varchar(45)  DEFAULT NULL,
    signer_user_agent varchar(400) DEFAULT NULL,
    signed_hash       varchar(64)  DEFAULT NULL,     /* empreinte SHA-256 du PV au moment de la signature */
    signed_at         datetime     NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    UNIQUE KEY uq_exam_signer (exam_session_id, signer_kind, signer_ref),
    KEY idx_examsig_session (exam_session_id),
    CONSTRAINT fk_examsig_session FOREIGN KEY (exam_session_id)
        REFERENCES exam_session (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
