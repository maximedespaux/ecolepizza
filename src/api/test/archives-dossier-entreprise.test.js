/**
 * AJOUTER DES FICHIERS AU DOSSIER D'UNE ENTREPRISE, et LES QCM IMPORTÉS DANS LE COFFRE — demandé le
 * 2026-10-06 : « dans Suivi Qualiopi, ajoute la possibilité d'ajouter des documents à une entreprise
 * comme au stagiaire, avec un petit + à côté ; et quand un document est importé, montre-le dans les
 * archives (pour les QCM aussi, qui ont désormais un PDF importé) ».
 *
 * CE QUE CES TESTS GÈLENT :
 *   · le « + » entreprise range ses fichiers SOUS l'entreprise (ref `fichier-co:<id>`), avec l'année /
 *     la semaine / la formation du nœud cliqué — comme les documents de groupe qu'on y voit ;
 *   · la requête du coffre résout `fichier-co:%` en entreprise (scope COMPANY), pour qu'ils s'y rangent ;
 *   · un QCM reste hors du coffre SAUF s'il porte un résultat importé (un `document_fichier`) ;
 *   · la route, l'écran (le « + » sur le nœud entreprise) et le client sont bien câblés.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// ── Fausse base : colonnes présentes, réponses par motif, requêtes capturées (cf. archives-rangement-dossier) ──
let colonnes = new Set();
let reponses = [];
let requetes = [];
const faux = {
    promise: () => ({
        query: async (sql, params) => {
            requetes.push({ sql, params });
            if (/information_schema\.columns/.test(sql)) return [colonnes.has(`${params[0]}.${params[1]}`) ? [{ 1: 1 }] : []];
            const r = reponses.find(([motif]) => motif.test(sql));
            return r ? (typeof r[1] === 'function' ? r[1](sql, params) : r[1]) : [[]];
        },
    }),
    query: (sql, params, cb) => { const f = typeof params === 'function' ? params : cb; if (typeof f === 'function') f(null, {}); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const suivi = require('../controllers/suivi.controller.js');
const { decryptBytes } = require('../lib/crypto.js');

const lireApi = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const lireUi = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', rel), 'utf8');

const COMPANY = [/SELECT id, name FROM company WHERE id = \? AND organization_id = \?/,
    (sql, p) => [p[0] === 'c1' ? [{ id: 'c1', name: 'LA CUISINE DE JULIEN' }] : []]];
const fichier = (originalname, mimetype, contenu = 'contenu') => ({ originalname, mimetype, buffer: Buffer.from(contenu) });
async function appeler(fn, req) {
    let code = 200; let corps = null; const entetes = {};
    const res = { status(c) { code = c; return this; }, json(b) { corps = b; return this; },
        set(k, v) { entetes[k] = v; return this; }, send(b) { corps = b; return this; } };
    const erreurs = console.error; console.error = () => {};
    try { await fn({ user: { id: 'u1', organization_id: 'o1', role: 'SECRETARIAT' }, params: {}, body: {}, query: {}, headers: {}, ...req }, res); }
    finally { console.error = erreurs; }
    return { code, corps, entetes };
}

test('AJOUTER AU DOSSIER ENTREPRISE : PDF ou image, ref `fichier-co`, année/semaine/formation du nœud', async () => {
    colonnes = new Set(['archive_document.empreinte']); requetes = [];
    reponses = [COMPANY, [/ref LIKE \? AND title = \?/, (sql, p) => [p[2] === 'Déjà là' ? [{ oui: 1 }] : []]]];
    const r = await appeler(suivi.ajouterAuDossierEntreprise, {
        params: { companyId: 'c1' },
        body: { year: '2026', week: '38', formation: 'RS7404' },
        files: [
            fichier('Kbis.pdf', 'application/pdf', '%PDF-1.4 kbis'),
            fichier('rib.jpg', 'image/jpeg'),
            fichier('page.html', 'text/html', '<script>alert(1)</script>'),
            fichier('vide.pdf', 'application/pdf', ''),
            fichier('Déjà là.pdf', 'application/pdf'),
        ],
    });
    assert.strictEqual(r.code, 201, JSON.stringify(r.corps));
    assert.deepStrictEqual({ ...r.corps.data }, { imported: 2, skipped: 1, noms_refuses: ['page.html'], doublons: 1, noms_doublons: ['Déjà là'], vides: 1, noms_vides: ['vide'] });
    const ecrits = requetes.filter((q) => /INSERT INTO archive_document/.test(q.sql));
    assert.strictEqual(ecrits.length, 2);
    const [pdf, photo] = ecrits.map((q) => q.params);
    assert.match(pdf[1], /^fichier-co:c1:[0-9a-f]{12}$/, 'la référence désigne L\'ENTREPRISE, et tient dans 80 caractères');
    assert.notStrictEqual(pdf[1], photo[1], 'une référence par fichier (clé unique organisme, référence)');
    assert.deepStrictEqual(pdf.slice(2, 8), [2026, 38, 'RS7404', 'LA CUISINE DE JULIEN', 'Kbis', 'application/pdf'],
        'année / semaine / formation du nœud ; le nom de l\'entreprise ; le titre sans extension');
    assert.strictEqual(photo[7], 'image/jpeg', 'le type vient de la LISTE');
    assert.strictEqual(decryptBytes(pdf[8]).toString(), '%PDF-1.4 kbis', 'chiffré au repos, et rouvrable');
    assert.ok(requetes.some((q) => /ref LIKE \?/.test(q.sql) && q.params[1] === 'fichier-co:c1:%'), 'le doublon se cherche DANS ce dossier d\'entreprise');
});

test('AJOUTER AU DOSSIER ENTREPRISE : sans session, l\'année/semaine restent nulles ; entreprise inconnue → 404 ; rien → 422', async () => {
    colonnes = new Set(['archive_document.empreinte']); requetes = [];
    reponses = [COMPANY, [/ref LIKE \? AND title = \?/, [[]]]];
    const sansSession = await appeler(suivi.ajouterAuDossierEntreprise, {
        params: { companyId: 'c1' }, body: {}, files: [fichier('note.pdf', 'application/pdf')],
    });
    assert.strictEqual(sansSession.code, 201);
    const ins = requetes.find((q) => /INSERT INTO archive_document/.test(q.sql)).params;
    assert.deepStrictEqual(ins.slice(2, 5), [null, null, null], 'aucun nœud : année, semaine et formation nulles');

    reponses = [COMPANY]; requetes = [];
    const inconnue = await appeler(suivi.ajouterAuDossierEntreprise, { params: { companyId: 'c-autre' }, files: [fichier('a.pdf', 'application/pdf')] });
    assert.strictEqual(inconnue.code, 404, 'une entreprise d\'un autre organisme est introuvable');
    assert.ok(!requetes.some((q) => /INSERT/.test(q.sql)));
    const rien = await appeler(suivi.ajouterAuDossierEntreprise, { params: { companyId: 'c1' }, files: [] });
    assert.strictEqual(rien.code, 422);
});

test('LE COFFRE résout `fichier-co:%` en ENTREPRISE (scope COMPANY), et inclut les QCM IMPORTÉS', () => {
    const src = lireApi('controllers/suivi.controller.js');
    // Les fichiers ajoutés à une entreprise se joignent à ELLE par leur référence (comme un dossier stagiaire).
    assert.match(src, /LEFT JOIN company co ON ad\.ref LIKE 'fichier-co:%'\s+AND co\.id = SUBSTRING_INDEX\(SUBSTRING_INDEX\(ad\.ref, ':', 2\), ':', -1\)/);
    assert.match(src, /CASE WHEN ad\.ref LIKE 'fichier-co:%' THEN 'COMPANY' ELSE 'LEARNER' END AS scope/);
    // Un QCM reste hors du coffre SAUF s'il porte un résultat importé (un document_fichier).
    assert.match(src, /gd\.quiz_id IS NULL OR EXISTS \(SELECT 1 FROM document_fichier f WHERE f\.document_id = gd\.id\)/);
});

test('LA ROUTE entreprise, et l\'écran qui l\'appelle (le « + » sur le nœud entreprise)', () => {
    assert.match(lireApi('routes/suivi.routes.js'),
        /router\.post\('\/archives\/dossier-entreprise\/:companyId', authorizeRoles\(\.\.\.ADMIN_ROLES\), limiteDuLot, upload\.array\('files', 50\), ajouterAuDossierEntreprise\);/,
        'mêmes droits et même plafond que le dossier stagiaire');
    const page = lireUi('pages/Suivi.jsx');
    // Le nœud entreprise reçoit le contexte du nœud (année / semaine / formation) et porte le « + ».
    assert.match(page, /const noeudEntreprise = \(C, cheminBase, ctx\) =>/);
    assert.match(page, /ajouterDansEntreprise\(\{ companyId: C\.company_id, nom: C\.name, year: ctx\?\.year, week: ctx\?\.week, formation: ctx\?\.formation \}\)/);
    assert.match(page, /return L\.company \? noeudEntreprise\(L, cheminBase, ctx\) : feuilleStagiaire\(L, cheminBase\);/);
    // L'identifiant réel de l'entreprise est gardé sur le nœud (sans lui, pas de « + »).
    assert.match(page, /company_id: realCoId, docs: \[\], learners: \{\}/);
    assert.match(page, /await ajouterAuDossierEntrepriseArchives\(cible\.companyId, prets,/);
    const client = lireUi('api/apiClient.js');
    assert.match(client, /\/suivi\/archives\/dossier-entreprise\/\$\{companyId\}/);
    assert.match(client, /if \(meta\.year != null\) fd\.append\("year", String\(meta\.year\)\);/);
});
