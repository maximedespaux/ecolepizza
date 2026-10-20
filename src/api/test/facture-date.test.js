/**
 * DATE DE FACTURE (distincte de l'échéance) + HT/TTC dans la liste — demandé le 2026-10-20.
 *
 * La date d'émission d'une facture était sa date de CRÉATION en base (`created_at`), non modifiable
 * et jamais choisie par l'école. On ajoute une date SAISISSABLE (`invoice_date`, migration 211),
 * DISTINCTE de l'échéance (`due_date`, la date limite de paiement), reprise par le jeton
 * {Date facture} (qui lisait created_at). Et la liste des factures montre désormais HT ET TTC, pas
 * le seul HT.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const lireApi = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const lireUi = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', rel), 'utf8');
const lireRacine = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', '..', rel), 'utf8');

test('migration 211 : la colonne invoice_date, nullable, rejouable, sans FK', () => {
    const mig = lireRacine('database/migrations/211_invoice_date.sql');
    assert.match(mig, /ALTER TABLE invoice ADD COLUMN IF NOT EXISTS invoice_date date DEFAULT NULL;/);
    assert.doesNotMatch(mig.split('\n').filter((l) => l.trim().startsWith('ALTER')).join('\n'), /FOREIGN KEY|CONSTRAINT/, 'une date pure, pas de clé étrangère');
    assert.match(lireRacine('database/migrations/211_revert_invoice_date.sql'), /ALTER TABLE invoice DROP COLUMN IF EXISTS invoice_date;/);
});

test('createInvoice : la date de facture est lue, validée (AAAA-MM-JJ) et insérée SI la colonne existe', () => {
    const co = lireApi('controllers/invoice.controller.js');
    const fn = co.slice(co.indexOf('const createInvoice'), co.indexOf('\nconst ', co.indexOf('const createInvoice') + 10));
    assert.match(fn, /invoice_date, lines \} = req\.body;/, 'lue du corps');
    assert.match(fn, /const hasInvDate = await colonneExiste\(conn, 'invoice', 'invoice_date'\);/);
    assert.match(fn, /const invoiceDate = .*\.test\(String\(invoice_date \|\| ''\)\) \? invoice_date : null;/, 'format strict, sinon null');
    assert.match(fn, /const dateCol = hasInvDate \? \{ colonne: ', invoice_date', place: ', \?', valeurs: \[invoiceDate\] \}/);
    // Ajoutée aux DEUX variantes de l'INSERT (avec et sans billing_profile_id).
    assert.strictEqual((fn.match(/\$\{dateCol\.colonne\}/g) || []).length, 2, 'les deux INSERT');
    assert.strictEqual((fn.match(/\.\.\.dateCol\.valeurs/g) || []).length, 2);
});

test('{Date facture} = la date saisie si remplie, sinon created_at (loadInvoiceData, tolérant)', () => {
    const co = lireApi('controllers/invoice.controller.js');
    assert.match(co, /colonneExiste\(conn, 'invoice', 'invoice_date'\) \? 'COALESCE\(i\.invoice_date, i\.created_at\)' : 'i\.created_at'/);
    assert.match(co, /DATE_FORMAT\(\$\{emission\}, '%Y%m%d'\) AS issue_ymd/);
    // Le jeton lit issueDate (= issue_ymd) sans changer : c'est la SOURCE de issue_ymd qui change.
    assert.match(lireApi('lib/tokens.js'), /'Date facture': inv\.dateFr \|\| ''/);
    assert.match(lireApi('lib/tokens.js'), /'Échéance facture': inv\.dueFr \|\| ''/, 'l\'échéance reste sur due_date');
});

test('la liste des factures montre HT ET TTC (plus le seul montant net)', () => {
    const page = lireUi('pages/Factures.jsx');
    const col = page.slice(page.indexOf('k: "amount"'), page.indexOf('k: "statut"'));
    assert.match(col, /\{euro\(i\.amount_net\)\} <span[^>]*>HT<\/span>/);
    assert.match(col, /\{euro\(ttcDe\(i\.amount_net, i\.tva_exoneree\)\)\} <span[^>]*>TTC<\/span>/);
});

test('le formulaire a une Date de facture distincte de l\'échéance, envoyée au serveur', () => {
    const page = lireUi('pages/Factures.jsx');
    assert.match(page, /invoice_date: "", due_date: ""/, 'un champ de plus dans l\'état initial');
    assert.match(page, /<Field label="Date de facture" type="date" value=\{form\.invoice_date\}/);
    assert.match(page, /<Field label="Échéance" type="date" value=\{form\.due_date\}/, 'l\'échéance reste un champ à part');
    assert.match(page, /invoice_date: form\.invoice_date \|\| null/, 'envoyée dans le payload de createInvoice');
});
