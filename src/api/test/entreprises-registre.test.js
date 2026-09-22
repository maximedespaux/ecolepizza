/**
 * LES FICHES ENTREPRISE PASSÉES AU REGISTRE : complétées, ou supprimées (demandé le 2026-09-22).
 *
 * « Vérifie chaque entreprise : si tu ne trouves rien, supprime-la ; sinon complète-la. S'il y a
 * déjà quelqu'un de rattaché, n'y touche pas. » La décision : src/api/lib/registreEntreprises.js ;
 * les lectures et les écritures : database/tools/completer-entreprises.js.
 *
 * Ce fichier gèle ce qui, s'il cédait, DÉTRUIRAIT des données sans que personne le voie :
 *   · une fiche rattachée (stagiaire, inscription, facture, document, vente, compte de
 *     représentant, cachet, référent stagiaire) n'est ni complétée ni supprimée — elle ne part même
 *     pas au registre. Les clés étrangères sont en ON DELETE SET NULL : la supprimer ne lèverait
 *     aucune erreur, elle détacherait ses factures en silence ;
 *   · une panne du registre n'est jamais un « introuvable » ;
 *   · sans SIRET, on ne complète que sans ambiguïté ; sinon, un humain tranche ;
 *   · on ne remplit que ce qui est vide ;
 *   · l'essai n'écrit rien ; l'application sauvegarde AVANT d'écrire, n'écrit que le plan relu, et
 *     saute ce qui a bougé depuis ; la restauration remet exactement ce qui était là.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const reg = require('../lib/registreEntreprises.js');

// ── Des réponses du registre, à la forme de l'API (recherche-entreprises.api.gouv.fr) ─────
const etab = (o = {}) => ({
    siret: '11111111100011', adresse: '12 RUE DU FOUR 65300 LANNEMEZAN', numero_voie: '12', type_voie: 'RUE',
    libelle_voie: 'DU FOUR', code_postal: '65300', libelle_commune: 'LANNEMEZAN', etat_administratif: 'A',
    est_siege: true, liste_enseignes: null, nom_commercial: null, ...o,
});
const unite = (o = {}, e = etab()) => ({
    siren: e.siret.slice(0, 9), nom_complet: 'LE NAPOLI', nom_raison_sociale: 'LE NAPOLI', sigle: null,
    nature_juridique: '5499', activite_principale: '56.10C', date_creation: '2015-02-03', etat_administratif: 'A',
    siege: e, matching_etablissements: [e],
    dirigeants: [{ type_dirigeant: 'personne physique', qualite: 'Gérant', nom: 'MARTIN', prenoms: 'PAUL ANDRÉ' }], ...o,
});
const rep = (...results) => ({ results, total_results: results.length });
/** Un registre figé : `table(params)` → réponse ; les appels sont gardés. */
function figé(table) {
    const appels = [];
    const f = async (p) => { appels.push(p); return table(p) || rep(); };
    f.appels = appels;
    return f;
}
const enPanne = async () => { throw new Error('connect ETIMEDOUT'); };

// ── Les règles ────────────────────────────────────────────────────────────────────────────

test('le même nom, à la forme juridique, à l\'article et au métier près — pas au-delà', () => {
    assert.ok(reg.memesNoms('SARL Le Napoli', 'LE NAPOLI'));
    assert.ok(reg.memesNoms('Pizzeria Le Napoli', 'LE NAPOLI'), 'le registre connaît l\'enseigne sans « Pizzeria »');
    assert.ok(reg.memesNoms('La Pizzeria', 'LA PIZZERIA'), 'un nom fait de mots du métier se compare tel quel');
    assert.ok(reg.memesNoms('Pâtisserie Étoile', 'ETOILE'));
    assert.ok(!reg.memesNoms('Pizza Mario', 'Pizza Luigi'));
    assert.ok(!reg.memesNoms('La Pizzeria', 'Pizzeria Mario'));
    assert.strictEqual(reg.villeNormalisee('St-Gaudens Cedex'), 'SAINT GAUDENS');
    assert.deepStrictEqual(reg.identifiant('421 415 803 00137'), { type: 'siret', valeur: '42141580300137' });
    assert.deepStrictEqual(reg.identifiant('421.415.803'), { type: 'siren', valeur: '421415803' });
    assert.strictEqual(reg.identifiant('en cours'), null);
});

