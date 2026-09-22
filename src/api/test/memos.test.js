/**
 * LES MÉMOS DU PERSONNEL — pense-bête et liste de choses à faire (demandé le 2026-09-22).
 *
 * CE QUE CES TESTS GÈLENT, et qui n'est pas négociable :
 *   · un mémo PRIVÉ d'un autre n'existe pas — ni lu, ni coché, ni supprimé, et il répond 404, pas
 *     403 : un 403 dirait qu'il existe, ce qui est déjà trop dire d'une note personnelle ;
 *   · un mémo PARTAGÉ se coche par n'importe qui de l'équipe (c'est une tâche commune), mais ne se
 *     supprime et ne se reprend que par son auteur ;
 *   · « Effacer les mémos faits » n'efface que LES MIENS ;
 *   · aucune trace au journal d'audit : il alimente l'« Activité récente » du tableau de bord, que
 *     tout le bureau lit, et chaque pense-bête privé y apparaîtrait ;
 *   · sans la migration 176, rien ne casse : la liste dit qu'elle n'est pas disponible.
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

/* ── UNE BASE FACTICE ─────────────────────────────────────────────────────────────────────────
   Trois mémos : le mien, celui d'une collègue partagé, et le sien resté privé — que je ne dois
   jamais voir. `absente` rejoue le monde d'avant la migration 176. */
