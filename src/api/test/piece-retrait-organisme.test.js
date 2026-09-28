/**
 * PIÈCES JUSTIFICATIVES : l'ÉCOLE retire un fichier à la fois, pièce validée comprise
 * (demandé le 2026-09-28 : « retirer un document côté organisme, pas côté stagiaire »).
 *
 * LE DÉFAUT. La revue de l'organisme retirait déjà un fichier à la fois (2026-09-24), mais cachait la
 * corbeille sur toute pièce VALIDÉE. Or une pièce que l'école dépose elle-même — reçue par courriel,
 * téléversée pour le stagiaire — est validée du même geste : un fichier joint par erreur (le mauvais
 * scan, un doublon parmi six) ne pouvait plus s'enlever.
 *
 * DÉCIDÉ PAR L'ÉCOLE LE MÊME JOUR : ce geste est le SIEN. La page du stagiaire n'a pas de corbeille ;
 * au plafond, on lui dit de demander à l'école.
 *
 * ET UN DÉFAUT DU SERVEUR, trouvé en chemin : l'envoi refusé pour cause de plafond avait DÉJÀ remis
 * la pièce « à vérifier » et EFFACÉ le motif d'un refus — le contrôle venait après l'écriture.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const UI = path.join(API, '..', 'app', 'ui');
const lire = (p) => fs.readFileSync(p, 'utf8');

/* ── Une base factice : un dépôt de pièce, ses fichiers ─────────────────────────────────────────── */
let etat;
function reinitialiser(o = {}) {
    etat = { max: 6, fichiers: 3, statut: 'REFUSEE', proprietaire: 'u-stagiaire', depot: true, ecritures: [], ...o };
}
reinitialiser();
const cheminDb = require.resolve('../config/database.js');
const faux = {
    promise: () => ({
        query: async (sql) => {
            const q = sql.replace(/\s+/g, ' ').trim();
            if (/^(INSERT|UPDATE|DELETE)/i.test(q) && !/audit_log/i.test(q)) etat.ecritures.push(q.split(' ').slice(0, 3).join(' '));
            if (/^INSERT INTO piece_depot/.test(q)) etat.depot = true; // créé : la relecture de son identifiant le trouve
            if (/^SELECT max_octets, mimes FROM piece_type LIMIT 1/.test(q)) return [[]];
            if (/^SELECT label, fichiers_attendus/.test(q)) return [[{ label: 'Justificatifs', fichiers_attendus: etat.max, max_octets: null, mimes: null }]];
            if (/FROM enrollment e JOIN learner l/.test(q)) return [[{ id: 'enr-1', organization_id: 'o1', user_id: etat.proprietaire }]];
            if (/^SELECT id FROM piece_depot WHERE enrollment_id = \? AND piece_type_id = \?/.test(q)) return [etat.depot ? [{ id: 'dep-1' }] : []];
            if (/^SELECT COUNT\(\*\) AS n FROM piece_fichier WHERE depot_id = \?/.test(q)) return [[{ n: etat.fichiers }]];
            if (/^SELECT COALESCE\(MAX\(sort_order\), 0\)/.test(q)) return [[{ m: etat.fichiers }]];
            if (/^SELECT pf\.depot_id, d\.organization_id, d\.statut, l\.user_id FROM piece_fichier pf/.test(q)) {
                return [[{ depot_id: 'dep-1', organization_id: 'o1', statut: etat.statut, user_id: etat.proprietaire }]];
            }
            if (/^DELETE FROM piece_fichier WHERE id = \?/.test(q)) { etat.fichiers -= 1; return [{ affectedRows: 1 }]; }
            return [[]];
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
};
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };
const { deposer, supprimerFichier } = require('../controllers/piece.controller.js');

async function appeler(fn, req) {
    const r = { code: 200, corps: null };
    const res = { status(c) { r.code = c; return this; }, json(b) { r.corps = b; return this; }, set() { return this; }, send() { return this; }, end() { return this; } };
    const erreurs = console.error; console.error = () => {};
    try { await fn({ headers: {}, ip: '127.0.0.1', ...req }, res); }
    finally { console.error = erreurs; }
    return r;
}
const stagiaire = { organization_id: 'o1', id: 'u-stagiaire', role: 'STAGIAIRE' };
const bureau = { organization_id: 'o1', id: 'u-bureau', role: 'SECRETARIAT' };
const depot = (user) => appeler(deposer, {
    user, params: { enrollmentId: 'enr-1', pieceTypeId: 'pt-1' },
    file: { originalname: 'page-7.pdf', buffer: Buffer.from('%PDF-1.7 x'), mimetype: 'application/pdf' },
});
const retrait = (user) => appeler(supprimerFichier, { user, params: { id: 'f-1' } });

/* ── L'école retire un fichier ──────────────────────────────────────────────────────────────────── */
test('L\'ÉCOLE retire un fichier d\'une pièce VALIDÉE : elle reste validée, sauf si c\'était le dernier', async () => {
    reinitialiser({ statut: 'VALIDEE', fichiers: 6 });
    const r = await retrait(bureau);
    assert.strictEqual(r.code, 200, JSON.stringify(r.corps));
    assert.deepStrictEqual(etat.ecritures, ['DELETE FROM piece_fichier'], 'un fichier, et rien d\'autre : la validation tient');
    reinitialiser({ statut: 'VALIDEE', fichiers: 1 });
    await retrait(bureau);
    assert.deepStrictEqual(etat.ecritures, ['DELETE FROM piece_fichier', 'UPDATE piece_depot SET'], 'le dernier parti, la pièce redevient « à fournir »');
});

test('L\'ÉCRAN DE L\'ÉCOLE : une corbeille par fichier, pièce validée comprise — et la confirmation dit la suite', () => {
    const rev = lire(path.join(UI, 'components/PiecesReview.jsx'));
    assert.match(rev, /<button className="btn sm ghost danger" style=\{\{ flex: "0 0 auto" \}\}\s*aria-label=\{`Retirer \$\{f\.nom \|\| `le fichier \$\{i \+ 1\}`\} de \$\{p\.label\}`\}\s*onClick=\{\(\) => retirerFichier\(f, p\)\}>/);
    assert.doesNotMatch(rev, /p\.statut !== "VALIDEE" && \(\s*<button className="btn sm ghost danger" style=\{\{ flex: "0 0 auto" \}\}/,
        'la corbeille était cachée sur toute pièce validée — donc sur toute pièce déposée par l\'école');
    const fn = rev.slice(rev.indexOf('async function retirerFichier'), rev.indexOf('async function retirerFichier') + 600);
    assert.match(fn, /\(p\.fichiers \|\| \[\]\)\.length <= 1\s*\? "\\nC'est son dernier fichier : la pièce redeviendra « à fournir »\."/);
    assert.match(fn, /: p\.statut === "VALIDEE" \? "\\nLa pièce reste validée\." : ""/);
    assert.match(fn, /window\.confirm\(`Retirer « \$\{f\.nom \|\| "ce fichier"\} » de « \$\{p\.label\} » \?\$\{suite\}\\nLa suppression est définitive\.`\)/);
});

test('DÉCIDÉ PAR L\'ÉCOLE : la page du stagiaire n\'a pas de corbeille', () => {
    const page = lire(path.join(UI, 'pages/StudentFormationDetail.jsx'));
    assert.doesNotMatch(page, /supprimerPieceFichier/, 'retirer un fichier est un geste de l\'école');
    assert.doesNotMatch(page, /name="trash"/);
});

/* ── Le plafond, contrôlé avant toute écriture ──────────────────────────────────────────────────── */
test('AU PLAFOND, l\'envoi est refusé SANS RIEN ÉCRIRE : une pièce refusée garde son statut et son motif', async () => {
    reinitialiser({ max: 6, fichiers: 6, statut: 'REFUSEE' });
    const r = await depot(stagiaire);
    assert.strictEqual(r.code, 409);
    assert.deepStrictEqual(etat.ecritures, [], 'la pièce était remise « à vérifier » et son motif effacé AVANT ce refus');
    // Sous le plafond, le dépôt s'écrit — le dépôt d'abord, le fichier ensuite.
    reinitialiser({ max: 6, fichiers: 5, statut: 'REFUSEE' });
    const ok = await depot(stagiaire);
    assert.strictEqual(ok.code, 201, JSON.stringify(ok.corps));
    assert.deepStrictEqual(etat.ecritures, ['INSERT INTO piece_depot', 'INSERT INTO piece_fichier']);
    // Un tout premier dépôt : rien à compter, rien n'empêche.
    reinitialiser({ max: 1, fichiers: 0, depot: false, statut: 'ATTENDUE' });
    assert.strictEqual((await depot(stagiaire)).code, 201);
});

test('AU PLAFOND, le message dit le geste POSSIBLE : l\'école retire, le stagiaire le demande', async () => {
    reinitialiser({ max: 6, fichiers: 6 });
    assert.match((await depot(stagiaire)).corps.message,
        /^« Justificatifs » accepte 6 fichiers au maximum\. Demandez à l'école de retirer celui à remplacer\.$/,
        'le stagiaire n\'a pas de corbeille : « retirez-en un » lui demandait l\'impossible');
    reinitialiser({ max: 1, fichiers: 1 });
    assert.match((await depot(bureau)).corps.message, /^« Justificatifs » accepte 1 fichier au maximum\. Retirez-en un avant d'en ajouter un autre\.$/);
});
