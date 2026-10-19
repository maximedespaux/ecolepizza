/**
 * CONDITIONS SUR LES PIÈCES À FOURNIR ET LES DOCUMENTS REMIS (migration 209, demandé le 2026-10-19).
 *
 * Un DOCUMENT a sa condition d'application au niveau du TYPE (document_template.applies_when) : il
 * n'entre dans le parcours d'un dossier que si la condition est vraie. On a donné la MÊME chose aux
 * pièces à fournir (piece_type) et aux documents remis (remise_type), via une condition DE TYPE
 * portée par l'étape dans `cond_type` (en plus de la condition PAR FORMATION, `applies_when`).
 *
 * On gèle ici le CŒUR : le `passes()` de `resoudreVariantes` (pur, sans base) évalue MAINTENANT la
 * condition de type. Le défaut d'avant : une pièce/remise conditionnée restait proposée à tous les
 * dossiers (cond_type ignoré). Les deux conditions (type ET formation) doivent tenir — union, comme
 * `matchCustom` l'exige pour un document.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { resoudreVariantes, resoudreVariantesEntreprise } = require('../controllers/formationProgram.controller.js');
const { appliesWhenConditions } = require('../lib/conditions.js');
const lireSrc = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

// Une condition personnalisée « financement = CPF » (comme Modèles → Conditions).
const conds = new Map([
    ['cpf', { field: 'financing', op: 'eq', value: 'CPF' }],
    ['pro', { field: 'financing', op: 'eq', value: 'PROFESSIONNEL' }],
]);
const EQ = new Map(); // aucune équivalence d'organisme
const slugsOf = (out) => out.map((s) => s.slug);

test('une PIÈCE à condition de type n\'apparaît que si la condition du dossier est vraie', () => {
    const piece = { slug: 'piece:a', doc_type: 'PIECE', or_group: null, applies_when: {}, cond_type: { conditions: ['cpf'] }, active: true };
    assert.deepStrictEqual(slugsOf(resoudreVariantes([piece], { financing: 'CPF' }, conds, EQ)), ['piece:a'], 'dossier CPF ⇒ la pièce apparaît');
    assert.deepStrictEqual(slugsOf(resoudreVariantes([piece], { financing: 'PROFESSIONNEL' }, conds, EQ)), [], 'dossier non CPF ⇒ la pièce disparaît du parcours');
});

test('une REMISE à condition de type n\'apparaît que si la condition du dossier est vraie', () => {
    const remise = { slug: 'remise:a', doc_type: 'REMISE', or_group: null, applies_when: {}, cond_type: { conditions: ['cpf'] }, active: true };
    assert.deepStrictEqual(slugsOf(resoudreVariantes([remise], { financing: 'CPF' }, conds, EQ)), ['remise:a']);
    assert.deepStrictEqual(slugsOf(resoudreVariantes([remise], { financing: 'PARTICULIER' }, conds, EQ)), []);
});

test('condition de TYPE et condition PAR FORMATION se CUMULENT (les deux doivent tenir)', () => {
    // Type : CPF. Par formation : PROFESSIONNEL. Un financement est l'un OU l'autre : jamais les deux
    // ensemble → la pièce n'apparaît pour aucun des deux dossiers (c'est l'UNION attendue).
    const piece = { slug: 'piece:a', doc_type: 'PIECE', or_group: null, applies_when: { conditions: ['pro'] }, cond_type: { conditions: ['cpf'] }, active: true };
    assert.deepStrictEqual(slugsOf(resoudreVariantes([piece], { financing: 'CPF' }, conds, EQ)), [], 'la condition PAR FORMATION (pro) n\'est pas remplie');
    assert.deepStrictEqual(slugsOf(resoudreVariantes([piece], { financing: 'PROFESSIONNEL' }, conds, EQ)), [], 'la condition DE TYPE (cpf) n\'est pas remplie');
});

test('sans condition de type (cond_type absent ou vide), rien ne change — comportement d\'avant', () => {
    const sansCond = { slug: 'piece:a', doc_type: 'PIECE', or_group: null, applies_when: {}, active: true }; // pas de cond_type
    assert.deepStrictEqual(slugsOf(resoudreVariantes([sansCond], { financing: 'X' }, conds, EQ)), ['piece:a']);
    const condVide = { slug: 'remise:b', doc_type: 'REMISE', or_group: null, applies_when: {}, cond_type: {}, active: true };
    assert.deepStrictEqual(slugsOf(resoudreVariantes([condVide], { financing: 'X' }, conds, EQ)), ['remise:b']);
});

test('ENTREPRISE : une remise ISOLÉE est filtrée par sa condition, un DOCUMENT reste (le vrai bug DBM)', () => {
    /* LE DÉFAUT (constaté le 2026-10-19, entreprise DBM) : le parcours d'un dossier arrivé PAR UNE
       ENTREPRISE passe par `resoudreVariantesEntreprise`, qui ne filtrait PAS les étapes isolées par
       leur condition (et court-circuitait même tout quand l'organisme n'a aucune équivalence). Les
       remises ne sont jamais en groupe « OU » → toujours isolées → les deux variantes AGEFICE et
       FAFCEA restaient présentes. Un DOCUMENT, lui, doit rester (la section entreprise est une liste
       explicite) — c'est la nuance à préserver. */
    const condsOpco = new Map([
        ['opco-agefice', { field: 'company.opco', op: 'eq', value: 'AGEFICE' }],
        ['opco-fafcea', { field: 'company.opco', op: 'eq', value: 'FAFCEA' }],
    ]);
    const remiseAgefice = { slug: 'remise:ag', doc_type: 'REMISE', applies_when: {}, cond_type: { conditions: ['opco-agefice'] } };
    const remiseFafcea = { slug: 'remise:fa', doc_type: 'REMISE', applies_when: {}, cond_type: { conditions: ['opco-fafcea'] } };
    const doc = { slug: 'convention', doc_type: 'CONVENTION', applies_when: { conditions: ['opco-fafcea'] } };
    const EQ = new Map(); // aucune équivalence, comme chez DBM — avant, ça court-circuitait tout le filtrage

    const out = resoudreVariantesEntreprise([remiseAgefice, remiseFafcea, doc], { 'company.opco': 'AGEFICE' }, condsOpco, EQ);
    assert.deepStrictEqual(out.map((s) => s.slug), ['remise:ag', 'convention'],
        'remise FAFCEA écartée (condition non remplie) ; remise AGEFICE gardée ; document gardé malgré sa condition (liste explicite)');
});