test('ce que le registre apporte, au format du formulaire entreprise', () => {
    assert.deepStrictEqual(reg.champsDuRegistre(unite(), etab()), {
        siret: '11111111100011', naf_ape: '5610C', address: '12 RUE DU FOUR', zip_code: '65300', town: 'LANNEMEZAN',
        legal_status: 'SARL', date_creation: '2015-02-03', representative_name: 'PAUL MARTIN', representative_role: 'Gérant(e)',
    });
    const formes = { 1000: 'EI', 5498: 'EURL', 5499: 'SARL', 5710: 'SAS', 5720: 'SASU', 5599: 'SA', 6540: 'SCI', 9220: 'Association', 5202: 'Autre' };
    for (const [code, forme] of Object.entries(formes)) assert.strictEqual(reg.formeJuridique(code), forme, code);
    // L'entrepreneur individuel est son propre référent.
    const ei = unite({ nature_juridique: '1000', dirigeants: [{ type_dirigeant: 'personne physique', qualite: null, nom: 'DURAND', prenoms: 'LÉA' }] });
    assert.deepStrictEqual(reg.referent(ei), { representative_name: 'LÉA DURAND', representative_role: "Chef(fe) d'entreprise" });
    // Une holding présidente n'est pas un référent qu'on joint ; un commissaire aux comptes non plus.
    const sas = unite({ nature_juridique: '5710', dirigeants: [
        { type_dirigeant: 'personne morale', qualite: 'Président', denomination: 'HOLDING X' },
        { type_dirigeant: 'personne physique', qualite: 'Commissaire aux comptes titulaire', nom: 'AUDIT', prenoms: 'JEAN' },
    ] });
    assert.strictEqual(reg.referent(sas), null);
    // Une adresse masquée (opposition à la diffusion) n'est pas une adresse.
    const masque = etab({ adresse: '[NON-DIFFUSIBLE]', numero_voie: null, type_voie: null, libelle_voie: '[NON-DIFFUSIBLE]' });
    assert.ok(!('address' in reg.champsDuRegistre(unite({}, masque), masque)));
});

test('on ne remplit que ce qui est vide — et le SIRET seulement s\'il n\'en était pas un', () => {
    const champs = reg.champsDuRegistre(unite(), etab());
    const c = reg.aCompleter({ name: 'Le Napoli', address: '3 place du Marché', town: '  ', siret: '' }, champs);
    assert.ok(!('address' in c), 'l\'adresse saisie par l\'école reste la sienne');
    assert.strictEqual(c.town, 'LANNEMEZAN');
    assert.strictEqual(c.siret, '11111111100011');
    assert.strictEqual(reg.aCompleter({ siret: 'en cours' }, champs).siret, '11111111100011', '« en cours » n\'est pas un numéro');
    assert.strictEqual(reg.aCompleter({ siret: '111 111 111' }, champs).siret, '11111111100011', 'le SIRET prolonge le SIREN saisi');
    assert.ok(!('siret' in reg.aCompleter({ siret: '22222222200022' }, champs)), 'un autre numéro n\'est jamais remplacé');
    // La fonction ne s'écrit qu'avec le nom : « Gérant(e) » à côté du référent de l'école le dirait gérant à tort.
    const r = reg.aCompleter({ representative_name: 'MARIE DURAND', representative_role: '' }, champs);
    assert.ok(!('representative_name' in r) && !('representative_role' in r));
});

