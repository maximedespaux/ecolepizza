/**
 * Entités émettrices — facturer sous plusieurs identités de vendeur.
 *
 * Le point sensible : quand une facture porte une émettrice, TOUT le vendeur doit basculer sur
 * elle — le nom imprimé comme le SIRET et la TVA du XML Factur-X. Une identité qui basculerait à
 * moitié (nom de l'entité, SIRET de l'organisme) produirait une facture non conforme et
 * trompeuse. Ces tests portent sur le calcul réel (`nextNumberForEmitter`) et sur le code des
 * contrôleurs, là où le patron se reproduirait.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..');
const net = (f) => fs.readFileSync(path.join(DIR, f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

const { nextNumberForEmitter } = require('../lib/emitter.js');

// --- La numérotation par émettrice ----------------------------------------------------------

test('chaque émettrice numérote depuis SA séquence, avec SON préfixe', async () => {
    // Une requête factice qui note l'UPDATE du compteur au lieu de toucher une base.
    const updates = [];
    const conn = { query: async (sql, args) => { updates.push({ sql, args }); return [[], []]; } };
    const an = new Date().getFullYear();

    const n1 = await nextNumberForEmitter(conn, { id: 'A', invoice_prefix: 'BQ', next_number: 41 });
    assert.strictEqual(n1, `BQ-${an}-0041`, 'préfixe et compteur de l\'entité');

    const n2 = await nextNumberForEmitter(conn, { id: 'B', invoice_prefix: 'F', next_number: 7 });
    assert.strictEqual(n2, `F-${an}-0007`, 'une autre entité, son propre préfixe et compteur');

    // Le compteur de CHAQUE entité est incrémenté, isolément.
    assert.deepStrictEqual(updates.map((u) => u.args), [[42, 'A'], [8, 'B']],
        'le compteur incrémenté ne doit toucher que l\'entité concernée');
});

test('l\'incrément précède l\'insertion, pour que deux ventes ne lisent pas le même numéro', () => {
    // On réserve le numéro (UPDATE) dans nextNumberForEmitter lui-même, pas après coup.
    const src = net('lib/emitter.js');
    const fn = src.slice(src.indexOf('async function nextNumberForEmitter'));
    assert.ok(fn.indexOf('UPDATE billing_profile SET next_number') < fn.indexOf('return number'),
        'le compteur doit être réservé avant de rendre le numéro');
});

// --- Le vendeur bascule sur l'émettrice -----------------------------------------------------

test('le vendeur de la facture est l\'émettrice si elle en porte une', () => {
    // loadInvoiceData lit l'émettrice AVANT de construire l'identité vendeur, et retombe sur
    // l'organisme sinon. Les deux partagent les noms de colonnes : tout ce qui suit bascule.
    const src = net('controllers/invoice.controller.js');
    const bloc = src.slice(src.indexOf('loadEmitter(conn, orgId, inv.billing_profile_id)'));
    assert.match(bloc.slice(0, 120), /const o = emetteur \|\| org \|\| \{\}/,
        'l\'identité vendeur ne bascule pas sur l\'émettrice');
});

test('le XML et le PDF prennent la MÊME identité — celle de l\'émettrice', () => {
    // Le XML lit data.seller (rempli depuis `o`, donc l'émettrice) ; le modèle PDF prend la même
    // identité pour ses jetons field:organization.*. Les deux ne doivent pas diverger : un PDF au
    // nom de l'entité avec un SIRET d'organisme dans le XML serait le pire des deux mondes.
    const src = net('controllers/invoice.controller.js');
    assert.match(src, /const identite = \(data\.emitter && data\.emitter\.legal_name\) \? data\.emitter : \(org \|\| \{\}\)/,
        'le modèle PDF ne prend pas l\'identité de l\'émettrice');
    assert.match(src, /invoiceCtx\(identite, data\)/, 'le contexte de rendu n\'utilise pas l\'identité résolue');
});

test('l\'émettrice choisit son modèle de facture en priorité', () => {
    const src = net('controllers/invoice.controller.js');
    assert.match(src, /const slugEmetteur = data\.emitter && data\.emitter\.default_template_slug/,
        'le modèle propre à l\'émettrice n\'est pas pris en compte');
    assert.match(src, /const slugChoisi = slugEmetteur \|\| slug/, 'le modèle de l\'émettrice ne prime pas sur le réglage');
});

// --- La numérotation est routée par l'émettrice dans les deux flux ---------------------------

test('la facture manuelle numérote par l\'émettrice quand il y en a une', () => {
    const src = net('controllers/invoice.controller.js');
    const bloc = src.slice(src.indexOf('const createInvoice'));
    assert.match(bloc, /resolveEmitter\(conn, req\.user\.organization_id, req\.body\.billing_profile_id\)/,
        'createInvoice ne résout pas l\'émettrice');
    assert.match(bloc, /number = await nextNumberForEmitter\(conn, emetteur\)/,
        'le numéro ne vient pas de la séquence de l\'émettrice');
});

test('la vente en caisse numérote par l\'émettrice quand il y en a une', () => {
    const src = net('controllers/sale.controller.js');
    assert.match(src, /resolveEmitter\(conn, orgId, req\.body\.billing_profile_id\)/, 'checkout ne résout pas l\'émettrice');
    assert.match(src, /number = await nextNumberForEmitter\(conn, emetteur\)/,
        'la vente ne numérote pas par l\'émettrice');
    // La colonne billing_profile_id n'est écrite que si elle existe (migration 113).
    assert.match(src, /if \(hasInvEmitter\) \{ iCol\.push\('billing_profile_id'\)/,
        'billing_profile_id n\'est pas conditionné à l\'existence de la colonne');
});

// --- Le CRUD garde les identités réelles et distinctes --------------------------------------

test('une émettrice sans raison sociale est refusée', () => {
    // Une identité de vendeur DOIT porter une raison sociale : c'est BT-27 et la ligne d'en-tête.
    const src = net('controllers/billingProfile.controller.js');
    const fn = src.slice(src.indexOf('function preparer'));
    assert.match(fn.slice(0, 400), /if \(!legalName\)/, 'la raison sociale n\'est pas exigée');
});

test('deux émettrices ne peuvent pas partager un préfixe de numérotation', () => {
    // La contrainte uq_billing_prefix + le message dédié : deux séquences au même préfixe se
    // heurteraient sur l'unicité du numéro de facture.
    const mig = fs.readFileSync(path.join(DIR, '..', '..', 'database', 'migrations', '113_billing_profile.sql'), 'utf8');
    assert.match(mig, /UNIQUE KEY uq_billing_prefix \(organization_id, invoice_prefix\)/, 'préfixe non unique');
    const src = net('controllers/billingProfile.controller.js');
    assert.match(src, /ER_DUP_ENTRY/, 'le doublon de préfixe n\'est pas rattrapé en message lisible');
});

test('supprimer une émettrice ne supprime pas les factures émises', () => {
    // ON DELETE SET NULL : une pièce comptable survit aux tiers qu'elle nomme, PDF et numéro figés.
    const mig = fs.readFileSync(path.join(DIR, '..', '..', 'database', 'migrations', '113_billing_profile.sql'), 'utf8');
    assert.match(mig, /fk_invoice_billing FOREIGN KEY \(billing_profile_id\)[\s\S]*ON DELETE SET NULL/,
        'la facture doit survivre à la suppression de son émettrice');
});

test('la première émettrice devient le défaut', () => {
    // Sans défaut, une facture ne saurait pas sous quel nom sortir ; exiger un choix dès la
    // première serait un piège.
    const src = net('controllers/billingProfile.controller.js');
    assert.match(src, /n === 0 \? 1 : 0/, 'la première entité n\'est pas promue défaut');
});

// --- Fonctionnement dégradé sans la migration -----------------------------------------------

test('sans la migration 113, tout retombe sur l\'organisme sans échouer', () => {
    // Chaque helper avale l'absence de table/colonne ; la liste renvoie vide, les inserts se
    // font sans billing_profile_id. Une base pas encore migrée ne doit rien casser.
    const emit = net('lib/emitter.js');
    assert.match(emit, /const isMissingSchema = \(e\) =>/, 'pas de garde de schéma manquant');
    assert.match(emit, /if \(isMissingSchema\(e\)\) return null/, 'loadEmitter ne dégrade pas');
    const ctrl = net('controllers/billingProfile.controller.js');
    assert.match(ctrl, /if \(isMissingSchema\(e\)\) return res\.json\(\{ data: \[\] \}\)/,
        'la liste ne dégrade pas en liste vide');
});