test('appliesWhenConditions : ce que le contrôleur STOCKE — {conditions:[…]} dédoublonné, ou null si vide', () => {
    assert.strictEqual(appliesWhenConditions({ conditions: ['a', 'b', 'a'] }), JSON.stringify({ conditions: ['a', 'b'] }), 'dédoublonné');
    assert.strictEqual(appliesWhenConditions({ conditions: ['  x  ', ''] }), JSON.stringify({ conditions: ['x'] }), 'trim + vides retirés');
    assert.strictEqual(appliesWhenConditions({ conditions: [] }), null, 'aucune condition ⇒ null (colonne NULL = toujours applicable)');
    assert.strictEqual(appliesWhenConditions({}), null);
    assert.strictEqual(appliesWhenConditions(null), null);
});

test('les contrôleurs écrivent applies_when, tolèrent l\'absence de colonne, et refusent (503) une condition sans la 209', () => {
    const piece = lireSrc('controllers/piece.controller.js');
    assert.match(piece, /applies_when: appliesWhenConditions\(/, 'pièce : condition normalisée dans champsType');
    assert.match(piece, /if \(f\.applies_when && !cond\) return res\.status\(503\)/, 'pièce : 503 si condition sans la colonne');
    assert.match(piece, /cols\.push\('applies_when'\)/, 'pièce : applies_when écrit quand la colonne existe');

    const remise = lireSrc('controllers/remise.controller.js');
    assert.match(remise, /applies_when: appliesWhenConditions\(/, 'remise : condition normalisée dans champsType');
    assert.match(remise, /if \(c\.applies_when && !avecCond\) return res\.status\(503\)/, 'remise : 503 si condition sans la colonne');
    assert.match(remise, /cols\.push\('applies_when'\)/, 'remise : applies_when écrit quand la colonne existe');
});

test('le parcours lit la condition DE TYPE (cond_type) pour les pièces ET les remises', () => {
    const fp = lireSrc('controllers/formationProgram.controller.js');
    const occ = (fp.match(/cond_type: parseAW\(/g) || []).length;
    assert.ok(occ >= 2, 'cond_type alimenté pour les pièces ET les remises (2 occurrences)');
    assert.match(fp, /matchCustom\(s\.cond_type, ctx, conds\)/, 'le passes() évalue la condition de type');
});

test('ENTREPRISE : resoudreVariantesEntreprise filtre les pièces/remises isolées, PAS les documents', () => {
    const fp = lireSrc('controllers/formationProgram.controller.js');
    // Le court-circuit « aucune équivalence → tout passe » est retiré (il sautait tout le filtrage).
    const fn = fp.slice(fp.indexOf('function resoudreVariantesEntreprise'), fp.indexOf('function resoudreVariantesEntreprise') + 2800);
    assert.doesNotMatch(fn, /if \(!eq \|\| !eq\.size\) return steps;/, 'plus de court-circuit qui sautait le filtrage');
    assert.match(fn, /doc_type !== 'PIECE' && s\.doc_type !== 'REMISE'/, 'un document reste (liste explicite), une pièce/remise est filtrée');
    assert.match(fn, /if \(gardee\(s\)\) out\.push\(s\)/, 'une étape isolée n\'est gardée que si sa condition passe (hors document)');
});

test('la liste « Documents remis » (remisesDuDossier) filtre par condition, garde les remises commencées, échoue OUVERT', () => {
    const src = lireSrc('controllers/remise.controller.js');
    assert.match(src, /filtrerParCondition\(conn, orgId, enrollmentId, candidats\)/, 'le filtre est appelé sur les candidates du dossier');
    // Une remise DÉJÀ commencée (un document existe) n'est jamais masquée — la preuve reste.
    assert.match(src, /candidats\.filter\(\(r\) => r\.remise_id/);
    // Filtrée par la condition de TYPE et de FORMATION (matchCustom), via les faits du dossier.
    assert.match(src, /matchCustom\(parseApplies\(r\.aw_type\), facts, condById\)/);
    assert.match(src, /matchCustom\(parseApplies\(r\.aw_step\), facts, condById\)/);
    // FAIL OPEN : une erreur de chargement des faits ne masque RIEN.
    assert.match(src, /catch \(e\) \{[\s\S]*?return candidats;/);
    // Les conditions sont lues dans la requête, gardées par colonneExiste (migration 209).
    assert.match(src, /awType = await colAppliesWhen\(conn\)/);
});
