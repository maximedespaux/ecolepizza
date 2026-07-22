/**
 * L'entreprise comme acheteuse d'une vente en caisse.
 *
 * Une vente pouvait être facturée à un stagiaire ou à personne (comptoir), jamais à une
 * entreprise — alors que c'est parfois elle qui achète, et que la facture, elle, savait déjà
 * s'adresser à une entreprise (invoice.company_id, SIRET, e-mail). Ces tests portent sur le
 * CODE RÉEL du contrôleur : ils attrapent le retour d'un chemin oublié, pas une jointure qui
 * ramènerait de mauvaises lignes — ça se vérifie en base.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..');
/** Le code sans ses commentaires : une explication qui cite un défaut ne doit pas le signaler. */
const net = (f) => fs.readFileSync(path.join(DIR, f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

// --- Le checkout ----------------------------------------------------------------------------

test('le checkout accepte et vérifie une entreprise acheteuse', () => {
    const src = net('controllers/sale.controller.js');
    const bloc = src.slice(src.indexOf('const checkout'));
    assert.match(bloc, /const \{ learner_id, company_id/, 'company_id n\'est pas lu du corps');
    // Écrite en clé étrangère, l'entreprise doit être vérifiée : un id d'un autre organisme
    // créerait une facture qui pointe ailleurs — la famille « clé étrangère non vérifiée ».
    assert.match(bloc, /belongsToOrg\(conn, 'company', company_id, orgId\)/, 'entreprise non vérifiée');
});

test('la facture d\'une vente reçoit company_id', () => {
    const src = net('controllers/sale.controller.js');
    const bloc = src.slice(src.indexOf('INSERT INTO invoice'));
    assert.match(bloc.slice(0, 400), /company_id/, 'invoice.company_id n\'est pas écrit');
});

test('la vente comptable reçoit company_id quand la colonne existe', () => {
    // material_sale.company_id (migration 112) sert au rapprochement par entreprise. On l'insère
    // seulement si la colonne est là, sinon la vente échouerait avant la migration.
    const src = net('controllers/sale.controller.js');
    assert.match(src, /hasColumn\(conn, 'material_sale', 'company_id'\)/, 'pas de garde de colonne');
    // Le push doit être SOUS la garde : inséré inconditionnellement, il ferait échouer toute
    // vente tant que la migration 112 n'est pas jouée.
    assert.match(src, /if \(hasSaleCompany\) \{ col\.push\('company_id'\)/,
        'l\'ajout de company_id n\'est pas conditionné à l\'existence de la colonne');
});

test('le nom imprimé de l\'entreprise prime sur celui du stagiaire', () => {
    // Quand les deux sont présents, c'est l'entreprise qui achète.
    const src = net('controllers/sale.controller.js');
    const bloc = src.slice(src.indexOf('let name = buyer_name'), src.indexOf('INSERT INTO invoice'));
    assert.ok(bloc.indexOf('company_id') < bloc.indexOf('learner_id'),
        'la résolution du nom teste le stagiaire avant l\'entreprise');
});

// --- La facture : l'entreprise prime ---------------------------------------------------------

test('loadInvoiceData facture l\'entreprise avant le stagiaire', () => {
    // LE POINT DÉLICAT. Une vente à une entreprise avec un stagiaire rattaché porte les DEUX
    // colonnes. Tester learner_id d'abord facturerait la personne — et priverait le XML du
    // SIRET (BT-30) que seule l'entreprise porte.
    const src = net('controllers/invoice.controller.js');
    const bloc = src.slice(src.indexOf('let buyer ='), src.indexOf('// Lignes de la facture'));
    assert.ok(bloc.indexOf('inv.company_id') < bloc.indexOf('inv.learner_id'),
        'company_id doit être testé avant learner_id');
});

test('l\'entreprise facturée garde son SIRET et son e-mail', () => {
    // C'est tout l'intérêt de facturer l'entreprise : elle a un SIRET (BT-30) et un e-mail
    // (BT-49), les deux champs qui manquaient en facturant une personne.
    const src = net('controllers/invoice.controller.js');
    const bloc = src.slice(src.indexOf('if (inv.company_id)'), src.indexOf('} else if (inv.learner_id)'));
    assert.match(bloc, /siret: c\[0\]\.siret/, 'le SIRET de l\'entreprise n\'est pas repris');
    assert.match(bloc, /email: inv\.buyer_email \|\| c\[0\]\.email/, 'l\'e-mail de l\'entreprise n\'est pas repris');
    // Le nom imprimé prime, comme partout ailleurs.
    assert.match(bloc, /name: inv\.buyer_name \|\| c\[0\]\.name/, 'le nom stocké doit primer');
});

// --- La migration ---------------------------------------------------------------------------

test('la migration 112 existe avec son retour arrière', () => {
    const dir = path.join(DIR, '..', '..', 'database', 'migrations');
    const up = fs.readFileSync(path.join(dir, '112_material_sale_company.sql'), 'utf8');
    assert.match(up, /ADD COLUMN IF NOT EXISTS company_id/, 'colonne absente');
    assert.match(up, /ON DELETE SET NULL/, 'supprimer une entreprise ne doit pas effacer ses ventes');
    const down = fs.readFileSync(path.join(dir, '112_revert_material_sale_company.sql'), 'utf8');
    assert.match(down, /DROP FOREIGN KEY IF EXISTS fk_sale_company/, 'la contrainte doit tomber avant la colonne');
});

// --- L'historique ---------------------------------------------------------------------------

test('l\'historique nomme l\'entreprise acheteuse quand la colonne existe', () => {
    const src = net('controllers/sale.controller.js');
    const bloc = src.slice(src.indexOf('const getSales'), src.indexOf('const createSale'));
    assert.match(bloc, /company_name/, 'le nom de l\'entreprise n\'est pas ramené');
    assert.match(bloc, /LEFT JOIN company co/, 'pas de jointure entreprise');
});
