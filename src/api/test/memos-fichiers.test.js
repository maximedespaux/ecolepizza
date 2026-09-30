/**
 * LES PIÈCES JOINTES D'UN MÉMO (migration 193) — demandées par l'école le 2026-09-30 : « joindre une
 * image au mémo, deux au plus (une image collée, ou un PDF) ».
 *
 * CE QUI EST GARDÉ ICI :
 *   · DEUX par mémo, et c'est le serveur qui compte ;
 *   · le TYPE est celui que les octets prouvent — le fichier est resservi tel quel, et un
 *     « image/png » posé sur une page HTML s'ouvrirait dans le navigateur d'un collègue ;
 *   · un mémo n'est PAS CRÉÉ sans ce qu'on y a joint : fichier refusé, table absente ou écriture
 *     ratée, il ne reste rien ;
 *   · les octets sont CHIFFRÉS au repos, et ne sortent que pour qui VOIT le mémo — la règle des
 *     mémos (le privé d'un autre répond 404), pas une règle de plus ;
 *   · sans la migration, les mémos marchent comme avant, et l'écran sait qu'il n'y a pas de trombone.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

process.env.SSN_ENC_KEY = process.env.SSN_ENC_KEY || 'a'.repeat(64);

const API = path.join(__dirname, '..');
const UI = path.join(API, '..', 'app', 'ui');
const MIG = path.join(API, '..', '..', 'database', 'migrations');
const lire = (p) => fs.readFileSync(p, 'utf8');

// ── Des fichiers, reconnus à leurs premiers octets ──────────────────────────────────────────────
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(200, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 2)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(200, 3)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 4)]);
const HTML = Buffer.from('<html><script>alert(1)</script></html>');
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

// ── Fausse base : des mémos, leurs pièces, et ce qui s'écrit ────────────────────────────────────
let etat;
function reinitialiser(o = {}) {
    etat = {
        sans193: false,
        memos: [
            { id: 'm1', auteur_id: 'moi', partage: 0 },
            { id: 'm2', auteur_id: 'marie', partage: 1 },
            { id: 'm3', auteur_id: 'marie', partage: 0 },   // le privé de Marie
        ],
        fichiers: [],
        requetes: [],
        ...o,
    };
}
reinitialiser();
const absente = () => Object.assign(new Error('pas de table'), { code: 'ER_NO_SUCH_TABLE' });
const faux = {
    promise: () => ({
        query: async (sql, params = []) => {
            const q = sql.replace(/\s+/g, ' ').trim();
            etat.requetes.push({ q, params });
            // Ce fichier décrit la 193 : les liens (177) sont absents, le contrôleur retombe sur sa cascade.
            if (/memo_lien/.test(q)) throw absente();
            if (/memo_fichier/.test(q) && etat.sans193) throw absente();
            const visible = /\(m\.auteur_id = \? OR m\.partage = 1\)/.test(q);
            if (/^SELECT m\.id, m\.auteur_id, m\.partage FROM memo m/.test(q)) {
                const [id, , moi] = params;
                const m = etat.memos.find((x) => x.id === id && (!visible || x.auteur_id === moi || x.partage === 1));
                return [m ? [m] : []];
            }
            if (/FROM memo m LEFT JOIN user a/.test(q)) {
                const moi = params[1];
                return [etat.memos.filter((m) => !visible || m.auteur_id === moi || m.partage === 1)
                    .map((m) => ({ ...m, texte: 't', echeance: null, fait_le: null, cree_le: '2026-09-30 09:00' }))];
            }
            if (/^INSERT INTO memo \(/.test(q)) { etat.memos.push({ id: params[0], auteur_id: params[2], partage: params[5] }); return [{ affectedRows: 1 }]; }
            if (/^INSERT INTO memo_fichier/.test(q)) {
                for (const [id, memo_id, nom, mime, octets, bytes, rang] of params[0]) etat.fichiers.push({ id, memo_id, nom, mime, octets, bytes, rang });
                return [{ affectedRows: params[0].length }];
            }
            if (/^DELETE FROM memo WHERE id = \?/.test(q)) { etat.memos = etat.memos.filter((m) => m.id !== params[0]); return [{ affectedRows: 1 }]; }
            if (/^SELECT id, memo_id, nom, mime, octets FROM memo_fichier WHERE memo_id IN/.test(q)) {
                return [etat.fichiers.filter((f) => params[0].includes(f.memo_id)).map(({ bytes, ...reste }) => reste)];
            }
            if (/^SELECT nom, mime, bytes FROM memo_fichier WHERE id = \? AND memo_id = \?/.test(q)) {
                return [etat.fichiers.filter((f) => f.id === params[0] && f.memo_id === params[1])];
            }
            if (/^SELECT 1 FROM memo_fichier LIMIT 1/.test(q)) return [[]];
            return [{ affectedRows: 1 }];
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const lib = require('../lib/memoFichiers.js');
const ctrl = require('../controllers/memo.controller.js');
const { decryptBytes } = require('../lib/crypto.js');

async function appeler(fn, req = {}) {
    const res = { code: 200, corps: null, entetes: {}, envoi: null };
    res.status = (c) => { res.code = c; return res; };
    res.json = (b) => { res.corps = b; return res; };
    res.set = (k, v) => { res.entetes[k] = v; return res; };
    res.send = (b) => { res.envoi = b; return res; };
    res.end = () => res;
    const erreurs = console.error; console.error = () => {};
    try { await fn({ params: {}, query: {}, body: {}, user: { organization_id: 'o1', id: 'moi', role: 'SECRETARIAT' }, ...req }, res); }
    finally { console.error = erreurs; }
    return res;
}
const fichier = (buffer, originalname = 'fichier-1') => ({ buffer, originalname, mimetype: 'application/octet-stream' });
const ecrites = (motif) => etat.requetes.filter((r) => motif.test(r.q));

test('LE TYPE SE LIT DANS LES OCTETS : une image ou un PDF, rien d\'autre', () => {
    assert.strictEqual(lib.typeDuFichier(PDF), 'application/pdf');
    assert.strictEqual(lib.typeDuFichier(PNG), 'image/png');
    assert.strictEqual(lib.typeDuFichier(WEBP), 'image/webp');
    assert.strictEqual(lib.typeDuFichier(JPEG), 'image/jpeg');
    // Une page ou un dessin à scripts, resservis sous le domaine de l'application : non.
    assert.strictEqual(lib.typeDuFichier(HTML), null);
    assert.strictEqual(lib.typeDuFichier(SVG), null);
    const refus = lib.lireFichiers([{ buffer: HTML, originalname: 'capture.png', mimetype: 'image/png' }]);
    assert.strictEqual(refus.statut, 415, 'le type déclaré et l\'extension ne prouvent rien');
});

test('DEUX AU PLUS, un poids par genre, et un nom qui ne ment pas', () => {
    assert.strictEqual(lib.MAX_FICHIERS_MEMO, 2);
    const trois = lib.lireFichiers([fichier(PNG), fichier(PDF), fichier(JPEG)]);
    assert.deepStrictEqual([trois.statut, trois.erreur], [422, 'Un mémo porte 2 pièces jointes au plus.']);

    const grosseImage = lib.lireFichiers([fichier(Buffer.concat([PNG, Buffer.alloc(lib.MAX_IMAGE_MEMO)]), 'photo.png')]);
    assert.strictEqual(grosseImage.statut, 413);
    assert.match(grosseImage.erreur, /« photo\.png » est trop lourd : 1 Mo au plus pour une image/);
    // Un PDF du même poids passe : il ne se réduit pas dans un navigateur, son plafond est plus haut.
    assert.ok(lib.lireFichiers([fichier(Buffer.concat([PDF, Buffer.alloc(lib.MAX_IMAGE_MEMO)]))]).fichiers);
    assert.match(lib.lireFichiers([fichier(Buffer.concat([PDF, Buffer.alloc(lib.MAX_PDF_MEMO)]), 'devis.pdf')]).erreur, /5 Mo au plus pour un PDF/);
    assert.strictEqual(lib.lireFichiers([fichier(Buffer.alloc(0))]).statut, 422);

    /* LE NOM : sans chemin ni caractère de contrôle, borné, et avec l'extension du type PROUVÉ —
       « capture.png » réduite en WebP par le navigateur ne doit pas s'appeler .png. */
    assert.strictEqual(lib.nomPropre('C:\\Users\\moi\\capture.png', 'image/webp'), 'capture.webp');
    assert.strictEqual(lib.nomPropre('../../etc/passwd', 'image/png'), 'passwd.png');
    assert.strictEqual(lib.nomPropre('a\u0000b\u001fc.jpg', 'image/jpeg'), 'abc.jpg');
    assert.strictEqual(lib.nomPropre('', 'application/pdf'), 'document.pdf');
    assert.ok(lib.nomPropre(`${'x'.repeat(400)}.png`, 'image/png').length <= 120);
    /* LES NOMS VOYAGENT À PART, en texte : multer lit un nom de fichier en latin1, et « Relevé » y
       arrive « RelevÃ© ». */
    const lu = lib.lireFichiers([fichier(PDF, 'RelevÃ©.pdf')], lib.lireNoms(JSON.stringify(['Relevé de compte.pdf'])));
    assert.deepStrictEqual(lu.fichiers.map((f) => [f.nom, f.mime, f.octets]), [['Relevé de compte.pdf', 'application/pdf', PDF.length]]);
    assert.deepStrictEqual(lib.lireNoms('pas du json'), [], 'illisible : le nom du fichier suffira');
});