test('la décision, fiche par fiche', async () => {
    const cas = async (entreprise, table) => reg.analyser(entreprise, figé(table));
    const parSiret = (siret, r) => (p) => (p.q === siret ? rep(r) : null);

    let d = await cas({ name: 'Le Napoli', siret: '11111111100011', phone: '05 00' }, parSiret('11111111100011', unite()));
    assert.strictEqual(d.action, 'completer');
    assert.strictEqual(d.champs.naf_ape, '5610C');

    d = await cas({ name: 'Le Napoli', siret: '11111111100011' }, parSiret('11111111100011', unite({ etat_administratif: 'C' })));
    assert.strictEqual(d.action, 'supprimer', 'radiée : supprimée (réponse de l\'utilisateur)');

    const ferme = etab({ etat_administratif: 'F' });
    d = await cas({ name: 'Le Napoli', siret: '11111111100011' }, parSiret('11111111100011', unite({ siege: etab({ siret: '11111111100029' }) }, ferme)));
    assert.strictEqual(d.action, 'a_verifier', 'un établissement fermé n\'est pas une entreprise fermée');

    d = await cas({ name: 'Garage Dupuy', siret: '11111111100011' }, parSiret('11111111100011', unite()));
    assert.strictEqual(d.action, 'a_verifier', 'un SIRET qui désigne une autre entreprise');

    d = await cas({ name: 'Le Napoli', siret: '99999999900099', zip_code: '65300' }, (p) => (p.code_postal ? rep(unite()) : null));
    assert.strictEqual(d.action, 'a_verifier', 'un SIRET faux ne se corrige pas tout seul, même si le nom est trouvé');
    d = await cas({ name: 'Le Napoli', siret: '99999999900099', zip_code: '65300' }, () => null);
    assert.strictEqual(d.action, 'supprimer');

    d = await cas({ name: 'Le Napoli', siret: '111111111' }, (p) => (p.q === '111111111' ? rep(unite()) : null));
    assert.strictEqual(d.action, 'completer');
    assert.strictEqual(d.champs.siret, '11111111100011', 'le SIREN devient le SIRET du siège');
});

test('sans SIRET : compléter sans ambiguïté, sinon laisser à un humain', async () => {
    const cas = async (entreprise, table) => { const f = figé(table); return { d: await reg.analyser(entreprise, f), appels: f.appels }; };
    const fiche = { name: 'Pizzeria Le Napoli', zip_code: '65300' };

    // Une seule entreprise active de ce nom ici (deux établissements) : complétée, SIRET compris.
    const e2 = etab({ siret: '11111111100029', est_siege: false });
    let { d } = await cas(fiche, () => rep(unite({ matching_etablissements: [etab(), e2] })));
    assert.strictEqual(d.action, 'completer');
    assert.match(d.champs.siret, /^111111111000/);

    ({ d } = await cas(fiche, () => rep(unite(), unite({ nom_complet: 'NAPOLI', nom_raison_sociale: 'NAPOLI' }, etab({ siret: '22222222200022' })))));
    assert.strictEqual(d.action, 'a_verifier', 'deux entreprises actives de ce nom ici');
    assert.strictEqual(d.candidats.length, 2);

    ({ d } = await cas(fiche, () => rep(unite({ etat_administratif: 'C' }, etab({ etat_administratif: 'F' })))));
    assert.strictEqual(d.action, 'supprimer', 'le seul de ce nom ici est radié');

    ({ d } = await cas(fiche, (p) => (p.code_postal ? rep(unite({ nom_complet: 'NAPOLI GRILL', nom_raison_sociale: 'NAPOLI GRILL' })) : null)));
    assert.strictEqual(d.action, 'a_verifier', 'un nom VOISIN au même endroit');

    ({ d } = await cas(fiche, (p) => (p.code_postal ? null : rep(unite({}, etab({ code_postal: '31000', libelle_commune: 'TOULOUSE' }))))));
    assert.strictEqual(d.action, 'a_verifier', 'le même nom, ailleurs');

    let appels;
    ({ d, appels } = await cas(fiche, () => null));
    assert.strictEqual(d.action, 'supprimer');
    assert.deepStrictEqual(appels, [{ q: 'Pizzeria Le Napoli', code_postal: '65300' }, { q: 'Pizzeria Le Napoli' }],
        'introuvable ici ET ailleurs, avant de conclure');

    ({ d } = await cas({ name: 'Le Napoli' }, () => rep(unite())));
    assert.strictEqual(d.action, 'a_verifier', 'ni code postal ni ville : rien ne permet de trancher');

    ({ d, appels } = await cas({ name: 'd' }, () => null));
    assert.strictEqual(d.action, 'supprimer');
    assert.strictEqual(appels.length, 0, 'un nom d\'une lettre ne se cherche pas');
});

