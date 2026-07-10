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
    code        varchar(24)  DEFAULT NULL,          -- code court unique (saisi à la connexion, multi-tenant)
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
    iban        varchar(34)  DEFAULT NULL,          -- RIB : IBAN
    bic         varchar(11)  DEFAULT NULL,          -- RIB : BIC / SWIFT
    bank_name   varchar(120) DEFAULT NULL,          -- RIB : domiciliation bancaire
    signature_image longtext  DEFAULT NULL,          -- signature de l'organisme (data URL) pour les documents
    sign_cert   longtext     DEFAULT NULL,          -- certificat PAdES de scellement (PKCS#12 chiffré, base64)
    qualiopi    tinyint(1)   NOT NULL DEFAULT 0,
    created_at  timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    UNIQUE KEY uq_org_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------------------------
-- Utilisateurs (secrétariat, formateur, stagiaire, entreprise, financeur…)
-- ---------------------------------------------------------------------------
CREATE TABLE user (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         DEFAULT NULL,
    role            enum('PLATFORM_OWNER','SUPER_ADMIN','ADMIN_ORGANISME','SECRETARIAT','FORMATEUR',
                         'STAGIAIRE','ENTREPRISE','FINANCEUR','AUDITEUR','INTERVENANT')
                    NOT NULL DEFAULT 'SECRETARIAT',
    first_name      varchar(120) DEFAULT NULL,
    last_name       varchar(120) DEFAULT NULL,
    email           varchar(255) NOT NULL,
    phone           varchar(30)  DEFAULT NULL,
    active          tinyint(1)   NOT NULL DEFAULT 1,    -- 0 = accès désactivé (connexion refusée)
    nav_access      text         DEFAULT NULL,          -- accès menu par utilisateur (JSON de chemins) ; NULL = rien accordé
    signature_image longtext     DEFAULT NULL,          -- signature enregistrée (cachet/image, chiffrée au repos) — ex. intervenant société
    last_login_at   timestamp    NULL DEFAULT NULL,     -- dernière connexion réussie
    password        varchar(255) NOT NULL,             -- hash bcrypt (authentification)
    created_at      timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    UNIQUE KEY uq_user_org_email (organization_id, email),
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
    lat                 decimal(9,6) DEFAULT NULL,       -- géolocalisation précise (carte)
    lng                 decimal(9,6) DEFAULT NULL,
    geo_precision       varchar(20)  DEFAULT NULL,       -- housenumber|street|locality|municipality
    geocoded_at         timestamp    NULL DEFAULT NULL,
    -- Parcours scolaire
    diploma_level       varchar(120) DEFAULT NULL,       -- niveau du diplôme le plus élevé
    diploma_name        varchar(180) DEFAULT NULL,       -- nom du diplôme
    diploma_year        varchar(8)   DEFAULT NULL,       -- année d'obtention
    last_experience     varchar(255) DEFAULT NULL,       -- dernière expérience professionnelle
    experience_value    varchar(20)  DEFAULT NULL,       -- durée : chiffre
    experience_unit     varchar(20)  DEFAULT NULL,       -- durée : mois / année
    -- Statut actuel & financement
    professional_status varchar(120) DEFAULT NULL,       -- « Êtes-vous ? » : en activité, demandeur d'emploi…
    levels              varchar(120) DEFAULT NULL,       -- étiquettes niveau/accès (CSV : NIV1,NIV1_PRO…)
    cpf_amount          decimal(10,2) DEFAULT NULL,      -- « Combien de CPF »
    france_travail_id   varchar(60)  DEFAULT NULL,       -- Id France Travail (Pôle emploi)
    current_contract    varchar(60)  DEFAULT NULL,       -- contrat actuel (si en activité)
    social_security     varchar(255) DEFAULT NULL,       -- n° de sécurité sociale (chiffré AES-256-GCM au repos)
    financing           enum('PARTICULIER','PROFESSIONNEL') NOT NULL DEFAULT 'PARTICULIER',
    opco                varchar(120) DEFAULT NULL,       -- OPCO / financeur (AGEFICE, AKTO, FIF PL…)
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
    level           varchar(20)   DEFAULT NULL,      -- NIV1|NIV1_PRO|NIV2|EXPERT|RS (code couleur carte)
    color           varchar(20)   DEFAULT NULL,      -- couleur personnalisée du badge (sinon déduite)
    title           varchar(255)  NOT NULL,
    days            int           DEFAULT NULL,
    hours           int           DEFAULT NULL,
    price           decimal(10,2) DEFAULT NULL,
    audience        text          DEFAULT NULL,      -- « Public »
    objectives      text          DEFAULT NULL,      -- objectifs pédagogiques (détaillés)
    objective_general text        DEFAULT NULL,      -- « ObjectifG » (objectif général)
    duration_detail text          DEFAULT NULL,      -- « DuréeDétail » (horaires par jour)
    program_detail  longtext      DEFAULT NULL,      -- « Déroulé » (programme jour par jour)
    rs_code         varchar(40)   DEFAULT NULL,      -- RS7404 si certifiante
    hygiene         tinyint(1)    NOT NULL DEFAULT 0,
    archive_tree    longtext      DEFAULT NULL,      -- arborescence d'archivage (JSON) pour l'export ZIP Qualiopi
    active          tinyint(1)    NOT NULL DEFAULT 1,
    sort_order      int           NOT NULL DEFAULT 100, -- ordre d'affichage (réorganisation)
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
-- Documents générés (DOCX/PDF) d'un dossier
-- ---------------------------------------------------------------------------
CREATE TABLE generated_document (
    id            uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid       NOT NULL,
    learner_id    uuid         DEFAULT NULL,          -- stagiaire propriétaire du document
    enrollment_id uuid         DEFAULT NULL,          -- dossier principal (facultatif : cf. document_formation)
    type          varchar(40)  NOT NULL,               -- DEVIS, CONTRAT… (ou type personnalisé)
    template_slug varchar(60)  DEFAULT NULL,            -- modèle/étape ayant produit le document
    quiz_id       uuid         DEFAULT NULL,            -- document adossé à un QCM
    title         varchar(255) DEFAULT NULL,
    status        enum('A_FAIRE','GENERE','ENVOYE','CONSULTE','SIGNE','ARCHIVE')
                  NOT NULL DEFAULT 'A_FAIRE',
    number        varchar(20)  DEFAULT NULL,
    file_name     varchar(255) DEFAULT NULL,
    sent_at       datetime     DEFAULT NULL,          -- envoi au stagiaire (demande de signature)
    signed_at     datetime     DEFAULT NULL,          -- horodatage de signature
    signer_name   varchar(255) DEFAULT NULL,          -- nom saisi par le signataire
    signature_data longtext    DEFAULT NULL,          -- image de signature (data URL)
    signer_ip     varchar(255) DEFAULT NULL,          -- traçabilité : IP du signataire (chiffrée au repos)
    signer_user_agent varchar(1000) DEFAULT NULL,     -- traçabilité : appareil/navigateur (chiffré au repos)
    signed_hash   char(64)     DEFAULT NULL,          -- SHA-256 du contenu signé
    org_signed_at datetime     DEFAULT NULL,          -- signature organisme (appliquée à l'envoi)
    org_signer_name varchar(255) DEFAULT NULL,        -- nom de l'organisme signataire
    org_signature_data longtext DEFAULT NULL,         -- image de signature organisme (chiffrée au repos)
    created_at    timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_doc_org (organization_id, type),
    KEY idx_doc_learner (learner_id),
    CONSTRAINT fk_doc_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE,
    CONSTRAINT fk_doc_learner FOREIGN KEY (learner_id)
        REFERENCES learner (id) ON DELETE CASCADE,
    CONSTRAINT fk_doc_enrollment FOREIGN KEY (enrollment_id)
        REFERENCES enrollment (id) ON DELETE SET NULL
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
-- Émargement
-- ---------------------------------------------------------------------------
CREATE TABLE attendance_sheet (
    id         uuid      NOT NULL DEFAULT uuid(),
    session_id uuid      NOT NULL,
    date       date      NOT NULL,
    slot       enum('MATIN','APRES_MIDI','EXAMEN','DISTANCIEL') NOT NULL,
    trainer_name      varchar(255) DEFAULT NULL,        -- formateur signataire
    trainer_signature longtext     DEFAULT NULL,        -- signature manuscrite (data URL)
    trainer_signed_at datetime     DEFAULT NULL,
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
    signer_name    varchar(255) DEFAULT NULL,           -- stagiaire signataire
    signature_data longtext     DEFAULT NULL,           -- signature manuscrite (data URL)
    signer_ip      varchar(255) DEFAULT NULL,           -- traçabilité : IP du signataire (chiffrée au repos)
    signer_user_agent varchar(1000) DEFAULT NULL,       -- traçabilité : appareil/navigateur (chiffré au repos)
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
    payment_method  varchar(30)   DEFAULT NULL,           -- Espèces / CB / Virement / Chèque (boutique)
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
    link            varchar(255) DEFAULT NULL,        -- chemin de redirection au clic
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
    offer           varchar(500) DEFAULT NULL,       -- ce que le partenaire propose
    notes           text         DEFAULT NULL,       -- notes de suivi
    created_at      timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_partner_org (organization_id, category),
    CONSTRAINT fk_partner_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
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

-- ---------------------------------------------------------------------------
-- Comptabilité / Gestion (tableau de pilotage — pas de compta légale)
-- ---------------------------------------------------------------------------
CREATE TABLE expense (
    id               uuid          NOT NULL DEFAULT uuid(),
    organization_id  uuid          NOT NULL,
    date             date          NOT NULL DEFAULT current_timestamp(),
    category         enum('MATIERES_PREMIERES','SALAIRES','LOYER','MARKETING','ENERGIE','DIVERS')
                                   NOT NULL DEFAULT 'DIVERS',
    label            varchar(255)  NOT NULL,
    amount_ht        decimal(10,2) NOT NULL,
    supplier_id      uuid          DEFAULT NULL,
    note             varchar(255)  DEFAULT NULL,
    created_at       timestamp     NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_expense_org (organization_id),
    KEY idx_expense_date (date),
    CONSTRAINT fk_expense_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE revenue_extra (
    id               uuid          NOT NULL DEFAULT uuid(),
    organization_id  uuid          NOT NULL,
    date             date          NOT NULL DEFAULT current_timestamp(),
    label            varchar(255)  NOT NULL,
    category         varchar(30)   NOT NULL DEFAULT 'COMMISSION',
    partner_id       uuid          DEFAULT NULL,          -- commission liée à un partenaire
    amount           decimal(10,2) NOT NULL,
    note             varchar(255)  DEFAULT NULL,
    created_at       timestamp     NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_revextra_org (organization_id),
    KEY idx_revextra_date (date),
    CONSTRAINT fk_revextra_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE accounting_settings (
    id               uuid          NOT NULL DEFAULT uuid(),
    organization_id  uuid          NOT NULL,
    targets          longtext      DEFAULT NULL,
    dividende_cible  decimal(5,2)  NOT NULL DEFAULT 10.00,
    created_at       timestamp     NOT NULL DEFAULT current_timestamp(),
    updated_at       timestamp     NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
    PRIMARY KEY (id),
    UNIQUE KEY uq_accset_org (organization_id),
    CONSTRAINT fk_accset_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Paramètres de la boutique (facturation matériel : numérotation, mentions, paiement, TVA)
CREATE TABLE shop_settings (
    id               uuid         NOT NULL DEFAULT uuid(),
    organization_id  uuid         NOT NULL,
    invoice_prefix   varchar(20)  NOT NULL DEFAULT 'F',
    next_number      int          NOT NULL DEFAULT 1,
    payment_methods  varchar(255) NOT NULL DEFAULT 'Espèces,CB,Virement,Chèque',
    legal_mentions   text         DEFAULT NULL,
    tva_applies      tinyint(1)   NOT NULL DEFAULT 1,      -- 1 = TVA appliquée ; 0 = exonérée
    created_at       timestamp    NOT NULL DEFAULT current_timestamp(),
    updated_at       timestamp    NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
    PRIMARY KEY (id),
    UNIQUE KEY uq_shop_org (organization_id),
    CONSTRAINT fk_shop_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------------------------
-- Modèles de documents par organisme (.docx téléversés, multi-tenant)
-- ---------------------------------------------------------------------------
CREATE TABLE document_template (
    id               uuid         NOT NULL DEFAULT uuid(),
    organization_id  uuid         NOT NULL,
    slug             varchar(60)  NOT NULL,
    label            varchar(255) DEFAULT NULL,      -- intitulé de l'étape
    doc_type         varchar(40)  DEFAULT NULL,      -- type du generated_document (DEVIS…)
    kind             varchar(10)  NOT NULL DEFAULT 'builder', -- 'builder' (corps HTML) | 'docx' (fichier)
    body_html        longtext     DEFAULT NULL,       -- corps du modèle construit dans l'app (jetons {…})
    header_html      longtext     DEFAULT NULL,       -- en-tête éditable (sinon papier à en-tête auto)
    footer_html      longtext     DEFAULT NULL,       -- pied de page éditable
    sort_order       int          NOT NULL DEFAULT 100,
    signable         tinyint(1)   NOT NULL DEFAULT 0,
    stagiaire_sign   tinyint(1)   NOT NULL DEFAULT 0,
    applies_when     longtext     DEFAULT NULL,       -- JSON {financing?,rs?,hygiene?,jours?}
    active           tinyint(1)   NOT NULL DEFAULT 1,
    deleted          tinyint(1)   NOT NULL DEFAULT 0, -- tombstone : masque définitivement une étape du socle
    name             varchar(255) DEFAULT NULL,       -- nom de fichier d'origine
    mime             varchar(120) DEFAULT 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    file             longblob     DEFAULT NULL,       -- .docx (facultatif : étape sans modèle)
    created_at       timestamp    NOT NULL DEFAULT current_timestamp(),
    updated_at       timestamp    NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
    PRIMARY KEY (id),
    UNIQUE KEY uq_tpl_org_slug (organization_id, slug),
    CONSTRAINT fk_tpl_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Parcours documentaire par formation (quels documents / dans quel ordre)
CREATE TABLE program_step (
    id               uuid       NOT NULL DEFAULT uuid(),
    organization_id  uuid       NOT NULL,
    program_id       uuid       NOT NULL,
    slug             varchar(60) NOT NULL,       -- étape (cf. DEFAULT_STEPS / document_template)
    sort_order       int        NOT NULL DEFAULT 100,
    active           tinyint(1) NOT NULL DEFAULT 1,
    or_group         varchar(60) DEFAULT NULL,    -- regroupement « OU » manuel (même valeur = une seule étape à choix)
    created_at       timestamp  NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    UNIQUE KEY uq_progstep (program_id, slug),
    KEY idx_progstep_org (organization_id),
    CONSTRAINT fk_progstep_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE,
    CONSTRAINT fk_progstep_prog FOREIGN KEY (program_id)
        REFERENCES training_program (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Conditions personnalisées d'application des documents (Modeles → Conditions) :
-- champ réel du dossier + opérateur + valeur ; référencées par slug dans
-- document_template.applies_when.conditions.
CREATE TABLE document_condition (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         NOT NULL,
    slug            varchar(60)  NOT NULL,           -- identifiant court (référencé par les modèles)
    label           varchar(160) NOT NULL,           -- intitulé lisible
    field           varchar(60)  NOT NULL,           -- clé du champ (cf. FIELD_CATALOG)
    op              varchar(20)  NOT NULL,           -- opérateur (eq, ne, in, lt, ge, is_true…)
    value           longtext     DEFAULT NULL,       -- valeur (JSON : chaîne, nombre, booléen ou tableau)
    created_at      timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    UNIQUE KEY uq_condition_org_slug (organization_id, slug),
    KEY idx_condition_org (organization_id),
    CONSTRAINT fk_condition_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Champs du dossier activés comme conditions (Réglages → Champs du dossier).
CREATE TABLE condition_field (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         NOT NULL,
    source_table    varchar(64)  NOT NULL,           -- learner | enrollment | training_program | training_session | company | virtual
    column_name     varchar(64)  NOT NULL,           -- nom de colonne (ou champ virtuel : age, has_company)
    enabled         tinyint(1)   NOT NULL DEFAULT 1,
    label           varchar(160) DEFAULT NULL,       -- libellé personnalisé (sinon commentaire de colonne)
    created_at      timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    UNIQUE KEY uq_condfield_org_col (organization_id, source_table, column_name),
    KEY idx_condfield_org (organization_id),
    CONSTRAINT fk_condfield_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Signature d'émargement par formateur et par demi-journée.
CREATE TABLE attendance_trainer_sign (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Intervenants externes affectés à une session (comptes rôle INTERVENANT), avec
-- les demi-journées assurées (session_intervenant_slot). Ils signent l'émargement.
CREATE TABLE session_intervenant (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         NOT NULL,
    session_id      uuid         NOT NULL,
    user_id         uuid         NOT NULL,
    specialty       varchar(160) DEFAULT NULL,
    created_at      timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    UNIQUE KEY uq_session_interv (session_id, user_id),
    KEY idx_si_org (organization_id),
    CONSTRAINT fk_si_org     FOREIGN KEY (organization_id) REFERENCES organization (id) ON DELETE CASCADE,
    CONSTRAINT fk_si_session FOREIGN KEY (session_id)      REFERENCES training_session (id) ON DELETE CASCADE,
    CONSTRAINT fk_si_user    FOREIGN KEY (user_id)         REFERENCES user (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE session_intervenant_slot (
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

-- Formateurs affectés à une session (plusieurs possibles), choisis dans l'équipe.
CREATE TABLE session_trainer (
    id         uuid      NOT NULL DEFAULT uuid(),
    session_id uuid      NOT NULL,
    user_id    uuid      NOT NULL,
    created_at timestamp NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    UNIQUE KEY uq_session_trainer (session_id, user_id),
    KEY idx_st_session (session_id),
    CONSTRAINT fk_st_session FOREIGN KEY (session_id) REFERENCES training_session (id) ON DELETE CASCADE,
    CONSTRAINT fk_st_user    FOREIGN KEY (user_id)    REFERENCES user (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Rôles d'accès personnalisés : profils réutilisables d'accès au menu.
CREATE TABLE access_profile (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         NOT NULL,
    name            varchar(120) NOT NULL,
    system_role     varchar(30)  DEFAULT NULL,          -- si défini : personnalisation d'un rôle système
    color           varchar(9)   DEFAULT NULL,
    nav_access      text         DEFAULT NULL,
    created_at      timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_ap_org (organization_id),
    UNIQUE KEY uq_ap_sys (organization_id, system_role),
    CONSTRAINT fk_ap_org FOREIGN KEY (organization_id) REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Référentiel OPCO / financeurs (un enregistrement par OPCO), avec coordonnées.
CREATE TABLE opco (
    id                 uuid         NOT NULL DEFAULT uuid(),
    organization_id    uuid         NOT NULL,
    code               varchar(40)  DEFAULT NULL,
    name               varchar(160) NOT NULL,
    address            varchar(255) DEFAULT NULL,
    zip_code           varchar(10)  DEFAULT NULL,
    town               varchar(120) DEFAULT NULL,
    email              varchar(255) DEFAULT NULL,
    phone              varchar(30)  DEFAULT NULL,
    website            varchar(160) DEFAULT NULL,
    triggers_assiduite tinyint(1)   NOT NULL DEFAULT 0,
    active             tinyint(1)    NOT NULL DEFAULT 1,
    sort_order         int           NOT NULL DEFAULT 100,
    created_at         timestamp     NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_opco_org (organization_id),
    CONSTRAINT fk_opco_org FOREIGN KEY (organization_id) REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Lignes de facture : une facture peut couvrir plusieurs dossiers / formations.
CREATE TABLE invoice_line (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Coffre documentaire : documents historiques importés (PDF), classés par
-- année / semaine / formation / stagiaire (libellés texte). Cf. Suivi → Archives.
CREATE TABLE archive_document (
    id              uuid         NOT NULL DEFAULT uuid(),
    organization_id uuid         NOT NULL,
    ref             varchar(80)  DEFAULT NULL,          -- réf. stable pour upsert (ex. emarg:<enrollment_id>)
    year            int          DEFAULT NULL,
    week            int          DEFAULT NULL,
    formation_label varchar(255) DEFAULT NULL,
    learner_name    varchar(255) DEFAULT NULL,
    title           varchar(255) NOT NULL,
    status          varchar(20)  NOT NULL DEFAULT 'ARCHIVE',
    mime            varchar(100) DEFAULT 'application/pdf',
    file            longblob     DEFAULT NULL,
    created_at      timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_archdoc_org (organization_id),
    UNIQUE KEY uq_archdoc_ref (organization_id, ref),
    CONSTRAINT fk_archdoc_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
