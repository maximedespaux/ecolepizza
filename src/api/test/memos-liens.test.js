/**
 * CE QU'UN MÉMO DÉSIGNE — les liens écrits avec @ et # (demandé le 2026-09-22, migration 177).
 *
 * @ trouve QUI (stagiaire, entreprise, membre de l'équipe), # trouve QUOI (session, partenaire,
 * facture). Mentionner un COLLÈGUE est le seul lien qui fait quelque chose de plus : le mémo lui
 * devient visible, et une pastille s'allume sur son bouton tant qu'il ne l'a pas ouvert.
 *
 * CE QUE CES TESTS GÈLENT :
 *   · être mentionné SUFFIT à voir le mémo et à le cocher — sinon on confie une tâche à quelqu'un
 *     qui ne peut ni la lire ni la clore ;
 *   · la pastille ne s'éteint qu'au geste d'OUVRIR, jamais au sondage qui tourne en fond ;
 *   · on ne propose à chacun que les rubriques qu'il peut ouvrir, et jamais lui-même ;
 *   · sans la 177, les mémos continuent de marcher, simplement sans liens — et un mémo à liens
 *     n'est pas créé à moitié.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const UI = path.join(API, '..', 'app', 'ui');
const MIG = path.join(API, '..', '..', 'database', 'migrations');
const lire = (p) => fs.readFileSync(p, 'utf8');
const sansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

/* ── BASE FACTICE ────────────────────────────────────────────────────────────────────────────
   Marie a écrit deux mémos privés : l'un me mentionne (donc je dois le voir), l'autre non. */