test('une panne du registre n\'est JAMAIS un « introuvable »', async () => {
    for (const fiche of [{ name: 'Le Napoli', siret: '11111111100011' }, { name: 'Le Napoli', zip_code: '65300' }, { name: 'Le Napoli' }]) {
        const d = await reg.analyser(fiche, enPanne);
        assert.strictEqual(d.action, 'erreur', JSON.stringify(fiche));
    }
});

// ── L'outil, sur une fausse base ────────────────────────────────────────────────────────────

const COLS = [['id', 'uuid'], ['organization_id', 'uuid'], ['user_id', 'uuid'], ['stamp', 'mediumtext'], ['name', 'varchar'],
    ['siret', 'varchar'], ['naf_ape', 'varchar'], ['address', 'varchar'], ['zip_code', 'varchar'], ['town', 'varchar'],
    ['email', 'varchar'], ['phone', 'varchar'], ['opco', 'varchar'], ['legal_status', 'varchar'], ['representative_civ', 'varchar'],
    ['representative_name', 'varchar'], ['representative_role', 'varchar'], ['created_at', 'timestamp'], ['vat_number', 'varchar'],
    ['date_creation', 'date']];
const COLS_LIENS = ['learner.company_id', 'learner.email', 'enrollment.company_id', 'invoice.company_id', 'generated_document.company_id',
    'material_sale.company_id'];
let base;
const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ligne = (c) => Object.fromEntries(COLS.map(([k]) => [k, c[k] ?? null]));
const vide = (v) => v == null || String(v).trim() === '';

