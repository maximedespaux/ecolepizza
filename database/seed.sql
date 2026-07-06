-- ============================================================================
--  gds_doc_gestionary — données de démonstration
--  Organisme École Pizza + admin + 9 formations + entreprise & partenaires.
--  Exécuter APRÈS schema.sql :
--    mysql -u root -p < database/seed.sql
--
--  Compte de démo :  admin@ecole-pizza.com  /  gds_doc_gestionary123
-- ============================================================================

USE gds_doc_gestionary;

SET @org_id     = '11111111-1111-1111-1111-111111111111';
SET @company_id = '22222222-2222-2222-2222-222222222222';

-- --- Organisme ---
INSERT INTO organization
    (id, legal_name, short_name, manager, siret, nda, naf_ape, address, zip_code, town, phone, email, qualiopi)
VALUES
    (@org_id, 'ECOLE PIZZAIOLO Jean-Jacques DESPAUX', 'École Pizza', 'Jean-Jacques DESPAUX',
     '879 955 136 00012', '76 65 00989 65', '8559A',
     '101 rue Alsace Lorraine', '65300', 'Lannemezan',
     '05 62 50 18 64', 'contact@ecole-pizza.com', 1);

-- --- Compte administrateur (mot de passe : impasto123) ---
INSERT INTO user
    (id, organization_id, role, first_name, last_name, email, phone, password)
VALUES
    (uuid(), @org_id, 'ADMIN_ORGANISME', 'Jean-Jacques', 'Despaux',
     'admin@ecole-pizza.com', '06 84 54 24 96',
     '$2b$10$xUqR9QWstQ3NbNxMsSAscO4XQQwHugXjhRP6jXg9UOYUQB40Ss7uq');

-- --- Entreprise cliente de démonstration ---
INSERT INTO company
    (id, organization_id, name, siret, town, email, phone, representative_civ, representative_name)
VALUES
    (@company_id, @org_id, 'Pizzeria Bella Napoli', '512 345 678 00021', 'Tarbes',
     'contact@bellanapoli.fr', '05 62 00 00 00', 'M.', 'Marco Rossi');

-- --- Catalogue des 9 formations ---
INSERT INTO training_program
    (id, organization_id, code, title, days, hours, price, rs_code, hygiene, objectives)
VALUES
    (uuid(), @org_id, 'NIV1',    'Pizzaïolo Niveau I – Pizza Classique',                              5, 35, 1480.00, NULL,     0, NULL),
    (uuid(), @org_id, 'NIV1H',   'Niveau I – Pizza Classique & Hygiène alimentaire',                  5, 44, 1780.00, NULL,     1, NULL),
    (uuid(), @org_id, 'NIV1PRO', 'Pizzaïolo Niveau I PRO – Pizza Classique',                          2, 15,  850.00, NULL,     0, NULL),
    (uuid(), @org_id, 'NIV2',    'Niveau II – Empâtements Indirects « Poolish - Biga »',              2, 15,  850.00, NULL,     0, NULL),
    (uuid(), @org_id, 'NIV2C',   'Niveau II – Empâtements Indirects « Poolish - Biga - Contemporaine »', 3, 21, 1180.00, NULL, 0, NULL),
    (uuid(), @org_id, 'EXPERT',  'Spécialisation « Expert »',                                         4, 32, 1650.00, NULL,     0, NULL),
    (uuid(), @org_id, 'NAPO',    'Spécialisation Pizza Napolitaine',                                  5, 35, 1750.00, NULL,     0, NULL),
    (uuid(), @org_id, 'TEGLIA',  'Spécialisation « In Teglia & In Pala »',                            2, 14,  850.00, NULL,     0, NULL),
    (uuid(), @org_id, 'RS7404',  'Fabriquer des pizzas artisanales (RS7404)',                         5, 35, 1750.00, 'RS7404', 0,
     'Certification RS7404 — fabriquer des pizzas artisanales.');

-- --- Quelques partenaires ---
INSERT INTO partner
    (id, organization_id, name, category, contact_email, town)
VALUES
    (uuid(), @org_id, 'Moulins Pyrénéens',       'FARINE',   'contact@moulins-pyr.fr',   'Tarbes'),
    (uuid(), @org_id, 'Four & Flamme',           'FOUR',     'ventes@fouretflamme.fr',   'Toulouse'),
    (uuid(), @org_id, 'Salaisons du Sud-Ouest',  'CHARCUTERIE', 'pro@salaisons-so.fr',   'Auch'),
    (uuid(), @org_id, 'MatérielPro Pizza',       'MATERIEL', 'info@materielpro.fr',      'Pau');