let etat;
function reinitialiser(o = {}) {
    etat = {
        absente: false,
        memos: [
            { id: 'm1', auteur_id: 'moi', partage: 0, texte: 'Rappeler le fournisseur', echeance: '2026-09-22', fait_le: null },
            { id: 'm2', auteur_id: 'marie', partage: 1, texte: 'Relancer l’OPCO', echeance: null, fait_le: null },
            { id: 'm3', auteur_id: 'marie', partage: 0, texte: 'Son mémo privé', echeance: null, fait_le: null },
        ],
        requetes: [],
        ...o,
    };
}
reinitialiser();
const faux = {
    promise: () => ({
        query: async (sql, params = []) => {
            const q = sql.replace(/\s+/g, ' ').trim();
            etat.requetes.push({ q, params });
            if (etat.absente) { const e = new Error('pas de table'); e.code = 'ER_NO_SUCH_TABLE'; throw e; }
            /* CE FICHIER DÉCRIT LES RÈGLES DE LA 176, SANS LES LIENS : la table `memo_lien` répond
               donc absente, et le contrôleur retombe sur la forme d'avant (sa cascade). Les liens et
               les mentions ont leur propre fichier, `memos-liens.test.js`. */
            if (/memo_lien/.test(q)) { const e = new Error('pas de table'); e.code = 'ER_NO_SUCH_TABLE'; throw e; }
            /* LA BASE FACTICE OBÉIT À LA REQUÊTE, elle ne refait pas la règle à sa place : si la
               clause de visibilité disparaissait du code, ce faux la rendrait quand même — et le
               test resterait vert sur un mémo privé devenu visible. */
            const visible = /\(m\.auteur_id = \? OR m\.partage = 1\)/.test(q);
            if (/^SELECT m\.id, m\.auteur_id, m\.partage FROM memo m/.test(q)) {
                const [id, , moi] = params;
                const m = etat.memos.find((x) => x.id === id && (!visible || x.auteur_id === moi || x.partage === 1));
                return [m ? [m] : []];
            }
            if (/^SELECT COUNT\(\*\) AS n FROM memo m/.test(q)) return [[{ n: 2 }]];
            if (/FROM memo m LEFT JOIN user a/.test(q)) {
                const moi = params[1];
                return [etat.memos.filter((m) => !visible || m.auteur_id === moi || m.partage === 1).map((m) => ({
                    ...m, cree_le: '2026-09-22 09:00',
                    auteur_prenom: m.auteur_id === 'moi' ? 'Jean' : 'Marie', auteur_nom: m.auteur_id === 'moi' ? 'DUPONT' : 'BERGER',
                    fait_par_prenom: null, fait_par_nom: null,
                }))];
            }
            return [{ affectedRows: 1 }];
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const lib = require('../lib/memos.js');
const ctrl = require('../controllers/memo.controller.js');
const { STAFF_ROLES } = require('../middlewares/auth.middleware.js');
const memosUi = () => import('../../app/ui/lib/memos.js');

async function appeler(fn, req = {}) {
    let code = 200; let corps = null;
    const res = { status(c) { code = c; return this; }, json(b) { corps = b; return this; } };
    const erreurs = console.error; console.error = () => {};
    try { await fn({ params: {}, query: {}, body: {}, user: { organization_id: 'o1', id: 'moi', role: 'SECRETARIAT' }, ...req }, res); }
    finally { console.error = erreurs; }
    return { code, corps };
}
const derniere = (motif) => [...etat.requetes].reverse().find((r) => motif.test(r.q));

// ── La migration ─────────────────────────────────────────────────────────────────────────────

test('la 176 crée la table, et son revert dit ce qu\'il détruit', () => {
    const sql = lire(path.join(MIG, '176_memos.sql'));
    assert.match(sql, /CREATE TABLE IF NOT EXISTS memo/, 'rejouable sans risque');
    for (const c of ['organization_id', 'auteur_id', 'texte', 'echeance', 'partage', 'fait_le', 'fait_par']) {
        assert.match(sql, new RegExp(`\\b${c}\\b`), `la colonne ${c} doit exister`);
    }
    assert.match(sql, /FOREIGN KEY \(auteur_id\) REFERENCES user \(id\) ON DELETE CASCADE/,
        'un mémo est une note personnelle : il part avec le compte qui l\'a écrite');
    assert.match(sql, /FOREIGN KEY \(organization_id\) REFERENCES organization \(id\) ON DELETE CASCADE/);
    /* Le client SQL de l'organisme découpe sur le point-virgule : un seul par instruction, et
       aucun dans les commentaires (cf. la 146). Ni barre oblique inverse. */
    const revert = lire(path.join(MIG, '176_revert_memos.sql'));
    for (const [nom, texte, n] of [['176', sql, 1], ['revert', revert, 1]]) {
        assert.strictEqual((texte.match(/;/g) || []).length, n, `${nom} : un point-virgule, celui de fin`);
        assert.ok(!texte.includes('\\'), `${nom} : aucune barre oblique inverse`);
    }
    assert.match(revert, /DROP TABLE IF EXISTS memo/);
    assert.match(revert, /CE QUI SE PERD/, 'un revert qui détruit des données doit le dire');
});

// ── Ce que le serveur accepte ────────────────────────────────────────────────────────────────

test('un mémo vide ou trop long est refusé, une échéance fausse aussi', () => {
    assert.match(lib.lireNouveauMemo({ texte: '   ' }).erreur, /Écrivez le mémo/);
    assert.match(lib.lireNouveauMemo({ texte: 'x'.repeat(lib.MAX_TEXTE + 1) }).erreur, /1000 caractères/);
    /* Une échéance illisible est REFUSÉE, pas ignorée : ignorée, on croirait avoir posé un rappel. */
    for (const d of ['2026-02-30', '05/10/2026', 'demain', '2026-13-01', '1999-01-01']) {
        assert.match(lib.lireNouveauMemo({ texte: 'ok', echeance: d }).erreur, /Échéance illisible/, d);
    }
    assert.deepStrictEqual(lib.lireNouveauMemo({ texte: '  Rappeler  ', echeance: '2026-10-05', partage: true }).valeurs,
        { texte: 'Rappeler', echeance: '2026-10-05', partage: true });
    /* Un mémo naît PRIVÉ : rien d'autre que `true` ne le partage — ni "true", ni 1. */
    for (const p of [undefined, null, 'true', 1, 'oui']) {
        assert.strictEqual(lib.lireNouveauMemo({ texte: 'ok', partage: p }).valeurs.partage, false, String(p));
    }
    assert.strictEqual(lib.lireNouveauMemo({ texte: 'ok' }).valeurs.echeance, null);
});

test('cocher et partager attendent un vrai booléen', () => {
    assert.match(lib.lireModification({}).erreur, /Rien à modifier/);
    assert.match(lib.lireModification({ fait: 'oui' }).erreur, /vrai ou faux/);
    assert.deepStrictEqual(lib.lireModification({ fait: true, partage: false }).modification, { fait: true, partage: false });
});

// ── Qui voit quoi ────────────────────────────────────────────────────────────────────────────

test('je vois les miens et ceux que l\'équipe partage, jamais le privé d\'un autre', async () => {
    reinitialiser();
    const r = await appeler(ctrl.listMemos);
    assert.strictEqual(r.code, 200);
    assert.deepStrictEqual(r.corps.data.map((m) => m.id), ['m1', 'm2'], 'm3 est le mémo privé de Marie');
    const [mien, partage] = r.corps.data;
    assert.strictEqual(mien.mien, true);
    assert.strictEqual(mien.auteur, null, 'inutile de me nommer à moi-même');
    assert.strictEqual(partage.mien, false);
    assert.strictEqual(partage.auteur, 'Marie BERGER', 'un mémo d\'équipe dit de qui il vient');
    assert.match(derniere(/FROM memo m LEFT JOIN user a/).q, /\(m\.auteur_id = \? OR m\.partage = 1\)/,
        'la règle de visibilité est DANS la requête');
    assert.match(derniere(/FROM memo m LEFT JOIN user a/).q, /ORDER BY \(m\.fait_le IS NOT NULL\), \(m\.echeance IS NULL\), m\.echeance/,
        'à faire d\'abord, échéance la plus proche en tête, faits à la fin');
});

test('le compteur du bouton ne compte que ce qui est ÉCHU ou dû aujourd\'hui', async () => {
    reinitialiser();
    const r = await appeler(ctrl.countMemos);
    /* `nouveaux` est arrivé avec les mentions (177) : ici, sans la table, il vaut zéro. */
    assert.deepStrictEqual(r.corps.data, { echus: 2, nouveaux: 0, disponible: true });
    const q = derniere(/SELECT COUNT/).q;
    assert.match(q, /m\.fait_le IS NULL/, 'un mémo fait n\'attend plus rien');
    assert.match(q, /m\.echeance IS NOT NULL AND m\.echeance <= CURDATE\(\)/, 'sans échéance, rien n\'est dû');
    assert.match(q, /\(m\.auteur_id = \? OR m\.partage = 1\)/);
});

test('un mémo partagé se coche par n\'importe qui, et ne se reprend que par son auteur', async () => {
    reinitialiser();
    const coche = await appeler(ctrl.updateMemo, { params: { id: 'm2' }, body: { fait: true } });
    assert.strictEqual(coche.code, 200);
    const maj = derniere(/^UPDATE memo SET/);
    assert.match(maj.q, /fait_le = NOW\(\), fait_par = \?/, 'cocher garde qui et quand');
    assert.strictEqual(maj.params[0], 'moi');
    /* Décocher efface les deux : le mémo redevient à faire, sans trace d'un « fait » qui n'en est plus un. */
    await appeler(ctrl.updateMemo, { params: { id: 'm2' }, body: { fait: false } });
    assert.match(derniere(/^UPDATE memo SET/).q, /fait_le = NULL, fait_par = \?/);
    assert.strictEqual(derniere(/^UPDATE memo SET/).params[0], null);
    const partage = await appeler(ctrl.updateMemo, { params: { id: 'm2' }, body: { partage: false } });
    assert.strictEqual(partage.code, 403);
    assert.match(partage.corps.message, /Seul l’auteur/);
});

test('le mémo privé d\'un autre répond 404 — jamais 403, qui dirait qu\'il existe', async () => {
    reinitialiser();
    for (const fn of [ctrl.updateMemo, ctrl.deleteMemo]) {
        const r = await appeler(fn, { params: { id: 'm3' }, body: { fait: true } });
        assert.strictEqual(r.code, 404, fn.name);
        assert.match(r.corps.message, /introuvable/);
    }
    assert.ok(!etat.requetes.some((r) => /^DELETE FROM memo WHERE id/.test(r.q)), 'rien n\'a été supprimé');
});

test('supprimer est réservé à l\'auteur, même sur un mémo partagé', async () => {
    reinitialiser();
    const autre = await appeler(ctrl.deleteMemo, { params: { id: 'm2' } });
    assert.strictEqual(autre.code, 403);
    assert.match(autre.corps.message, /Seul l’auteur/);
    reinitialiser();
    const mien = await appeler(ctrl.deleteMemo, { params: { id: 'm1' } });
    assert.strictEqual(mien.code, 200);
    assert.match(derniere(/^DELETE FROM memo WHERE id/).q, /AND auteur_id = \?/, 'la propriété est dans la requête');
});

test('« Effacer les mémos faits » n\'efface que les miens', async () => {
    reinitialiser();
    const r = await appeler(ctrl.clearDoneMemos);
    assert.strictEqual(r.code, 200);
    const q = derniere(/^DELETE FROM memo WHERE organization_id/).q;
    assert.match(q, /auteur_id = \?/, 'jamais les mémos d\'un collègue, même cochés par moi');
    assert.match(q, /fait_le IS NOT NULL/, 'ni ce qui reste à faire');
});

test('aucun mémo n\'entre au journal d\'audit', () => {
    /* Le journal alimente l'« Activité récente » du tableau de bord, que tout le bureau lit : les
       pense-bêtes privés y défileraient. */
    const src = sansCommentaires(lire(path.join(API, 'controllers/memo.controller.js')));
    assert.doesNotMatch(src, /logAudit/);
});

// ── Sans la migration ────────────────────────────────────────────────────────────────────────

test('sans la 176, l\'écran le DIT et rien ne casse', async () => {
    reinitialiser({ absente: true });
    const liste = await appeler(ctrl.listMemos);
    assert.strictEqual(liste.code, 200);
    assert.strictEqual(liste.corps.data, null, 'null : l\'écran sait qu\'il n\'a rien à afficher');
    assert.match(liste.corps.message, /migration 176/);
    const compte = await appeler(ctrl.countMemos);
    assert.deepStrictEqual(compte.corps.data, { echus: 0, nouveaux: 0, disponible: false }, 'aucun chiffre sur le bouton');
    const creation = await appeler(ctrl.createMemo, { body: { texte: 'Rappeler' } });
    assert.strictEqual(creation.code, 503);
    assert.match(creation.corps.message, /migration 176/);
});

test('la route est réservée au personnel, et « faits » n\'est pas un identifiant', () => {
    const routes = lire(path.join(API, 'routes/memo.routes.js'));
    assert.match(routes, /router\.use\(authenticateToken, authorizeRoles\(\.\.\.STAFF_ROLES\)\)/,
        'ni le stagiaire, ni l\'intervenant, ni l\'auditeur');
    assert.ok(routes.indexOf("router.delete('/faits'") < routes.indexOf("router.delete('/:id'"),
        '« /faits » doit être déclaré AVANT « /:id », sinon il serait lu comme un identifiant');
    assert.match(lire(path.join(API, 'server.js')), /app\.use\('\/api\/memos', memoRoutes\)/);
});

// ── Ce que l'écran calcule ───────────────────────────────────────────────────────────────────

test('l\'échéance se dit en mots, et le retard se voit', async () => {
    const { etatEcheance, estDu } = await memosUi();
    const j = '2026-09-22';
    assert.deepStrictEqual(etatEcheance('2026-09-21', j), { ton: 'retard', libelle: 'hier' });
    assert.deepStrictEqual(etatEcheance('2026-09-19', j), { ton: 'retard', libelle: 'en retard de 3 jours' });
    assert.deepStrictEqual(etatEcheance('2026-09-22', j), { ton: 'jour', libelle: 'aujourd’hui' });
    assert.deepStrictEqual(etatEcheance('2026-09-23', j), { ton: 'proche', libelle: 'demain' });
    assert.deepStrictEqual(etatEcheance('2026-09-25', j), { ton: 'proche', libelle: 'vendredi' });
    assert.deepStrictEqual(etatEcheance('2026-10-05', j), { ton: 'plus', libelle: '5 oct.' });
    assert.deepStrictEqual(etatEcheance('2027-01-08', j), { ton: 'plus', libelle: '8 janv. 2027' });
    assert.strictEqual(etatEcheance(null, j), null);
    /* Le même « dû » que le compteur du serveur : échu ou aujourd'hui, et pas fait. */
    assert.strictEqual(estDu({ echeance: '2026-09-22' }, j), true);
    assert.strictEqual(estDu({ echeance: '2026-09-22', fait_le: '2026-09-22 10:00' }, j), false);
    assert.strictEqual(estDu({ echeance: null }, j), false);
});

test('la liste garde l\'ordre du serveur après un clic', async () => {
    const { trierMemos } = await memosUi();
    const ordre = trierMemos([
        { id: 'sans', cree_le: '2026-09-20 08:00' },
        { id: 'fait', fait_le: '2026-09-22 09:00' },
        { id: 'tard', echeance: '2026-10-05' },
        { id: 'retard', echeance: '2026-09-01' },
        { id: 'sansRecent', cree_le: '2026-09-21 08:00' },
    ]).map((m) => m.id);
    assert.deepStrictEqual(ordre, ['retard', 'tard', 'sansRecent', 'sans', 'fait']);
});

test('les rôles de l\'écran et ceux de la route ne peuvent pas diverger', async () => {
    const { ROLES_MEMO } = await memosUi();
    assert.deepStrictEqual([...ROLES_MEMO].sort(), [...STAFF_ROLES].sort(),
        'le bouton s\'afficherait à qui le serveur refuse — ou l\'inverse');
});

// ── Les écrans ───────────────────────────────────────────────────────────────────────────────

test('le bouton est à côté de la cloche, et le tableau de bord porte la même liste', () => {
    const barre = lire(path.join(UI, 'components/Topbar.jsx'));
    const posMemo = barre.indexOf('<MemoBouton />');
    assert.ok(posMemo > 0, 'le bouton doit être dans la barre du haut');
    assert.ok(posMemo < barre.indexOf('icon-btn bell'), 'juste avant la cloche');
    const tb = lire(path.join(UI, 'pages/Dashboard.jsx'));
    assert.match(tb, /ROLES_MEMO\.includes\(user\?\.role\) && \(\s*<Card title="Mémo"/,
        'la carte ne s\'affiche qu\'aux rôles qui ont des mémos');
    assert.match(tb, /<MemoListe \/>/);
});

test('le panneau ne se ferme pas quand on défile dedans', () => {
    /* Les menus d'action se ferment au défilement (MenuActions). Ici on écrit et la liste défile :
       la même règle fermerait le panneau au premier mouvement. Clic extérieur et Échap suffisent. */
    const src = sansCommentaires(lire(path.join(UI, 'components/MemoBouton.jsx')));
    assert.doesNotMatch(src, /addEventListener\("scroll"/);
    assert.match(src, /document\.addEventListener\("mousedown", dehors\)/);
    assert.match(src, /e\.key === "Escape"/);
    /* Rendu dans `document.body` : la barre porte un backdrop-filter, qui accrocherait un enfant
       `position: fixed` à elle au lieu de l'écran. */
    assert.match(src, /createPortal\(/);
    assert.match(src, /ROLES_MEMO\.includes\(user\?\.role\)/, 'pas de bouton pour qui n\'y a pas droit');
});

test('supprimer et partager ne s\'offrent qu\'à l\'auteur', () => {
    const src = sansCommentaires(lire(path.join(UI, 'components/MemoListe.jsx')));
    assert.match(src, /\{m\.mien && \(\s*<span className="memo-actions">/,
        'les deux gestes de l\'auteur sont derrière `mien`');
    assert.match(src, /updateMemo\(m\.id, \{ fait: !m\.fait_le \}\)/, 'cocher reste offert à tous');
    assert.match(src, /window\.confirm\(/, 'un effacement en lot se confirme');
    /* Les deux boutons n'apparaissent qu'au survol — un écran tactile n'en a pas, et ils y
       resteraient invisibles ET cliquables : on supprimerait un mémo sans avoir rien vu. */
    const css = lire(path.join(UI, 'styles/app.css'));
    assert.match(css, /@media \(hover:none\)\{ \.memo-actions\{opacity:1\} \}/);
});
