/**
 * CÔTÉ STAGIAIRE : retirer ses pièces justificatives UNE PAR UNE (demandé le 2026-09-28).
 *
 * LE DÉFAUT. Le stagiaire ne pouvait RIEN retirer de ce qu'il avait envoyé — ni une photo floue, ni
 * une page en trop. Arrivé au plafond (six fichiers sur six), ou refusé sur une pièce à un seul
 * fichier, il restait bloqué : le serveur répondait « retirez-en un avant d'en ajouter un autre », et
 * aucun bouton ne le permettait. Le serveur savait pourtant déjà retirer UN fichier
 * (DELETE /pieces/fichier/:id) : le stagiaire le sien, tant que la pièce n'est pas validée. Seul
 * l'écran de l'organisme l'offrait (piece-retrait-fichier.test.js).
 *
 * ET UN DÉFAUT DU SERVEUR, trouvé en chemin : l'envoi refusé pour cause de plafond avait DÉJÀ remis
 * la pièce « à vérifier » et EFFACÉ le motif du refus — le contrôle venait après l'écriture. Une
 * pièce refusée paraissait renvoyée sans l'être.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(API, '..', 'app', 'ui', 'pages', 'StudentFormationDetail.jsx'), 'utf8');

/* ── Une base factice : un dépôt de pièce, ses fichiers ─────────────────────────────────────────── */
let etat;
function reinitialiser(o = {}) {
    etat = { max: 6, fichiers: 3, statut: 'REFUSEE', proprietaire: 'u-stagiaire', depot: true, ecritures: [], ...o };
}
reinitialiser();
const cheminDb = require.resolve('../config/database.js');
const faux = {
    promise: () => ({
        query: async (sql, params = []) => {
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
const depot = (user = stagiaire) => appeler(deposer, {
    user, params: { enrollmentId: 'enr-1', pieceTypeId: 'pt-1' },
    file: { originalname: 'page-7.pdf', buffer: Buffer.from('%PDF-1.7 x'), mimetype: 'application/pdf' },
});
const retrait = (user = stagiaire) => appeler(supprimerFichier, { user, params: { id: 'f-1' } });

/* ── Le serveur ─────────────────────────────────────────────────────────────────────────────────── */
test('AU PLAFOND, l\'envoi est refusé SANS RIEN ÉCRIRE : la pièce refusée garde son statut et son motif', async () => {
    reinitialiser({ max: 6, fichiers: 6, statut: 'REFUSEE' });
    const r = await depot();
    assert.strictEqual(r.code, 409);
    assert.match(r.corps.message, /« Justificatifs » accepte 6 fichiers au maximum\. Retirez-en un avant d'en ajouter un autre\./);
    assert.deepStrictEqual(etat.ecritures, [], 'la pièce était remise « à vérifier » et son motif effacé AVANT ce refus');
    // Sous le plafond, le dépôt s'écrit — le dépôt d'abord, le fichier ensuite.
    reinitialiser({ max: 6, fichiers: 5, statut: 'REFUSEE' });
    const ok = await depot();
    assert.strictEqual(ok.code, 201, JSON.stringify(ok.corps));
    assert.deepStrictEqual(etat.ecritures, ['INSERT INTO piece_depot', 'INSERT INTO piece_fichier']);
    // Un tout premier dépôt : rien à compter, rien n'empêche.
    reinitialiser({ max: 1, fichiers: 0, depot: false, statut: 'ATTENDUE' });
    assert.strictEqual((await depot()).code, 201);
});

test('LE STAGIAIRE RETIRE UN DE SES FICHIERS tant que la pièce n\'est pas validée — jamais celui d\'un autre', async () => {
    for (const statut of ['DEPOSEE', 'REFUSEE']) {
        reinitialiser({ statut, fichiers: 3 });
        const r = await retrait();
        assert.strictEqual(r.code, 200, `${statut} : ${JSON.stringify(r.corps)}`);
        assert.deepStrictEqual(etat.ecritures, ['DELETE FROM piece_fichier'], `${statut} : un seul fichier, la pièce garde son état`);
    }
    reinitialiser({ statut: 'VALIDEE' });
    const valide = await retrait();
    assert.strictEqual(valide.code, 409, 'validée, la pièce fait foi : seule l\'école la retire');
    assert.match(valide.corps.message, /demandez à l'école de la retirer/);
    reinitialiser({ statut: 'DEPOSEE', proprietaire: 'u-autre' });
    assert.strictEqual((await retrait()).code, 403);
    assert.deepStrictEqual(etat.ecritures, []);
    // Le dernier fichier retiré, la pièce redevient « à fournir ».
    reinitialiser({ statut: 'REFUSEE', fichiers: 1 });
    await retrait();
    assert.deepStrictEqual(etat.ecritures, ['DELETE FROM piece_fichier', 'UPDATE piece_depot SET']);
});

/* ── L'écran du stagiaire ───────────────────────────────────────────────────────────────────────── */
test('L\'ÉCRAN : une corbeille par fichier — un seul, ou chacun de la liste —, jamais sur une pièce validée', () => {
    assert.match(page, /import \{[^}]*supprimerPieceFichier[^}]*\} from "\.\.\/api\/apiClient\.js";/);
    // Le fichier unique, à côté de « Voir ».
    assert.match(page, /\{e\.p\.fichiers\?\.length === 1 && e\.p\.statut !== "VALIDEE" && \(\s*<button className="btn sm ghost danger"[\s\S]{0,200}?onClick=\{\(\) => retirerFichier\(e\.p\.fichiers\[0\], e\.p\.label\)\}/);
    // Chacun des fichiers d'une pièce qui en porte plusieurs.
    assert.match(page, /\{e\.p\.statut !== "VALIDEE" && \(\s*<button className="btn sm ghost danger"[\s\S]{0,200}?onClick=\{\(\) => retirerFichier\(f, e\.p\.label\)\}/);
    // Définitif (la copie chiffrée d'une pièce d'identité) : on confirme, puis on relit le dossier.
    const fn = page.slice(page.indexOf('async function retirerFichier'), page.indexOf('async function retirerFichier') + 500);
    assert.match(fn, /window\.confirm\(`Retirer « \$\{f\.nom \|\| "ce fichier"\} » de « \$\{pieceLabel\} » \?/);
    assert.match(fn, /await supprimerPieceFichier\(f\.id\);[\s\S]*load\(\);/);
});

test('L\'ÉCRAN : refusée au plafond, pas de « Renvoyer » voué au refus, mais le geste à faire', () => {
    assert.match(page, /peutAjouter: etat !== "done" && nb < max/);
    assert.match(page, /\{e\.etat === "refused" && !e\.peutAjouter && \(\s*<p className="hint"/);
    assert.match(page, /retirez d'abord celui ou ceux à remplacer/);
});