const MOI = '11111111-1111-4111-8111-111111111111';
const MARIE = '22222222-2222-4222-8222-222222222222';
const CAMILLE = '33333333-3333-4333-8333-333333333333';
let etat;
function reinitialiser(o = {}) {
    etat = {
        absente177: false,
        navAccess: null,          // null = accès complet (rôle non configurable)
        role: 'ADMIN_ORGANISME',
        memos: [
            { id: 'm1', auteur_id: MOI, partage: 0, texte: 'Rappeler le fournisseur', echeance: null, fait_le: null },
            { id: 'm2', auteur_id: MARIE, partage: 0, texte: '@moi peux-tu envoyer l’attestation ?', echeance: null, fait_le: null },
            { id: 'm3', auteur_id: MARIE, partage: 0, texte: 'Son mémo privé', echeance: null, fait_le: null },
        ],
        liens: [
            { memo_id: 'm2', type: 'membre', cible_id: MOI, libelle: 'Jean DUPONT', vu_le: null },
            { memo_id: 'm2', type: 'stagiaire', cible_id: CAMILLE, libelle: 'Camille BERGER', vu_le: null },
        ],
        requetes: [],
        ecrites: [],
        ...o,
    };
}
reinitialiser();
const pingDe = (id) => etat.liens.find((l) => l.memo_id === id && l.type === 'membre' && l.cible_id === MOI);
const faux = {
    promise: () => ({
        query: async (sql, params = []) => {
            const q = sql.replace(/\s+/g, ' ').trim();
            etat.requetes.push({ q, params });
            const touche177 = /memo_lien/.test(q);
            if (etat.absente177 && touche177) { const e = new Error('pas de table'); e.code = 'ER_NO_SUCH_TABLE'; throw e; }
            if (/^SELECT nav_access FROM user WHERE id = \?/.test(q)) return [[{ nav_access: etat.navAccess }]];
            if (/^INSERT INTO memo \(/.test(q)) { etat.ecrites.push({ q, params }); return [{ affectedRows: 1 }]; }
            if (/^INSERT INTO memo_lien/.test(q)) { etat.ecrites.push({ q, params }); return [{ affectedRows: 1 }]; }
            if (/^UPDATE memo_lien l JOIN memo m/.test(q)) {
                const n = etat.liens.filter((l) => l.type === 'membre' && l.cible_id === params[0] && !l.vu_le).length;
                etat.liens.forEach((l) => { if (l.type === 'membre' && l.cible_id === params[0]) l.vu_le = '2026-09-22 19:00'; });
                return [{ affectedRows: n }];
            }
            if (/^SELECT memo_id, type, cible_id, libelle FROM memo_lien/.test(q)) {
                const ids = params[0] || [];
                return [etat.liens.filter((l) => ids.includes(l.memo_id))];
            }
            /* La visibilité est CELLE DE LA REQUÊTE : si la jointure du ping disparaissait du code,
               ce faux ne la remplacerait pas. */
            const avecPing = /LEFT JOIN memo_lien p ON p\.memo_id = m\.id AND p\.type = 'membre' AND p\.cible_id = \?/.test(q);
            /* La JOINTURE ne suffit pas : c'est le WHERE qui fait entrer les mentions dans la liste.
               Les confondre laisserait passer un code qui joint la table sans s'en servir. */
            const clauseVisible = /OR p\.memo_id IS NOT NULL/.test(q);
            const visibles = etat.memos.filter((m) => m.auteur_id === MOI || m.partage === 1
                || (avecPing && clauseVisible && pingDe(m.id)));
            if (/FROM memo m LEFT JOIN user a/.test(q)) {
                return [visibles.map((m) => ({
                    ...m, cree_le: '2026-09-22 09:00',
                    auteur_prenom: m.auteur_id === MOI ? 'Jean' : 'Marie', auteur_nom: m.auteur_id === MOI ? 'DUPONT' : 'BERGER',
                    fait_par_prenom: null, fait_par_nom: null,
                    ping: avecPing && pingDe(m.id) ? m.id : null,
                    ping_vu: avecPing && pingDe(m.id) ? pingDe(m.id).vu_le : null,
                }))];
            }
            if (/^SELECT m\.id, m\.auteur_id, m\.partage FROM memo m/.test(q)) {
                const id = avecPing ? params[1] : params[0];
                const m = visibles.find((x) => x.id === id);
                return [m ? [m] : []];
            }
            if (/SUM\(m\.fait_le IS NULL AND m\.echeance/.test(q)) {
                return [[{ echus: 0, nouveaux: visibles.filter((m) => !m.fait_le && pingDe(m.id) && !pingDe(m.id).vu_le).length }]];
            }
            if (/^SELECT COUNT\(\*\) AS n FROM memo m/.test(q)) return [[{ n: 0 }]];
            // Les recherches de cibles : une ligne par table, reconnue à sa table.
            if (/FROM learner/.test(q)) return [[{ id: CAMILLE, first_name: 'Camille', last_name: 'BERGER', town: 'TOULOUSE' }]];
            if (/FROM company/.test(q)) return [[{ id: 'c1', name: 'Pizza Napoli SARL', town: 'TOULOUSE' }]];
            if (/FROM user WHERE organization_id = \? AND role IN/.test(q)) {
                etat.requetes.push({ q: 'MEMBRES', q0: q, params });
                return [[{ id: MARIE, first_name: 'Marie', last_name: 'BERGER', role: 'SECRETARIAT' }]];
            }
            if (/FROM training_session s/.test(q)) return [[{ id: 's1', week: 41, year: 2026, debut: '05/10/2026', code: 'NIV1H', title: 'Niveau 1' }]];
            if (/FROM partner/.test(q)) return [[{ id: 'p1', name: 'Fours Napoli' }]];
            if (/FROM invoice/.test(q)) return [[{ id: 'f1', number: 'F-2026-0012', genre: 'FACTURE', le: '02/09/2026' }]];
            if (/^DELETE FROM memo WHERE id/.test(q)) { etat.ecrites.push({ q, params }); return [{ affectedRows: 1 }]; }
            return [{ affectedRows: 1 }];
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const lib = require('../lib/memos.js');
const ctrl = require('../controllers/memo.controller.js');
const memosUi = () => import('../../app/ui/lib/memos.js');

async function appeler(fn, req = {}) {
    let code = 200; let corps = null;
    const res = { status(c) { code = c; return this; }, json(b) { corps = b; return this; } };
    const erreurs = console.error; console.error = () => {};
    try { await fn({ params: {}, query: {}, body: {}, user: { organization_id: 'o1', id: MOI, role: etat.role }, ...req }, res); }
    finally { console.error = erreurs; }
    return { code, corps };
}

// ── La migration ─────────────────────────────────────────────────────────────────────────────

test('la 177 crée la table des liens, et son revert dit ce qu\'il détruit', () => {
    const sql = lire(path.join(MIG, '177_memo_liens.sql'));
    assert.match(sql, /CREATE TABLE IF NOT EXISTS memo_lien/);
    for (const c of ['memo_id', 'type', 'cible_id', 'libelle', 'vu_le']) assert.match(sql, new RegExp(`\\b${c}\\b`));
    assert.match(sql, /FOREIGN KEY \(memo_id\) REFERENCES memo \(id\) ON DELETE CASCADE/, 'les liens suivent leur mémo');
    /* `cible_id` vise six tables : aucune clé étrangère ne peut le faire, et le fichier doit le dire
       plutôt que de laisser croire à un oubli. */
    assert.match(sql, /PAS DE CLÉ ÉTRANGÈRE SUR `cible_id`/);
    const revert = lire(path.join(MIG, '177_revert_memo_liens.sql'));
    assert.match(revert, /DROP TABLE IF EXISTS memo_lien/);
    assert.match(revert, /Les MÉMOS restent/, 'le revert ne touche pas au texte des mémos');
    for (const [nom, texte] of [['177', sql], ['revert', revert]]) {
        assert.strictEqual((texte.match(/;/g) || []).length, 1, `${nom} : un seul point-virgule`);
        assert.ok(!texte.includes('\\'), `${nom} : aucune barre oblique inverse`);
    }
});

// ── Ce que le serveur accepte ────────────────────────────────────────────────────────────────

test('un lien porte un type connu, un identifiant et le nom lu au moment du choix', () => {
    assert.match(lib.lireLiens([{ type: 'chose', id: MOI, libelle: 'x' }]).erreur, /Type de lien inconnu/);
    assert.match(lib.lireLiens([{ type: 'membre', id: 'pas-un-uuid', libelle: 'x' }]).erreur, /identifiant/);
    assert.match(lib.lireLiens([{ type: 'membre', id: MOI, libelle: '  ' }]).erreur, /sans nom/);
    assert.deepStrictEqual(lib.lireLiens(undefined).liens, [], 'un mémo sans lien reste un mémo');
    /* Deux fois la même personne : un clic de trop, pas une faute. */
    const deux = lib.lireLiens([{ type: 'membre', id: MARIE, libelle: 'Marie' }, { type: 'membre', id: MARIE.toUpperCase(), libelle: 'Marie' }]);
    assert.strictEqual(deux.liens.length, 1);
    const trop = Array.from({ length: lib.MAX_LIENS + 1 }, (_, i) => ({ type: 'stagiaire', id: `0000000${i}-1111-4111-8111-111111111111`, libelle: `x${i}` }));
    assert.match(lib.lireLiens(trop).erreur, new RegExp(`${lib.MAX_LIENS} liens au plus`));
});

test('on ne se mentionne pas soi-même', async () => {
    reinitialiser();
    const r = await appeler(ctrl.createMemo, { body: { texte: 'Penser à moi', liens: [
        { type: 'membre', id: MOI, libelle: 'Jean DUPONT' },
        { type: 'stagiaire', id: CAMILLE, libelle: 'Camille BERGER' },
    ] } });
    assert.strictEqual(r.code, 201);
    const insertion = etat.ecrites.find((e) => /INSERT INTO memo_lien/.test(e.q));
    const lignes = insertion.params[0];
    assert.deepStrictEqual(lignes.map((l) => l[1]), ['stagiaire'], 'le lien vers soi est retiré en silence');
    assert.strictEqual(lignes[0][3], 'Camille BERGER', 'le nom est figé avec le lien');
});

test('sans la 177, un mémo à liens n\'est pas créé à moitié', async () => {
    reinitialiser({ absente177: true });
    const r = await appeler(ctrl.createMemo, { body: { texte: 'Voir @Marie', liens: [{ type: 'membre', id: MARIE, libelle: 'Marie BERGER' }] } });
    assert.strictEqual(r.code, 503);
    assert.match(r.corps.message, /migration 177/);
    assert.ok(etat.ecrites.some((e) => /^DELETE FROM memo WHERE id/.test(e.q)),
        'le mémo écrit juste avant est retiré : sans son lien, il perdrait la personne qu\'il visait');
});

test('sans la 177, les mémos SANS lien continuent de marcher', async () => {
    reinitialiser({ absente177: true });
    const liste = await appeler(ctrl.listMemos);
    assert.strictEqual(liste.code, 200);
    assert.deepStrictEqual(liste.corps.data.map((m) => m.id), ['m1'], 'mes mémos, sans mention ni lien');
    assert.deepStrictEqual(liste.corps.data[0].liens, []);
    const compte = await appeler(ctrl.countMemos);
    assert.strictEqual(compte.corps.data.nouveaux, 0);
    const cree = await appeler(ctrl.createMemo, { body: { texte: 'Simple' } });
    assert.strictEqual(cree.code, 201);
});

// ── La mention d'un collègue ─────────────────────────────────────────────────────────────────

test('être mentionné suffit à voir le mémo, et à le cocher', async () => {
    reinitialiser();
    const liste = await appeler(ctrl.listMemos);
    const vus = liste.corps.data.map((m) => m.id);
    assert.ok(vus.includes('m2'), 'le mémo privé de Marie qui me mentionne');
    assert.ok(!vus.includes('m3'), 'mais pas son autre mémo privé');
    const m2 = liste.corps.data.find((m) => m.id === 'm2');
    assert.strictEqual(m2.nouveau, true, 'jamais ouvert : c\'est ce que compte la pastille');
    assert.deepStrictEqual(m2.liens.map((l) => `${l.type}:${l.libelle}`), ['membre:Jean DUPONT', 'stagiaire:Camille BERGER']);
    /* Cocher une tâche qu'on m'a confiée : sans cela, on me la confie sans que je puisse la clore. */
    const coche = await appeler(ctrl.updateMemo, { params: { id: 'm2' }, body: { fait: true } });
    assert.strictEqual(coche.code, 200);
    /* Mais elle reste à Marie : je ne la partage pas et je ne la supprime pas. */
    assert.strictEqual((await appeler(ctrl.updateMemo, { params: { id: 'm2' }, body: { partage: true } })).code, 403);
    assert.strictEqual((await appeler(ctrl.deleteMemo, { params: { id: 'm2' } })).code, 403);
});

test('la pastille compte ce qu\'on vient de me confier, et s\'éteint quand j\'ouvre', async () => {
    reinitialiser();
    assert.strictEqual((await appeler(ctrl.countMemos)).corps.data.nouveaux, 1);
    const vus = await appeler(ctrl.marquerVus);
    assert.strictEqual(vus.code, 200);
    assert.strictEqual(vus.corps.data.vus, 1);
    const maj = etat.requetes.find((r) => /^UPDATE memo_lien l JOIN memo m/.test(r.q));
    assert.match(maj.q, /l\.type = 'membre' AND l\.cible_id = \? AND l\.vu_le IS NULL/, 'seulement ce qui me vise');
    assert.strictEqual((await appeler(ctrl.countMemos)).corps.data.nouveaux, 0, 'la pastille est éteinte');
    const apres = await appeler(ctrl.listMemos);
    assert.strictEqual(apres.corps.data.find((m) => m.id === 'm2').nouveau, false);
});

// ── Ce que @ et # proposent ──────────────────────────────────────────────────────────────────

test('@ trouve qui, # trouve quoi', async () => {
    reinitialiser();
    const arobase = await appeler(ctrl.chercherCibles, { query: { q: 'ber', genre: '@' } });
    assert.deepStrictEqual([...new Set(arobase.corps.data.map((c) => c.type))], ['stagiaire', 'entreprise', 'membre']);
    const diese = await appeler(ctrl.chercherCibles, { query: { q: '', genre: '#' } });
    assert.deepStrictEqual([...new Set(diese.corps.data.map((c) => c.type))], ['session', 'partenaire', 'facture']);
    const session = diese.corps.data.find((c) => c.type === 'session');
    assert.strictEqual(session.libelle, 'Semaine 41 · NIV1H', 'une session se reconnaît à sa semaine et à sa formation');
    /* Chacun est proposé avec de quoi le distinguer d'un homonyme. */
    assert.strictEqual(arobase.corps.data.find((c) => c.type === 'stagiaire').detail, 'TOULOUSE');
});

test('on ne propose à personne ce qu\'il ne peut pas ouvrir, ni lui-même', async () => {
    /* Un formateur dont la carte d'accès ne porte ni factures ni entreprises ne doit pas se voir
       proposer un numéro de facture : il noterait un lien qu'il ne pourra pas suivre. */
    reinitialiser({ role: 'FORMATEUR', navAccess: JSON.stringify({ '/stagiaires': 'read', '/sessions': 'write' }) });
    const r = await appeler(ctrl.chercherCibles, { query: { q: 'a' } });
    const types = [...new Set(r.corps.data.map((c) => c.type))].sort();
    assert.deepStrictEqual(types, ['membre', 'session', 'stagiaire'], `types proposés : ${types.join(', ')}`);
    const membres = etat.requetes.find((x) => x.q === 'MEMBRES');
    assert.match(membres.q0, /AND id <> \?/, 'la recherche exclut le compte qui cherche…');
    assert.ok(membres.params.includes(MOI), '…et c\'est bien lui qu\'elle exclut');
    /* Et un responsable, lui, a tout. */
    reinitialiser({ role: 'ADMIN_ORGANISME', navAccess: JSON.stringify({}) });
    const plein = await appeler(ctrl.chercherCibles, { query: { q: 'a' } });
    assert.strictEqual([...new Set(plein.corps.data.map((c) => c.type))].length, 6);
});

// ── Ce que l'écran calcule ───────────────────────────────────────────────────────────────────

test('@ et # s\'ouvrent sur un mot, jamais au milieu d\'une adresse', async () => {
    const { mentionEnCours, insererMention } = await memosUi();
    assert.deepStrictEqual(mentionEnCours('@cam', 4), { genre: '@', requete: 'cam', debut: 0 });
    assert.deepStrictEqual(mentionEnCours('Appeler #41', 11), { genre: '#', requete: '41', debut: 8 });
    assert.strictEqual(mentionEnCours('écrire à jean@exemple.fr', 24), null, 'une adresse e-mail n\'ouvre rien');
    assert.strictEqual(mentionEnCours('@Camille BERGER pour', 20), null, 'le choix fait, la liste ne se rouvre pas');
    /* AU MILIEU D'UNE PHRASE, l'espace qui suit existe déjà : la doubler se voyait (« BERGER  demain »). */
    const pose = insererMention('Appeler @cam demain', { genre: '@', requete: 'cam', debut: 8 }, 'Camille BERGER');
    assert.strictEqual(pose.texte, 'Appeler @Camille BERGER demain');
    assert.strictEqual(pose.curseur, 'Appeler @Camille BERGER '.length, 'le curseur repart après le nom posé');
    /* En fin de phrase, on la pose : on enchaîne sans avoir à taper l'espace. */
    const fin = insererMention('Appeler @cam', { genre: '@', requete: 'cam', debut: 8 }, 'Camille BERGER');
    assert.strictEqual(fin.texte, 'Appeler @Camille BERGER ');
    assert.strictEqual(fin.curseur, fin.texte.length);
});

test('les types de liens sont les mêmes des deux côtés', async () => {
    const { TYPES_LIEN } = await memosUi();
    assert.deepStrictEqual(Object.keys(TYPES_LIEN).sort(), Object.keys(lib.TYPES_LIEN).sort());
    for (const [type, t] of Object.entries(lib.TYPES_LIEN)) {
        assert.strictEqual(TYPES_LIEN[type].genre, t.genre, `${type} : @ ou # doit être le même`);
    }
    /* Un membre n'est pas une fiche à ouvrir : l'annuaire de l'équipe est réservé au responsable. */
    assert.strictEqual(TYPES_LIEN.membre.lien, null);
    assert.strictEqual(TYPES_LIEN.stagiaire.lien('abc'), '/stagiaires/abc');
});

test('ce qu\'un collègue vient de me confier ouvre la liste', async () => {
    const { trierMemos } = await memosUi();
    const ordre = trierMemos([
        { id: 'echu', echeance: '2026-09-01' },
        { id: 'neuf', nouveau: true },
        { id: 'fait', fait_le: '2026-09-22 09:00', nouveau: true },
    ]).map((m) => m.id);
    assert.deepStrictEqual(ordre, ['neuf', 'echu', 'fait']);
});

// ── Les écrans ───────────────────────────────────────────────────────────────────────────────

test('la liste propose, la flèche choisit, Entrée n\'envoie pas le mémo', () => {
    const src = sansCommentaires(lire(path.join(UI, 'components/MemoListe.jsx')));
    assert.match(src, /role="listbox"/);
    assert.match(src, /if \(e\.key === "Enter"\) \{ e\.preventDefault\(\); choisir\(suggestions\[actif\]\); \}/);
    assert.match(src, /setTimeout\(\(\) => \{\s*chercherCiblesMemo/, 'une lettre tapée ne vaut pas une requête');
    assert.match(src, /createMemo\(\{ texte, echeance: echeance \|\| null, partage, liens \}\)/);
    /* Le lien d'un membre ne mène nulle part : la puce reste une puce. */
    assert.match(src, /t\.lien\s*\?\s*<Link/);
});

test('le bouton porte deux pastilles, et la seconde s\'éteint à l\'ouverture', () => {
    const src = sansCommentaires(lire(path.join(UI, 'components/MemoBouton.jsx')));
    assert.match(src, /\{nouveaux > 0 && <span className="memo-dot-neuf">/);
    assert.match(src, /setOuvert\(true\); ouvrir\(\);/, 'ouvrir vaut lecture');
    assert.match(src, /const ouvrir = \(\) => \{ if \(nouveaux > 0\) \{ setNouveaux\(0\); aMarquer\.current = true; \} \};/,
        'la pastille s\'éteint à l\'écran tout de suite');
    /* MAIS LE SERVEUR N'EST PRÉVENU QU'À LA FERMETURE : marqué à l'ouverture, « Nouveau pour vous »
       disparaissait de la liste au moment même où elle s'affichait — on ouvrait pour voir ce qu'on
       venait de nous confier, et on ne voyait plus lequel c'était. */
    assert.match(src, /const fermer = \(\) => \{[\s\S]*?marquerMemosVus\(\)/);
    assert.doesNotMatch(src, /ouvrir = \(\) => \{[^}]*marquerMemosVus/);
    assert.match(src, /useEffect\(\(\) => \(\) => \{ if \(aMarquer\.current\) marquerMemosVus/,
        'parti sans refermer, la lecture se grave quand même');
    /* Le sondage de fond ne doit RIEN éteindre : il ne marque jamais comme vu. */
    const compter = src.slice(src.indexOf('const compter'), src.indexOf('useEffect'));
    assert.doesNotMatch(compter, /marquerMemosVus/);
    const css = lire(path.join(UI, 'styles/app.css'));
    assert.match(css, /\.memo-dot-neuf\{position:absolute;top:-5px;left:-5px/, 'à gauche, en face de celle des échéances');
});
