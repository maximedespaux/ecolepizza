-- ============================================================================
--  gds_doc_gestionary — schéma MySQL / MariaDB
--  École Pizzaïolo Jean-Jacques Despaux
--
--  Aligné sur la fondation Prisma du projet ecolepizza, MAIS volontairement
--  simplifié : on retire tout ce qui relève des jetons / secrets / traçabilité
--  lourde (NextAuth Account/Session/VerificationToken, ApiKey, WebhookEvent,
--  OTP & hash de signature, colonnes JSON de preuve).
--
--  Convention : snake_case, type `uuid` (DEFAULT uuid()), enums MySQL,
--  contraintes en ligne, utf8mb4.
--
--  Import :  mysql -u root -p < database/schema.sql
-- ============================================================================

CREATE DATABASE IF NOT EXISTS gds_doc_gestionary
    CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE gds_doc_gestionary;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS inventory_item;
DROP TABLE IF EXISTS material_sale;
DROP TABLE IF EXISTS partner_contract;
DROP TABLE IF EXISTS partner;
DROP TABLE IF EXISTS notification;
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS qualiopi_evidence;
DROP TABLE IF EXISTS evaluation;
DROP TABLE IF EXISTS payment;
DROP TABLE IF EXISTS invoice;
DROP TABLE IF EXISTS attendance_record;
DROP TABLE IF EXISTS attendance_sheet;
DROP TABLE IF EXISTS signature_recipient;
DROP TABLE IF EXISTS signature_request;
DROP TABLE IF EXISTS document_formation;
DROP TABLE IF EXISTS generated_document;
DROP TABLE IF EXISTS document_template;
DROP TABLE IF EXISTS enrollment_note;
DROP TABLE IF EXISTS enrollment;
DROP TABLE IF EXISTS training_session;
DROP TABLE IF EXISTS training_program;
DROP TABLE IF EXISTS learner;
DROP TABLE IF EXISTS company;
DROP TABLE IF EXISTS user;
DROP TABLE IF EXISTS organization;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------------
-- Organisme de formation (multi-organisme)
-- ---------------------------------------------------------------------------
CREATE TABLE organization (
    id          uuid         NOT NULL DEFAULT uuid(),
    legal_name  varchar(255) NOT NULL,
    short_name  varchar(120) DEFAULT NULL,
    manager     varchar(255) DEFAULT NULL,
    siret       varchar(20)  DEFAULT NULL,
    vat_number  varchar(30)  DEFAULT NULL,          -- n° TVA intracommunautaire
    nda         varchar(20)  DEFAULT NULL,          -- n° de déclaration d'activité
    naf_ape     varchar(10)  DEFAULT NULL,
    address     varchar(255) DEFAULT NULL,
    zip_code    varchar(10)  DEFAULT NULL,
    town        varchar(120) DEFAULT NULL,
    phone       varchar(30)  DEFAULT NULL,
    email       varchar(255) DEFAULT NULL,
    qualiopi    tinyint(1)   NOT NULL DEFAULT 0,
    created_at  timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------------------------
-- Utilisateurs (secrétariat, formateur, stagiaire, entreprise, financeur…)
-- ---------------------------------------------------------------------------
CREATE TABLE user (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         DEFAULT NULL,
    role            enum('SUPER_ADMIN','ADMIN_ORGANISME','SECRETARIAT','FORMATEUR',
                         'STAGIAIRE','ENTREPRISE','FINANCEUR','AUDITEUR')
                    NOT NULL DEFAULT 'SECRETARIAT',
    first_name      varchar(120) DEFAULT NULL,
    last_name       varchar(120) DEFAULT NULL,
    email           varchar(255) NOT NULL,
    phone           varchar(30)  DEFAULT NULL,
    password        varchar(255) NOT NULL,             -- hash bcrypt (authentification)
    password_plain_enc varchar(255) DEFAULT NULL,      -- DEV UNIQUEMENT : copie chiffrée du mot de passe généré (à retirer)
    created_at      timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    UNIQUE KEY uq_user_email (email),
    KEY idx_user_org (organization_id),
    CONSTRAINT fk_user_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------------------------
-- Entreprises / financeurs (+ représentant pour la convention)
-- ---------------------------------------------------------------------------
CREATE TABLE company (
    id                  uuid         NOT NULL DEFAULT uuid(),
    organization_id     uuid         NOT NULL,
    name                varchar(255) NOT NULL,
    siret               varchar(20)  DEFAULT NULL,
    naf_ape             varchar(10)  DEFAULT NULL,
    address             varchar(255) DEFAULT NULL,
    zip_code            varchar(10)  DEFAULT NULL,
    town                varchar(120) DEFAULT NULL,
    email               varchar(255) DEFAULT NULL,
    phone               varchar(30)  DEFAULT NULL,
    opco                varchar(120) DEFAULT NULL,
    legal_status        varchar(30)  DEFAULT NULL,       -- SARL, SAS, EI, AUTO…
    representative_civ  varchar(10)  DEFAULT NULL,
    representative_name varchar(255) DEFAULT NULL,
    representative_role varchar(120) DEFAULT NULL,       -- fonction du représentant
    created_at          timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_company_org (organization_id),
    CONSTRAINT fk_company_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------------------------
-- Stagiaires
-- ---------------------------------------------------------------------------
CREATE TABLE learner (
    id                  uuid         NOT NULL DEFAULT uuid(),
    organization_id     uuid         NOT NULL,
    -- Prise de contact (fiche d'expression du stagiaire)
    contacted_at        date         DEFAULT NULL,       -- « Contact le »
    contacted_by        varchar(120) DEFAULT NULL,       -- « Contacté par »
    -- Identité
    civility            varchar(10)  DEFAULT NULL,       -- M. / Mme
    first_name          varchar(120) NOT NULL,
    last_name           varchar(120) NOT NULL,
    email               varchar(255) DEFAULT NULL,
    phone               varchar(30)  DEFAULT NULL,
    birthday            date         DEFAULT NULL,
    birth_place         varchar(120) DEFAULT NULL,       -- lieu de naissance
    address             varchar(255) DEFAULT NULL,
    zip_code            varchar(10)  DEFAULT NULL,
    town                varchar(120) DEFAULT NULL,
    -- Parcours scolaire
    diploma_level       varchar(120) DEFAULT NULL,       -- niveau du diplôme le plus élevé
    diploma_name        varchar(180) DEFAULT NULL,       -- nom du diplôme
    diploma_year        varchar(8)   DEFAULT NULL,       -- année d'obtention
    last_experience     varchar(255) DEFAULT NULL,       -- dernière expérience professionnelle
    experience_value    varchar(20)  DEFAULT NULL,       -- durée : chiffre
    experience_unit     varchar(20)  DEFAULT NULL,       -- durée : mois / année
    -- Statut actuel & financement
    professional_status varchar(120) DEFAULT NULL,       -- « Êtes-vous ? » : en activité, demandeur d'emploi…
    cpf_amount          decimal(10,2) DEFAULT NULL,      -- « Combien de CPF »
    france_travail_id   varchar(60)  DEFAULT NULL,       -- Id France Travail (Pôle emploi)
    current_contract    varchar(60)  DEFAULT NULL,       -- contrat actuel (si en activité)
    social_security     varchar(255) DEFAULT NULL,       -- n° de sécurité sociale (chiffré AES-256-GCM au repos)
    financing           enum('PARTICULIER','PROFESSIONNEL') NOT NULL DEFAULT 'PARTICULIER',
    company_id          uuid         DEFAULT NULL,
    user_id             uuid         DEFAULT NULL,      -- compte de connexion du stagiaire (rôle STAGIAIRE)
    -- Projet (« Votre projet »)
    project_creation    tinyint(1)   NOT NULL DEFAULT 0, -- création
    project_takeover    tinyint(1)   NOT NULL DEFAULT 0, -- reprise
    project_oven        tinyint(1)   NOT NULL DEFAULT 0, -- four
    project_truck       tinyint(1)   NOT NULL DEFAULT 0, -- camion / remorque
    project_job         tinyint(1)   NOT NULL DEFAULT 0, -- cherche poste pizzaïolo(la)
    created_at          timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_learner_org (organization_id),
    CONSTRAINT fk_learner_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE,
    CONSTRAINT fk_learner_company FOREIGN KEY (company_id)
        REFERENCES company (id) ON DELETE SET NULL,
    CONSTRAINT fk_learner_user FOREIGN KEY (user_id)
        REFERENCES user (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------------------------
-- Formations (catalogue)
-- ---------------------------------------------------------------------------
CREATE TABLE training_program (
    id              uuid          NOT NULL DEFAULT uuid(),
    organization_id uuid          NOT NULL,
    code            varchar(40)   NOT NULL,          -- NIV1, NIV1H, RS7404…
    title           varchar(255)  NOT NULL,
    days            int           DEFAULT NULL,
    hours           int           DEFAULT NULL,
    price           decimal(10,2) DEFAULT NULL,
    audience        varchar(255)  DEFAULT NULL,      -- « Public »
    objectives      text          DEFAULT NULL,
    rs_code         varchar(40)   DEFAULT NULL,      -- RS7404 si certifiante
    hygiene         tinyint(1)    NOT NULL DEFAULT 0,
    active          tinyint(1)    NOT NULL DEFAULT 1,
    created_at      timestamp     NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    UNIQUE KEY uq_program_org_code (organization_id, code),
    CONSTRAINT fk_program_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------------------------
-- Sessions de formation
-- ---------------------------------------------------------------------------
CREATE TABLE training_session (
    id              uuid      NOT NULL DEFAULT uuid(),
    organization_id uuid      NOT NULL,
    program_id      uuid      NOT NULL,
    year            int       NOT NULL,
    week            int       NOT NULL,              -- n° de semaine ISO
    start_date      date      DEFAULT NULL,
    end_date        date      DEFAULT NULL,
    trainer         varchar(255) DEFAULT NULL,
    status          enum('PLANIFIEE','CONFIRMEE','EN_COURS','TERMINEE','ANNULEE')
                    NOT NULL DEFAULT 'PLANIFIEE',
    created_at      timestamp NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_session_org (organization_id, year, week),
    CONSTRAINT fk_session_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE,
    CONSTRAINT fk_session_program FOREIGN KEY (program_id)
        REFERENCES training_program (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------------------------
-- Dossiers (inscription stagiaire <-> session)
-- ---------------------------------------------------------------------------
CREATE TABLE enrollment (
    id               uuid      NOT NULL DEFAULT uuid(),
    organization_id  uuid      NOT NULL,
    learner_id       uuid      NOT NULL,
    session_id       uuid      NOT NULL,
    company_id       uuid      DEFAULT NULL,
    financing        enum('PARTICULIER','PROFESSIONNEL') NOT NULL DEFAULT 'PARTICULIER',
    price            decimal(10,2) DEFAULT NULL,
    acompte          decimal(10,2) DEFAULT NULL,
    crm_stage        enum('PROSPECT','CONTACTE','DEVIS_ENVOYE','DEVIS_SIGNE','ACOMPTE_PAYE',
                          'INSCRIT','EN_FORMATION','TERMINE','EVALUATION_ENVOYEE','ARCHIVE')
                     NOT NULL DEFAULT 'PROSPECT',
    conformite_score enum('VERT','ORANGE','ROUGE') NOT NULL DEFAULT 'ROUGE',
    created_at       timestamp NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    UNIQUE KEY uq_enrollment (learner_id, session_id),
    KEY idx_enrollment_org (organization_id),
    KEY idx_enrollment_stage (crm_stage),
    CONSTRAINT fk_enrollment_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE,
    CONSTRAINT fk_enrollment_learner FOREIGN KEY (learner_id)
        REFERENCES learner (id) ON DELETE CASCADE,
    CONSTRAINT fk_enrollment_session FOREIGN KEY (session_id)
        REFERENCES training_session (id) ON DELETE CASCADE,
    CONSTRAINT fk_enrollment_company FOREIGN KEY (company_id)
        REFERENCES company (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Notes de suivi CRM sur un dossier
CREATE TABLE enrollment_note (
    id            uuid      NOT NULL DEFAULT uuid(),
    enrollment_id uuid      NOT NULL,
    author_id     uuid      DEFAULT NULL,
    body          text      NOT NULL,
    reminder_at   datetime  DEFAULT NULL,
    created_at    timestamp NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_note_enrollment (enrollment_id),
    CONSTRAINT fk_note_enrollment FOREIGN KEY (enrollment_id)
        REFERENCES enrollment (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------------------------
-- Modèles de documents (.docx)
-- ---------------------------------------------------------------------------
CREATE TABLE document_template (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         NOT NULL,
    type            enum('PROGRAMME','FICHE_SEMAINE','TEST_POSITIONNEMENT','DEVIS','CONTRAT',
                         'CONVENTION','CONVOCATION','INVITATION','DROIT_IMAGE','EMARGEMENT',
                         'ATTESTATION_HYGIENE','CERTIFICAT_REALISATION','CGV',
                         'EVALUATION_FINANCEUR','EVALUATION_MANAGEUR') NOT NULL,
    name            varchar(255) NOT NULL,            -- ex. « Devis Particulier_.docx »
    version         varchar(20)  NOT NULL DEFAULT '1.0',
    active          tinyint(1)   NOT NULL DEFAULT 1,
    created_at      timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_template_org (organization_id, type),
    CONSTRAINT fk_template_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------------------------
-- Documents générés (DOCX/PDF) d'un dossier
-- ---------------------------------------------------------------------------
CREATE TABLE generated_document (
    id            uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid       NOT NULL,
    learner_id    uuid         DEFAULT NULL,          -- stagiaire propriétaire du document
    enrollment_id uuid         DEFAULT NULL,          -- dossier principal (facultatif : cf. document_formation)
    template_id   uuid         DEFAULT NULL,
    type          enum('PROGRAMME','FICHE_SEMAINE','TEST_POSITIONNEMENT','DEVIS','CONTRAT',
                       'CONVENTION','CONVOCATION','INVITATION','DROIT_IMAGE','EMARGEMENT',
                       'ATTESTATION_HYGIENE','CERTIFICAT_REALISATION','CGV',
                       'EVALUATION_FINANCEUR','EVALUATION_MANAGEUR') NOT NULL,
    title         varchar(255) DEFAULT NULL,
    status        enum('A_FAIRE','GENERE','ENVOYE','CONSULTE','SIGNE','ARCHIVE')
                  NOT NULL DEFAULT 'A_FAIRE',
    number        varchar(20)  DEFAULT NULL,
    file_name     varchar(255) DEFAULT NULL,
    sent_at       datetime     DEFAULT NULL,          -- envoi au stagiaire (demande de signature)
    signed_at     datetime     DEFAULT NULL,          -- horodatage de signature
    signer_name   varchar(255) DEFAULT NULL,          -- nom saisi par le signataire
    signature_data longtext    DEFAULT NULL,          -- image de signature (data URL)
    created_at    timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_doc_org (organization_id, type),
    KEY idx_doc_learner (learner_id),
    CONSTRAINT fk_doc_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE,
    CONSTRAINT fk_doc_learner FOREIGN KEY (learner_id)
        REFERENCES learner (id) ON DELETE CASCADE,
    CONSTRAINT fk_doc_enrollment FOREIGN KEY (enrollment_id)
        REFERENCES enrollment (id) ON DELETE SET NULL,
    CONSTRAINT fk_doc_template FOREIGN KEY (template_id)
        REFERENCES document_template (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Formations couvertes par un document (permet de regrouper plusieurs formations
-- dans un seul document — ex. un devis pour un achat de plusieurs formations).
CREATE TABLE document_formation (
    document_id   uuid NOT NULL,
    enrollment_id uuid NOT NULL,
    PRIMARY KEY (document_id, enrollment_id),
    CONSTRAINT fk_docform_document FOREIGN KEY (document_id)
        REFERENCES generated_document (id) ON DELETE CASCADE,
    CONSTRAINT fk_docform_enrollment FOREIGN KEY (enrollment_id)
        REFERENCES enrollment (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------------------------
-- Demandes de signature (Yousign) — sans jetons/OTP/preuve
-- ---------------------------------------------------------------------------
CREATE TABLE signature_request (
    id              uuid      NOT NULL DEFAULT uuid(),
    organization_id uuid      NOT NULL,
    document_id     uuid      NOT NULL,
    provider        enum('YOUSIGN') NOT NULL DEFAULT 'YOUSIGN',
    level           enum('SIMPLE','AVANCEE','QUALIFIEE') NOT NULL DEFAULT 'SIMPLE',
    auth_mode       enum('OTP_EMAIL','OTP_SMS') NOT NULL DEFAULT 'OTP_EMAIL',
    status          enum('BROUILLON','ENVOYEE','EN_COURS','SIGNEE','REFUSEE','EXPIREE')
                    NOT NULL DEFAULT 'BROUILLON',
    sent_at         datetime  DEFAULT NULL,
    completed_at    datetime  DEFAULT NULL,
    created_at      timestamp NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    UNIQUE KEY uq_signature_document (document_id),
    KEY idx_signature_org (organization_id, status),
    CONSTRAINT fk_signature_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE,
    CONSTRAINT fk_signature_document FOREIGN KEY (document_id)
        REFERENCES generated_document (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE signature_recipient (
    id         uuid         NOT NULL DEFAULT uuid(),
    request_id uuid         NOT NULL,
    role       enum('STAGIAIRE','ENTREPRISE','ORGANISME') NOT NULL,
    name       varchar(255) NOT NULL,
    email      varchar(255) DEFAULT NULL,
    phone      varchar(30)  DEFAULT NULL,
    status     enum('EN_ATTENTE','SIGNE','REFUSE') NOT NULL DEFAULT 'EN_ATTENTE',
    ordre      int          NOT NULL DEFAULT 1,
    signed_at  datetime     DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_recipient_request (request_id),
    CONSTRAINT fk_recipient_request FOREIGN KEY (request_id)
        REFERENCES signature_request (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------------------------
-- Émargement
-- ---------------------------------------------------------------------------
CREATE TABLE attendance_sheet (
    id         uuid      NOT NULL DEFAULT uuid(),
    session_id uuid      NOT NULL,
    date       date      NOT NULL,
    slot       enum('MATIN','APRES_MIDI','EXAMEN','DISTANCIEL') NOT NULL,
    created_at timestamp NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    UNIQUE KEY uq_sheet (session_id, date, slot),
    CONSTRAINT fk_sheet_session FOREIGN KEY (session_id)
        REFERENCES training_session (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE attendance_record (
    id         uuid      NOT NULL DEFAULT uuid(),
    sheet_id   uuid      NOT NULL,
    learner_id uuid      DEFAULT NULL,
    present    tinyint(1) NOT NULL DEFAULT 0,
    signed_at  datetime  DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_record_sheet (sheet_id),
    CONSTRAINT fk_record_sheet FOREIGN KEY (sheet_id)
        REFERENCES attendance_sheet (id) ON DELETE CASCADE,
    CONSTRAINT fk_record_learner FOREIGN KEY (learner_id)
        REFERENCES learner (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------------------------
-- Facturation
-- ---------------------------------------------------------------------------
CREATE TABLE invoice (
    id              uuid          NOT NULL DEFAULT uuid(),
    organization_id uuid          NOT NULL,
    enrollment_id   uuid          DEFAULT NULL,
    company_id      uuid          DEFAULT NULL,
    buyer_name      varchar(255)  DEFAULT NULL,      -- acheteur libre (vente comptoir)
    description     varchar(255)  DEFAULT NULL,      -- libellé de la ligne (produits vendus)
    type            enum('DEVIS','ACOMPTE','FACTURE','AVOIR') NOT NULL,
    number          varchar(40)   NOT NULL,
    amount_net      decimal(10,2) NOT NULL,
    tva_exoneree    tinyint(1)    NOT NULL DEFAULT 1,     -- art. 261-4-4° du CGI
    status          enum('BROUILLON','EMISE','PAYEE','IMPAYEE','ANNULEE')
                    NOT NULL DEFAULT 'BROUILLON',
    due_date        date          DEFAULT NULL,
    created_at      timestamp     NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    UNIQUE KEY uq_invoice_number (number),
    KEY idx_invoice_org (organization_id, status),
    CONSTRAINT fk_invoice_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE,
    CONSTRAINT fk_invoice_enrollment FOREIGN KEY (enrollment_id)
        REFERENCES enrollment (id) ON DELETE SET NULL,
    CONSTRAINT fk_invoice_company FOREIGN KEY (company_id)
        REFERENCES company (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE payment (
    id         uuid          NOT NULL DEFAULT uuid(),
    invoice_id uuid          NOT NULL,
    provider   varchar(40)   NOT NULL DEFAULT 'stripe',
    amount     decimal(10,2) NOT NULL,
    status     enum('EN_ATTENTE','REUSSI','ECHOUE','REMBOURSE') NOT NULL DEFAULT 'EN_ATTENTE',
    paid_at    datetime      DEFAULT NULL,
    created_at timestamp     NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_payment_invoice (invoice_id),
    CONSTRAINT fk_payment_invoice FOREIGN KEY (invoice_id)
        REFERENCES invoice (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------------------------
-- Évaluations (positionnement, satisfaction, financeur, manageur…)
-- ---------------------------------------------------------------------------
CREATE TABLE evaluation (
    id            uuid      NOT NULL DEFAULT uuid(),
    organization_id uuid    NOT NULL,
    enrollment_id uuid      NOT NULL,
    type          enum('POSITIONNEMENT','FORMATIVE','SATISFACTION_CHAUD','SATISFACTION_FROID',
                       'FINANCEUR','MANAGEUR') NOT NULL,
    score         float     DEFAULT NULL,
    submitted_at  datetime  DEFAULT NULL,
    created_at    timestamp NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_eval_enrollment (enrollment_id, type),
    CONSTRAINT fk_eval_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE,
    CONSTRAINT fk_eval_enrollment FOREIGN KEY (enrollment_id)
        REFERENCES enrollment (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------------------------
-- Preuves Qualiopi
-- ---------------------------------------------------------------------------
CREATE TABLE qualiopi_evidence (
    id            uuid         NOT NULL DEFAULT uuid(),
    session_id    uuid         DEFAULT NULL,
    enrollment_id uuid         DEFAULT NULL,
    indicator     varchar(255) NOT NULL,            -- « Programme transmis », « Émargement »…
    status        enum('MANQUANT','PRESENT','NON_APPLICABLE') NOT NULL DEFAULT 'MANQUANT',
    note          varchar(255) DEFAULT NULL,
    created_at    timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_qualiopi_session (session_id),
    CONSTRAINT fk_qualiopi_session FOREIGN KEY (session_id)
        REFERENCES training_session (id) ON DELETE CASCADE,
    CONSTRAINT fk_qualiopi_enrollment FOREIGN KEY (enrollment_id)
        REFERENCES enrollment (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------------------------
-- Journal d'audit (simple : action + entité, sans chaîne de hash)
-- ---------------------------------------------------------------------------
CREATE TABLE audit_log (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         DEFAULT NULL,
    user_id         uuid         DEFAULT NULL,
    action          varchar(120) NOT NULL,          -- ex. « document.generate »
    entity          varchar(120) DEFAULT NULL,
    entity_id       uuid         DEFAULT NULL,
    created_at      timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_audit_org (organization_id, entity),
    KEY idx_audit_date (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
CREATE TABLE notification (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         NOT NULL,
    user_id         uuid         DEFAULT NULL,
    type            enum('INFO','RELANCE','SIGNATURE','PAIEMENT','QUALIOPI','SYSTEME')
                    NOT NULL DEFAULT 'INFO',
    title           varchar(255) NOT NULL,
    body            varchar(255) DEFAULT NULL,
    is_read         tinyint(1)   NOT NULL DEFAULT 0,
    created_at      timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_notif_user (user_id, is_read),
    CONSTRAINT fk_notif_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------------------------
-- Partenaires + contrats de partenariat
-- ---------------------------------------------------------------------------
CREATE TABLE partner (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         NOT NULL,
    name            varchar(255) NOT NULL,
    category        enum('FARINE','MATERIEL','FOUR','CHARCUTERIE','FROMAGE','CONSERVE',
                         'DISTRIBUTION','AUTRE') NOT NULL DEFAULT 'AUTRE',
    contact_name    varchar(255) DEFAULT NULL,
    contact_email   varchar(255) DEFAULT NULL,
    contact_phone   varchar(30)  DEFAULT NULL,
    website         varchar(255) DEFAULT NULL,
    town            varchar(120) DEFAULT NULL,
    discount_pct    float        DEFAULT NULL,
    created_at      timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_partner_org (organization_id, category),
    CONSTRAINT fk_partner_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE partner_contract (
    id         uuid          NOT NULL DEFAULT uuid(),
    partner_id uuid          NOT NULL,
    title      varchar(255)  NOT NULL,
    status     enum('PROSPECT','EN_NEGOCIATION','ACTIF','EXPIRE','RESILIE')
               NOT NULL DEFAULT 'PROSPECT',
    start_date date          DEFAULT NULL,
    end_date   date          DEFAULT NULL,
    amount     decimal(10,2) DEFAULT NULL,
    signed     tinyint(1)    NOT NULL DEFAULT 0,
    created_at timestamp     NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_contract_partner (partner_id, status),
    CONSTRAINT fk_contract_partner FOREIGN KEY (partner_id)
        REFERENCES partner (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------------------------
-- Ventes de matériel (saisie manuelle du secrétariat)
-- ---------------------------------------------------------------------------
CREATE TABLE material_sale (
    id              uuid          NOT NULL DEFAULT uuid(),
    organization_id uuid          NOT NULL,
    date            date          NOT NULL DEFAULT current_timestamp(),
    product         varchar(255)  NOT NULL,
    category        varchar(120)  DEFAULT NULL,     -- Four, Pétrin, Matière première, Accessoire…
    quantity        int           NOT NULL DEFAULT 1,
    amount          decimal(10,2) NOT NULL,
    learner_id      uuid          DEFAULT NULL,
    note            varchar(255)  DEFAULT NULL,
    created_at      timestamp     NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_sale_org (organization_id),
    CONSTRAINT fk_sale_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE,
    CONSTRAINT fk_sale_learner FOREIGN KEY (learner_id)
        REFERENCES learner (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------------------------
-- Inventaire (stock de matériel à vendre)
-- ---------------------------------------------------------------------------
CREATE TABLE inventory_item (
    id              uuid          NOT NULL DEFAULT uuid(),
    organization_id uuid          NOT NULL,
    name            varchar(255)  NOT NULL,
    category        varchar(120)  DEFAULT NULL,
    sku             varchar(60)   DEFAULT NULL,
    quantity        int           NOT NULL DEFAULT 0,
    unit_price      decimal(10,2) DEFAULT NULL,          -- prix HT
    tax_rate        decimal(5,2)  NOT NULL DEFAULT 20.00, -- taux de TVA (%)
    threshold       int           NOT NULL DEFAULT 0,
    created_at      timestamp     NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_inventory_org (organization_id),
    CONSTRAINT fk_inventory_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
