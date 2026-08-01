/* 113_billing_profile.sql
   Entités émettrices : facturer sous plusieurs identités.

   POURQUOI. Jusqu'ici le vendeur d'une facture EST l'organisme, en dur : sa raison sociale, son
   SIRET, sa TVA, son IBAN partent tels quels dans le PDF ET dans le XML Factur-X. Un centre qui
   vend aussi du matériel via une société distincte — SIRET propre — ne pouvait pas émettre à ce
   nom-là.

   CE QU'UNE ENTITÉ ÉMETTRICE EST, ET N'EST PAS. C'est une identité de VENDEUR complète et RÉELLE,
   pas une étiquette. Le XML Factur-X porte le nom, le SIREN/SIRET, la TVA et l'adresse du vendeur
   (BR-FR-10, BR-S-02…) : ils doivent tous basculer ENSEMBLE et correspondre à la réalité. Afficher
   un nom avec le SIRET d'une autre société produirait une facture non conforme et trompeuse — le
   contraire du but. D'où une table qui porte l'identité entière, pas un simple champ « nom ».

   NUMÉROTATION PROPRE À CHAQUE ÉMETTRICE. La loi impose une séquence continue par entité qui
   facture. Chaque profil a donc son préfixe et son compteur (`next_number`), comme shop_settings
   en avait un pour la boutique. Le préfixe doit DIFFÉRER d'une entité à l'autre : deux séquences
   « F-2026-0001 » se heurteraient sur la contrainte d'unicité du numéro (uq_invoice_number). La
   validation à l'enregistrement s'en assure ; la contrainte reste le dernier rempart.

   UN DÉFAUT PAR ORGANISME (`is_default`) : l'émettrice appliquée sans choix. On peut la remplacer
   ponctuellement à la création d'une facture. Sans profil du tout, le code retombe sur l'identité
   de l'organisme — rien ne casse tant que cette migration n'est pas jouée.

   MODÈLE DE FACTURE PAR ÉMETTRICE (`default_template_slug`) : chaque entité a sa présentation.
   NULL = on retombe sur la sélection habituelle du modèle FACTURE.

   Commentaires en blocs : mêmes raisons qu'en 101/102. */

CREATE TABLE IF NOT EXISTS billing_profile (
    id                    uuid         NOT NULL DEFAULT uuid(),
    organization_id       uuid         NOT NULL,
    label                 varchar(120) NOT NULL,           /* nom interne pour choisir l'entite */
    legal_name            varchar(255) NOT NULL,           /* raison sociale imprimee et en XML */
    legal_status          varchar(40)  DEFAULT NULL,       /* forme juridique (SARL, SAS, EI...) */
    capital               varchar(40)  DEFAULT NULL,       /* capital social */
    rcs                   varchar(160) DEFAULT NULL,       /* RCS + ville d'immatriculation */
    siret                 varchar(20)  DEFAULT NULL,
    vat_number            varchar(30)  DEFAULT NULL,       /* n TVA intracommunautaire */
    naf_ape               varchar(10)  DEFAULT NULL,
    nda                   varchar(20)  DEFAULT NULL,       /* n de declaration d'activite (le cas echeant) */
    address               varchar(255) DEFAULT NULL,
    zip_code              varchar(10)  DEFAULT NULL,
    town                  varchar(120) DEFAULT NULL,
    country               char(2)      NOT NULL DEFAULT 'FR',
    phone                 varchar(30)  DEFAULT NULL,
    email                 varchar(255) DEFAULT NULL,
    iban                  varchar(34)  DEFAULT NULL,
    bic                   varchar(11)  DEFAULT NULL,
    bank_name             varchar(120) DEFAULT NULL,
    logo_image            longtext     DEFAULT NULL,
    signature_image       longtext     DEFAULT NULL,
    invoice_prefix        varchar(20)  NOT NULL DEFAULT 'F',
    next_number           int          NOT NULL DEFAULT 1,
    default_template_slug varchar(80)  DEFAULT NULL,       /* modele FACTURE de cette entite */
    is_default            tinyint(1)   NOT NULL DEFAULT 0, /* emettrice appliquee sans choix */
    created_at            timestamp    NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_billing_org (organization_id),
    /* Deux entites d'un meme organisme ne peuvent pas partager un prefixe : la numerotation en
       depend, et l'unicite du numero de facture aussi. */
    UNIQUE KEY uq_billing_prefix (organization_id, invoice_prefix),
    CONSTRAINT fk_billing_org FOREIGN KEY (organization_id)
        REFERENCES organization (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

/* Le lien facture -> emettrice. NULL = ancienne facture, ou emettrice = l'organisme (defaut du
   code). ON DELETE SET NULL : retirer une entite ne doit pas effacer les factures qu'elle a
   emises — une piece comptable survit aux tiers qu'elle nomme, la facture garde son numero et
   son identite imprimee. */
ALTER TABLE invoice
    ADD COLUMN IF NOT EXISTS billing_profile_id uuid DEFAULT NULL;

ALTER TABLE invoice
    ADD CONSTRAINT fk_invoice_billing FOREIGN KEY (billing_profile_id)
        REFERENCES billing_profile (id) ON DELETE SET NULL;
