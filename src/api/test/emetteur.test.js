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

const { nextNumberForEmitter, formatNumber } = require('../lib/emitter.js');

// --- Le format de numéro personnalisable ----------------------------------------------------

test('le gabarit compose le numéro comme demandé', () => {
    const d = new Date('2026-03-09T12:00:00');
    assert.strictEqual(
        formatNumber({ invoice_prefix: 'TXT', number_format: 'TXT.{YYYY}.901.{SEQ:4}' }, 1, d),
        'TXT.2026.901.0001', 'exemple de la demande');
    assert.strictEqual(
        formatNumber({ invoice_prefix: 'BQ', number_format: '{PREFIX}-{YY}{MM}-{SEQ:5}' }, 42, d),
        'BQ-2603-00042', 'préfixe, année courte, mois, séquence large');
});

test('un gabarit vide retombe sur la forme historique', () => {
    const d = new Date('2026-03-09T12:00:00');
    assert.strictEqual(formatNumber({ invoice_prefix: 'F', number_format: null }, 14, d), 'F-2026-0014');
    assert.strictEqual(formatNumber({ invoice_prefix: 'F', number_format: '   ' }, 14, d), 'F-2026-0014',
        'un format tout en espaces vaut vide');
});

test('un jeton inconnu reste visible, il n\'est pas escamoté', () => {
    // Une substitution silencieuse masquerait une faute de frappe ; on laisse le jeton en clair.
    const d = new Date('2026-03-09T12:00:00');
    assert.strictEqual(
        formatNumber({ invoice_prefix: 'X', number_format: 'FIXE-{INCONNU}-{SEQ}' }, 3, d),
        'FIXE-{INCONNU}-0003');
});

test('{SEQ} est exigé à l\'enregistrement : sans lui, des doublons', () => {
    // La seule part variable. Un format qui l'omet fabriquerait deux fois le même numéro. On
    // vérifie que `preparer` teste la présence de {SEQ} et refuse le format sinon.
    const src = net('controllers/billingProfile.controller.js');
    const fn = src.slice(src.indexOf('function preparer'), src.indexOf('const create'));
    assert.match(fn, /\.test\(fmt\)/, 'aucun test sur le format');
    assert.match(fn, /SEQ/, 'le jeton {SEQ} n\'est pas mentionné dans la validation');
    assert.match(fn, /doit contenir \{SEQ\}/, 'pas de message qui exige {SEQ}');
});


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

// --- L'émettrice se suffit à elle-même (114) ------------------------------------------------

test('la caisse prend TVA et moyens de paiement de l\'émettrice choisie', () => {
    // Une société peut être exonérée quand une autre ne l'est pas : la TVA suit l'entité, avec
    // repli sur le réglage boutique.
    const src = net('controllers/sale.controller.js');
    assert.match(src, /const tvaApplies = emetteur \? !!emetteur\.tva_applies : !!settings\.tva_applies/,
        'la TVA ne suit pas l\'émettrice');
});

test('la première émettrice est semée depuis l\'organisme', () => {
    // L'organisme EST déjà un émetteur ; on recopie son identité une fois plutôt que de la faire
    // ressaisir. Une COPIE, pas un lien — une facture fige l'identité de son émetteur.
    const src = net('controllers/billingProfile.controller.js');
    assert.match(src, /function seedFromOrganization/, 'pas de semis depuis l\'organisme');
    const seed = src.slice(src.indexOf('function seedFromOrganization'));
    assert.match(seed.slice(0, 700), /FROM organization WHERE id = \?/, 'le semis ne lit pas l\'organisme');
    assert.match(seed.slice(0, 900), /INSERT INTO billing_profile/, 'le semis n\'insère rien');
    // Semé seulement quand il n'y en a aucune.
    const list = src.slice(src.indexOf('const list ='));
    assert.match(list.slice(0, 600), /if \(rows\.length === 0\)[\s\S]{0,80}seedFromOrganization/,
        'le semis ne se déclenche pas sur une liste vide');
});

test('la facturation n\'a plus de réglage global doublon (ShopSettings retiré)', () => {
    // Tout tient sur l'émettrice : numérotation, TVA, paiement, modèle. Le composant global a
    // disparu pour qu'il n'existe pas deux endroits pour la même question.
    const p = path.join(DIR, '..', 'app/ui/components/ShopSettings.jsx');
    assert.ok(!fs.existsSync(p), 'ShopSettings.jsx aurait dû être supprimé');
    const page = fs.readFileSync(path.join(DIR, '..', 'app/ui/pages/FacturationReglages.jsx'), 'utf8');
    assert.doesNotMatch(page, /ShopSettings/, 'la page référence encore ShopSettings');
    assert.match(page, /BillingProfiles/, 'la page ne montre plus les émettrices');
});

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