test('UN MÉMO ENVOYÉ AVEC SES PIÈCES : tout s\'écrit, chiffré, dans l\'ordre', async () => {
    reinitialiser();
    // En multipart, tout champ est du TEXTE : « true » doit partager, les liens sont un tableau en JSON.
    const res = await appeler(ctrl.createMemo, {
        body: { texte: 'Voir la capture', partage: 'true', liens: '[]', noms: JSON.stringify(['Capture écran.png', 'Devis reçu.pdf']) },
        files: [fichier(PNG), fichier(PDF)],
    });
    assert.strictEqual(res.code, 201, JSON.stringify(res.corps));
    const memo = ecrites(/^INSERT INTO memo \(/)[0];
    assert.strictEqual(memo.params[5], 1, '« true », en multipart, partage bien');
    assert.deepStrictEqual(etat.fichiers.map((f) => [f.nom, f.mime, f.octets, f.rang]),
        [['Capture écran.png', 'image/png', PNG.length, 0], ['Devis reçu.pdf', 'application/pdf', PDF.length, 1]]);
    for (const [f, clair] of [[etat.fichiers[0], PNG], [etat.fichiers[1], PDF]]) {
        assert.strictEqual(f.memo_id, res.corps.data.id);
        assert.ok(!Buffer.from(f.bytes).equals(clair), 'les octets ne sont pas gardés en clair');
        assert.ok(decryptBytes(f.bytes).equals(clair), 'et ils se rouvrent');
    }
    // En JSON, sans fichier, rien n'a changé : « true » en texte ne partage pas, et rien ne touche la table.
    reinitialiser();
    const json = await appeler(ctrl.createMemo, { body: { texte: 'Sans pièce', partage: 'true' } });
    assert.strictEqual(json.code, 201);
    assert.strictEqual(ecrites(/^INSERT INTO memo \(/)[0].params[5], 0);
    assert.strictEqual(ecrites(/memo_fichier/).length, 0);
});

test('UN MÉMO N\'EST PAS CRÉÉ SANS CE QU\'ON Y A JOINT', async () => {
    // Un fichier refusé : rien ne s'écrit, pas même le mémo.
    reinitialiser();
    const refus = await appeler(ctrl.createMemo, { body: { texte: 'Voir la page' }, files: [fichier(HTML, 'page.png')] });
    assert.strictEqual(refus.code, 415);
    assert.strictEqual(ecrites(/^INSERT/).length, 0);
    const trop = await appeler(ctrl.createMemo, { body: { texte: 'Trois' }, files: [fichier(PNG), fichier(PDF), fichier(JPEG)] });
    assert.strictEqual(trop.code, 422);
    assert.strictEqual(ecrites(/^INSERT/).length, 0);

    // Sans la 193 : le mémo écrit est retiré, et le refus dit pourquoi.
    reinitialiser({ sans193: true });
    const avant = etat.memos.length;
    const sans = await appeler(ctrl.createMemo, { body: { texte: 'Voir la capture' }, files: [fichier(PNG)] });
    assert.strictEqual(sans.code, 503);
    assert.match(sans.corps.message, /migration 193/);
    assert.strictEqual(etat.memos.length, avant, '« voir la capture » sans la capture ne veut rien dire');
    // …mais un mémo SANS pièce s'écrit comme avant.
    const simple = await appeler(ctrl.createMemo, { body: { texte: 'Sans pièce' } });
    assert.strictEqual(simple.code, 201);
});

test('LA LISTE donne le nom, le type et le poids — jamais les octets —, et dit si les pièces existent', async () => {
    reinitialiser();
    etat.fichiers.push({ id: 'f1', memo_id: 'm1', nom: 'capture.webp', mime: 'image/webp', octets: 321, bytes: Buffer.from('secret'), rang: 0 });
    const res = await appeler(ctrl.listMemos);
    assert.strictEqual(res.code, 200);
    assert.strictEqual(res.corps.pieces_jointes, true);
    const m1 = res.corps.data.find((m) => m.id === 'm1');
    assert.deepStrictEqual(m1.fichiers, [{ id: 'f1', nom: 'capture.webp', mime: 'image/webp', octets: 321 }]);
    assert.deepStrictEqual(res.corps.data.find((m) => m.id === 'm2').fichiers, []);
    assert.ok(!JSON.stringify(res.corps).includes('bytes'));
    assert.ok(!/bytes/.test(ecrites(/FROM memo_fichier WHERE memo_id IN/)[0].q), 'la liste se relit toutes les minutes : sans les octets');

    // Sans la 193 : les mémos s'affichent, sans pièce, et l'écran n'offrira pas de trombone.
    reinitialiser({ sans193: true });
    const sans = await appeler(ctrl.listMemos);
    assert.strictEqual(sans.code, 200);
    assert.strictEqual(sans.corps.pieces_jointes, false);
    assert.deepStrictEqual(sans.corps.data.map((m) => m.fichiers), [[], []]);
    // Aucun mémo encore : la question est posée à la table elle-même.
    reinitialiser({ memos: [] });
    assert.strictEqual((await appeler(ctrl.listMemos)).corps.pieces_jointes, true);
    reinitialiser({ memos: [], sans193: true });
    assert.strictEqual((await appeler(ctrl.listMemos)).corps.pieces_jointes, false);
});

test('UNE PIÈCE NE S\'OUVRE QUE POUR QUI VOIT LE MÉMO, sous le type prouvé, sans cache', async () => {
    reinitialiser();
    const { encryptBytes } = require('../lib/crypto.js');
    etat.fichiers.push(
        { id: 'f1', memo_id: 'm1', nom: 'Relevé de compte.pdf', mime: 'application/pdf', octets: PDF.length, bytes: encryptBytes(PDF), rang: 0 },
        { id: 'f3', memo_id: 'm3', nom: 'prive.png', mime: 'image/png', octets: PNG.length, bytes: encryptBytes(PNG), rang: 0 },
    );
    const ok = await appeler(ctrl.getFichier, { params: { id: 'm1', fichier: 'f1' } });
    assert.strictEqual(ok.code, 200);
    assert.ok(Buffer.from(ok.envoi).equals(PDF), 'déchiffré à la sortie');
    assert.strictEqual(ok.entetes['Content-Type'], 'application/pdf');
    assert.strictEqual(ok.entetes['X-Content-Type-Options'], 'nosniff');
    assert.strictEqual(ok.entetes['Content-Disposition'], "inline; filename*=UTF-8''Relev%C3%A9%20de%20compte.pdf");
    assert.ok(!('Cache-Control' in ok.entetes), 'une note privée ne reste pas sur le poste : le `no-store` de l\'API s\'applique');

    // Le mémo privé de Marie : 404, et sa pièce n'est même pas lue.
    const prive = await appeler(ctrl.getFichier, { params: { id: 'm3', fichier: 'f3' } });
    assert.strictEqual(prive.code, 404);
    assert.strictEqual(prive.envoi, null);
    assert.strictEqual(ecrites(/^SELECT nom, mime, bytes FROM memo_fichier/).length, 1, 'une seule lecture : celle de m1');
    // La pièce d'un AUTRE mémo, demandée sous un mémo que je vois : 404 aussi.
    const croise = await appeler(ctrl.getFichier, { params: { id: 'm1', fichier: 'f3' } });
    assert.strictEqual(croise.code, 404);
    assert.strictEqual(croise.envoi, null);
    // Sans la 193 : 404, pas une erreur.
    reinitialiser({ sans193: true });
    assert.strictEqual((await appeler(ctrl.getFichier, { params: { id: 'm1', fichier: 'f1' } })).code, 404);
});

test('LA MIGRATION, LA ROUTE, ET L\'ÉCRAN QUI ANNONCE LES MÊMES PLAFONDS', async () => {
    const sql = lire(path.join(MIG, '193_memo_fichiers.sql'));
    assert.match(sql, /CREATE TABLE IF NOT EXISTS memo_fichier/, 'rejouable sans risque');
    assert.match(sql, /FOREIGN KEY \(memo_id\) REFERENCES memo \(id\) ON DELETE CASCADE/, 'les pièces partent avec leur mémo');
    assert.match(sql, /bytes\s+mediumblob/i);
    assert.ok(!/^\s*--/m.test(sql), 'commentaires en blocs');
    assert.match(lire(path.join(MIG, '193_revert_memo_fichiers.sql')), /DROP TABLE IF EXISTS memo_fichier/);

    const routes = lire(path.join(API, 'routes', 'memo.routes.js'));
    assert.match(routes, /router\.post\('\/', pieces\.array\('fichiers', 2\), createMemo\)/);
    assert.match(routes, /router\.get\('\/:id\/fichiers\/:fichier', getFichier\)/);
    /* multer AU-DESSUS du contrôleur : sinon c'est le refus générique qui répondrait, au lieu de
       « 5 Mo au plus pour un PDF ». */
    const multer = Number(/fileSize: (\d+) \* 1024 \* 1024/.exec(routes)[1]) * 1024 * 1024;
    assert.ok(multer > lib.MAX_PDF_MEMO && multer > lib.MAX_IMAGE_MEMO);

    const ui = await import(pathToFileURL(path.join(UI, 'lib', 'memos.js')).href);
    assert.strictEqual(ui.MAX_FICHIERS, lib.MAX_FICHIERS_MEMO);
    assert.strictEqual(ui.MAX_IMAGE_KO * 1024, lib.MAX_IMAGE_MEMO);
    assert.strictEqual(ui.MAX_PDF_MO * 1024 * 1024, lib.MAX_PDF_MEMO);
});