function nouvelleBase() {
    const fiche = (o) => ({ ...Object.fromEntries(COLS.map(([k]) => [k, null])), organization_id: 'o1', created_at: '2026-08-21 10:00:00', _liens: new Set(), ...o });
    return {
        orgs: [{ id: 'o1', code: 'EPJJD', legal_name: 'ECOLE PIZZA' }],
        requetes: [],
        ecritures: [],
        dossier: null,
        entreprises: [
            fiche({ id: 'napoli', name: 'Le Napoli', siret: '11111111100011', phone: '05 62 00 00 00' }),
            fiche({ id: 'stagiaires', name: 'Chez Stagiaire', _liens: new Set(['stagiaires']) }),
            fiche({ id: 'factures', name: 'Facturée', _liens: new Set(['factures']) }),
            fiche({ id: 'referent', name: 'Référent', email: 'ref@exemple.fr', _liens: new Set(['référent stagiaire']) }),
            fiche({ id: 'cachet', name: 'Cachet', stamp: 'data:image/png;base64,AAAA', _liens: new Set(['cachet']) }),
            fiche({ id: 'fantome', name: 'Pizza Fantome', zip_code: '65300', date_creation: null, created_at: '2025-01-02 03:04:05' }),
            fiche({ id: 'panne', name: 'Pizza Panne', zip_code: '65300' }),
        ],
    };
}
const garde = (sql) => {
    const dispo = require('../../../database/tools/completer-entreprises.js').ATTACHES.filter(([, col]) => col.startsWith('company.') || COLS_LIENS.includes(col));
    return dispo.every(([, , s]) => sql.includes(`NOT ${s}`));
};
const faux = {
    promise: () => ({
        query: async (sql, params = []) => {
            const q = sql.replace(/\s+/g, ' ').trim();
            base.requetes.push(q);
            if (/^(UPDATE|DELETE|INSERT)/.test(q)) {
                base.ecritures.push({ q, sauvegardeDejaEcrite: !!base.dossier && fs.readdirSync(base.dossier).some((f) => f.startsWith('sauvegarde-')), garde: garde(q) });
            }
            if (/information_schema\.columns WHERE table_schema = DATABASE\(\) AND table_name IN/.test(q)) {
                return [[...COLS.map(([c]) => ({ t: 'company', c })), ...COLS_LIENS.map((x) => { const [t, c] = x.split('.'); return { t, c }; })]];
            }
            if (/information_schema\.columns WHERE table_schema = DATABASE\(\) AND table_name = 'company'/.test(q)) return [COLS.map(([c, t]) => ({ c, t }))];
            if (/^SELECT id, code, legal_name FROM organization/.test(q)) return [base.orgs];
            if (/^SELECT id FROM organization WHERE id = \?/.test(q)) return [base.orgs.filter((o) => o.id === params[0])];
            if (/FROM company c WHERE c\.organization_id = \? ORDER BY c\.name$/.test(q)) {
                const { ATTACHES } = require('../../../database/tools/completer-entreprises.js');
                const index = ATTACHES.map(([nom, , s]) => [nom, new RegExp(`${echapper(s)} AS lien_(\\d+)`).exec(q)]).filter(([, m]) => m);
                return [base.entreprises.filter((c) => c.organization_id === params[0])
                    .map((c) => ({ ...ligne(c), ...Object.fromEntries(index.map(([nom, m]) => [`lien_${m[1]}`, c._liens.has(nom) ? 1 : 0])) }))];
            }
            if (/FROM company c WHERE c\.organization_id = \? AND c\.id IN \(\?\)$/.test(q)) {
                return [base.entreprises.filter((c) => c.organization_id === params[0] && params[1].includes(c.id)).map(ligne)];
            }
            let m = /^DELETE c FROM company c WHERE c\.id = \? AND c\.organization_id = \? AND /.exec(q);
            if (m) {
                const i = base.entreprises.findIndex((c) => c.id === params[0] && c.organization_id === params[1] && !c._liens.size);
                if (i >= 0) base.entreprises.splice(i, 1);
                return [{ affectedRows: i >= 0 ? 1 : 0 }];
            }
            m = /^UPDATE company c SET c\.`(\w+)` = \? WHERE c\.id = \? AND c\.organization_id = \? AND (c\.siret = \?|\(c\.`\w+` IS NULL OR TRIM\(c\.`\w+`\) = ''\)) AND /.exec(q);
            if (m) {
                const c = base.entreprises.find((x) => x.id === params[1] && x.organization_id === params[2] && !x._liens.size);
                const ok = c && (m[2] === 'c.siret = ?' ? c.siret === params[3] : vide(c[m[1]]));
                if (ok) c[m[1]] = params[0];
                return [{ affectedRows: ok ? 1 : 0 }];
            }
            if (/^SELECT id FROM company WHERE id = \?$/.test(q)) return [base.entreprises.filter((c) => c.id === params[0]).map((c) => ({ id: c.id }))];
            m = /^INSERT INTO company \(([^)]+)\) VALUES/.exec(q);
            if (m) {
                const cols = m[1].split(',').map((x) => x.trim().replace(/`/g, ''));
                base.entreprises.push({ ...Object.fromEntries(COLS.map(([k]) => [k, null])), ...Object.fromEntries(cols.map((k, i) => [k, params[i]])), _liens: new Set() });
                return [{ affectedRows: 1 }];
            }
            m = /^UPDATE company SET `(\w+)` = \? WHERE id = \? AND `\w+` <=> \?$/.exec(q);
            if (m) {
                const c = base.entreprises.find((x) => x.id === params[1]);
                const ok = c && (c[m[1]] ?? null) === (params[2] ?? null);
                if (ok) c[m[1]] = params[0];
                return [{ affectedRows: ok ? 1 : 0 }];
            }
            throw new Error(`requête inattendue : ${q.slice(0, 120)}`);
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, []); },
    end: async () => {},
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };
const outil = require('../../../database/tools/completer-entreprises.js');

/* Le registre de la fausse base : le Napoli existe, le fantôme non, la panne ne répond pas. */
const registreBanc = () => figé((p) => {
    if (/Panne/.test(p.q)) throw new Error('HTTP 503');
    if (p.q === '11111111100011') return rep(unite());
    return null;
});
const dossierTemp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'entreprises-'));

test('l\'essai : une fiche rattachée ne part même pas au registre, et rien ne s\'écrit', async () => {
    base = nouvelleBase();
    const chercher = registreBanc();
    const plan = await outil.essai(faux.promise(), { organisme: base.orgs[0], chercher });
    const par = Object.fromEntries(plan.entreprises.map((e) => [e.id, e]));
    for (const id of ['stagiaires', 'factures', 'referent', 'cachet']) {
        assert.strictEqual(par[id].action, 'rattachee', id);
    }
    assert.deepStrictEqual(par.referent.attaches, ['référent stagiaire']);
    const demandes = JSON.stringify(chercher.appels);
    for (const nom of ['Chez Stagiaire', 'Facturée', 'Référent', 'Cachet']) assert.ok(!demandes.includes(nom), `${nom} : pas envoyée au registre`);
    assert.strictEqual(par.napoli.action, 'completer');
    assert.ok(!('phone' in par.napoli.champs) && par.napoli.champs.address === '12 RUE DU FOUR');
    assert.strictEqual(par.fantome.action, 'supprimer');
    assert.strictEqual(par.panne.action, 'erreur', 'une panne ne supprime rien');
    assert.ok(par.napoli.empreinte && par.fantome.empreinte);
    assert.strictEqual(base.ecritures.length, 0, 'l\'essai n\'écrit RIEN');
    const texte = outil.rapport(plan);
    assert.match(texte, /4 rattachées : on n'y touche pas \(stagiaires 1, factures 1, cachet 1, référent stagiaire 1\)/);
    assert.match(texte, /1 à supprimer \(1 introuvables, 0 fermées\)/);
    assert.match(texte, /Pizza Fantome — 65300 — introuvable au registre/);
    assert.match(texte, /Le Napoli → NAF 5610C/);
});

test('l\'application : la sauvegarde d\'abord, puis le plan seul, sous garde', async () => {
    base = nouvelleBase();
    const plan = await outil.essai(faux.promise(), { organisme: base.orgs[0], chercher: registreBanc() });
    base.dossier = dossierTemp();
    try {
        const { bilan, sauvegarde } = await outil.appliquer(faux.promise(), { plan, dossier: base.dossier });
        assert.deepStrictEqual(bilan.supprimees.map((e) => e.id), ['fantome']);
        assert.deepStrictEqual(bilan.completees.map((e) => e.id), ['napoli']);
        assert.ok(base.ecritures.length > 0 && base.ecritures.every((w) => w.sauvegardeDejaEcrite), 'aucune écriture avant la sauvegarde');
        assert.ok(base.ecritures.every((w) => w.garde), 'chaque écriture reverifie TOUTES les attaches');
        assert.strictEqual(fs.statSync(sauvegarde).mode & 0o777, 0o600, 'noms et adresses : lisible par son seul propriétaire');
        const s = JSON.parse(fs.readFileSync(sauvegarde, 'utf8'));
        assert.deepStrictEqual(s.entreprises.map((e) => e.id).sort(), ['fantome', 'napoli'], 'seules les fiches visées');
        const napoli = base.entreprises.find((c) => c.id === 'napoli');
        assert.strictEqual(napoli.phone, '05 62 00 00 00', 'ce que l\'école a saisi reste');
        assert.strictEqual(napoli.town, 'LANNEMEZAN');
        assert.ok(base.entreprises.some((c) => c.id === 'panne'), 'en erreur : pas touchée');
        for (const id of ['stagiaires', 'factures', 'referent', 'cachet']) assert.ok(base.entreprises.some((c) => c.id === id), id);
    } finally { fs.rmSync(base.dossier, { recursive: true, force: true }); }
});

test('une fiche modifiée, ou rattachée, depuis l\'essai est sautée', async () => {
    base = nouvelleBase();
    const plan = await outil.essai(faux.promise(), { organisme: base.orgs[0], chercher: registreBanc() });
    base.entreprises.find((c) => c.id === 'napoli').phone = '06 00 00 00 00'; // corrigée à la main entre-temps
    base.entreprises.find((c) => c.id === 'fantome')._liens.add('stagiaires'); // un stagiaire y a été rattaché
    base.dossier = dossierTemp();
    try {
        const { bilan } = await outil.appliquer(faux.promise(), { plan, dossier: base.dossier });
        assert.deepStrictEqual(bilan.sautees.map((e) => [e.id, e.raison]),
            [['napoli', 'modifiée depuis l\'essai'], ['fantome', 'rattachée depuis l\'essai']]);
        assert.ok(base.entreprises.some((c) => c.id === 'fantome'));
    } finally { fs.rmSync(base.dossier, { recursive: true, force: true }); }
});

test('un plan périmé, d\'une autre version ou d\'un autre organisme est refusé, sans rien écrire', async () => {
    base = nouvelleBase();
    const plan = await outil.essai(faux.promise(), { organisme: base.orgs[0], chercher: registreBanc() });
    base.dossier = dossierTemp();
    try {
        const dans8jours = new Date(Date.parse(plan.cree_le) + 8 * 86400000);
        await assert.rejects(outil.appliquer(faux.promise(), { plan, dossier: base.dossier, maintenant: dans8jours }), /plus de 7 jours/);
        await assert.rejects(outil.appliquer(faux.promise(), { plan: { ...plan, version: 99 }, dossier: base.dossier }), /autre version/);
        await assert.rejects(outil.appliquer(faux.promise(), { plan: { ...plan, organisme: { id: 'o2' } }, dossier: base.dossier }), /n'existe pas/);
        assert.strictEqual(base.ecritures.length, 0);
        assert.deepStrictEqual(fs.readdirSync(base.dossier), [], 'pas même une sauvegarde');
    } finally { fs.rmSync(base.dossier, { recursive: true, force: true }); }
});

test('la restauration remet la fiche supprimée à l\'identique, et retire ce qui a été ajouté', async () => {
    base = nouvelleBase();
    const avant = JSON.parse(JSON.stringify(base.entreprises.find((c) => c.id === 'fantome'), (k, v) => (k === '_liens' ? undefined : v)));
    const plan = await outil.essai(faux.promise(), { organisme: base.orgs[0], chercher: registreBanc() });
    base.dossier = dossierTemp();
    try {
        const { sauvegarde } = await outil.appliquer(faux.promise(), { plan, dossier: base.dossier });
        base.entreprises.find((c) => c.id === 'napoli').town = 'CAPVERN'; // corrigée à la main après coup
        const b = await outil.restaurer(faux.promise(), { sauvegarde: JSON.parse(fs.readFileSync(sauvegarde, 'utf8')) });
        assert.strictEqual(b.reinserees, 1);
        const remise = base.entreprises.find((c) => c.id === 'fantome');
        for (const [k] of COLS) assert.strictEqual(remise[k], avant[k], `fantôme · ${k}`);
        const napoli = base.entreprises.find((c) => c.id === 'napoli');
        assert.strictEqual(napoli.naf_ape, null, 'ce que le script avait ajouté est retiré');
        assert.strictEqual(napoli.town, 'CAPVERN', 'une correction faite depuis n\'est pas défaite');
    } finally { fs.rmSync(base.dossier, { recursive: true, force: true }); }
});

test('l\'appel au registre : au plus quatre par seconde, des reprises, puis une erreur', async () => {
    const attentes = [];
    const attendre = async (ms) => { attentes.push(ms); };
    const reponses = [{ ok: false, status: 429 }, { ok: false, status: 503 }, { ok: true, status: 200, json: async () => rep() }];
    let chercher = outil.registre({ fetchFn: async () => reponses.shift(), attendre });
    assert.deepStrictEqual(await chercher({ q: 'x' }), rep());
    assert.deepStrictEqual(attentes.filter((ms) => ms >= 1000), [1000, 2000], 'reprise sur 429 puis 503, en doublant');
    chercher = outil.registre({ fetchFn: async () => ({ ok: false, status: 500 }), attendre, essais: 3 });
    await assert.rejects(chercher({ q: 'x' }), /HTTP 500/);
    let n = 0;
    chercher = outil.registre({ fetchFn: async () => { n++; return { ok: false, status: 400 }; }, attendre });
    await assert.rejects(chercher({ q: 'x' }), /HTTP 400/);
    assert.strictEqual(n, 1, 'une requête refusée ne se répète pas');
});

test('lancé sans option, l\'outil fait l\'essai ; il ne réécrit jamais un fichier', () => {
    const SRC = fs.readFileSync(path.join(__dirname, '../../../database/tools/completer-entreprises.js'), 'utf8');
    const principal = SRC.slice(SRC.indexOf('if (require.main === module)'));
    assert.match(principal, /if \(process\.argv\.includes\('--restaurer'\)\) \{[\s\S]*\} else if \(process\.argv\.includes\('--appliquer'\)\) \{[\s\S]*\} else \{[\s\S]*await essai\(conn,/);
    assert.match(SRC, /fs\.writeFileSync\(f, [^;]*\{ mode: 0o600, flag: 'wx' \}\)/);
});
