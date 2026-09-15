/**
 * QUATRE DÉFAUTS D'AUTORISATION TROUVÉS EN REVUE DE SÉCURITÉ, gelés ici.
 *
 * Ils partagent une famille : deux objets vérifiés SÉPARÉMENT contre l'organisme, puis appariés
 * librement — ou une garde qui ne s'exécute pas. Aucun ne franchit la frontière entre organismes ;
 * tous franchissent une frontière INTERNE, entre le formateur, le bureau et le jury externe.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const EVAL = lire('controllers/evaluation.controller.js');
const INTERV = lire('controllers/intervenant.controller.js');
const ROUTES_EVAL = lire('routes/evaluation.routes.js');
const EXAMEN = lire('controllers/examen.controller.js');

test('ON N\'IMPOSE PAS UN PARAMÈTRE EN RÉÉCRIVANT `req.query`', () => {
    /* LE DÉFAUT LE PLUS RETORS DES QUATRE, parce qu'il se LISAIT comme une garde. Sous Express 5,
       `req.query` est un accesseur EN LECTURE SEULE sur le prototype de la requête :
       l'affectation échoue en silence en mode non strict. La ligne
       `req.query = { ...req.query, role: 'JURY' }` ne faisait donc rien, et un membre externe du
       jury lisait la grille du FORMATEUR en ajoutant `?role=FORMATEUR` à l'URL.
       Vérifié contre l'Express installé. Un rôle imposé se passe en ARGUMENT. */
    assert.ok(!/req\.query\s*=/.test(INTERV), 'réécrire req.query est sans effet sous Express 5');
    assert.match(INTERV, /getNotesSession\(req, res, 'JURY'\)/,
        'le rôle doit être imposé par argument');
    assert.match(EVAL, /const getNotesSession = async \(req, res, roleImpose\)/);
    assert.match(EVAL, /roleImpose \? roleValide\(roleImpose\)/,
        'et l\'argument doit l\'emporter sur le paramètre d\'URL');
});

test('LA MÊME ERREUR NE DORT NULLE PART AILLEURS dans l\'API', () => {
    /* Le motif est invisible à la lecture : il faut le chercher partout, une fois pour toutes. */
    const dossiers = ['controllers', 'middlewares', 'lib', 'routes'];
    const fautifs = [];
    for (const d of dossiers) {
        for (const f of fs.readdirSync(path.join(__dirname, '..', d))) {
            if (!f.endsWith('.js')) continue;
            /* LES COMMENTAIRES SONT RETIRÉS AVANT LE BALAYAGE. Sans cela le test se déclenche
               sur l'explication qui documente le défaut — un piège déjà tombé dans ce dépôt :
               une assertion qui trouve son propre commentaire ne prouve rien et, pire, elle
               empêche d'écrire le commentaire. */
            const src = lire(path.join(d, f))
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/(^|[^:])\/\/.*$/gm, '$1');
            if (/\breq\.query\s*=[^=]/.test(src)) fautifs.push(`${d}/${f}`);
        }
    }
    assert.deepStrictEqual(fautifs, [], `réécriture de req.query (sans effet) dans :\n  ${fautifs.join('\n  ')}`);
});

test('LES NOTES SERVIES SONT CELLES DE LA GRILLE DEMANDÉE, pas toutes', () => {
    /* Sans la jointure, l'écran du jury recevait TOUTES les notes des dossiers — les deux
       grilles — dont les appréciations libres que le formateur a écrites sur chaque stagiaire
       pendant le stage. Un membre externe du jury n'a pas à les lire. */
    const i = EVAL.indexOf('FROM evaluation_note n');
    assert.ok(i > 0, 'la lecture des notes doit joindre les exercices');
    const req = EVAL.slice(i, i + 220);
    assert.match(req, /JOIN evaluation_exercice x ON x\.id = n\.exercice_id/);
    assert.match(req, /WHERE x\.grille_id = \?/, 'et se borner à la grille servie');
});

test('UN EXERCICE NE SE NOTE QUE SUR LE DOSSIER DONT C\'EST LE PARCOURS', () => {
    /* Les deux identifiants étaient vérifiés séparément contre l'organisme, donc appariables
       librement : un juré externe pouvait noter un exercice de la grille du FORMATEUR sur son
       candidat — des points qui alimentent les totaux, la condition de réussite et les jetons
       imprimés sur des documents signés. Et le bureau pouvait cocher les critères du jury, que
       la route « verdict » lui refuse pourtant explicitement. */
    const i = EVAL.indexOf('const saveNote = async');
    const corps = EVAL.slice(i, i + 3000);
    assert.match(corps, /JOIN evaluation_grille g ON g\.id = x\.grille_id/);
    assert.match(corps, /JOIN training_session s ON s\.id = e\.session_id AND s\.program_id = g\.program_id/,
        'l\'exercice doit appartenir au parcours du dossier');
});

test('LE RÔLE DE GRILLE AUTORISÉ VIENT DE LA ROUTE, jamais de la requête', () => {
    /* S'il était lu dans le corps ou l'URL, la garde ci-dessus se contournerait en une ligne. */
    assert.match(ROUTES_EVAL, /saveNote\(req, res, 'FORMATEUR'\)/,
        'le bureau écrit la grille du formateur');
    assert.match(INTERV, /saveNote\(req, res, 'JURY'\)/, 'le jury écrit la sienne');
    const i = EVAL.indexOf('const saveNote = async');
    const corps = EVAL.slice(i, i + 3000);
    assert.ok(!/roleAttendu\s*=\s*req\./.test(corps), 'le rôle attendu ne se lit pas dans la requête');
});

test('LES ÉCRITURES D\'ÉVALUATION ET DE COMMISSION OBÉISSENT AU MODE LECTURE SEULE', () => {
    /* `enforceSectionMode` ne contrôle QUE les bases cartographiées : « if (!section) return
       next() ». `evaluations` et `examens` n'y étaient pas, donc un secrétariat passé en LECTURE
       sur /sessions pouvait quand même noter, décider de la certification d'un candidat et
       CLÔTURER la commission — geste irréversible. Menu fermé, route ouverte : le défaut déjà
       payé sur companies, opcos, quest et boutique. */
    const { sectionDeLaRequete } = require('../middlewares/sectionAccess.middleware.js');
    for (const url of ['/api/examens/session/abc', '/api/examens/decision',
        '/api/examens/session/abc/cloturer', '/api/evaluations/note']) {
        assert.strictEqual(sectionDeLaRequete({ originalUrl: url, path: url }), '/sessions',
            `${url} doit relever de la rubrique « Sessions »`);
    }
});

test('LE MODÈLE DU PROCÈS-VERBAL EST ÉPINGLÉ', () => {
    /* Le slug venait de l'URL : un formateur — qui n'a aucun accès à /api/templates — pouvait
       faire rendre en PDF n'importe quel modèle « builder » de l'organisme en le nommant. */
    const i = EXAMEN.indexOf('const pvPdf');
    const corps = EXAMEN.slice(i, i + 1600);
    assert.ok(!/req\.query\.slug/.test(corps), 'le modèle ne se choisit pas dans l\'URL');
    assert.match(corps, /const slug = 'pv-jury';/);
});

test('UNE COMPÉTENCE ÉTRANGÈRE NE S\'ATTACHE PAS À UN EXERCICE', () => {
    /* `competence_id` partait du client vers la base sans contrôle, et la migration 149 ne pose
       pas de clé étrangère : un identifiant étranger détachait l'exercice de son barème sans
       rien signaler. */
    assert.match(EVAL, /idComp\.has\(ex\.competence_id\)\s*\?\s*idComp\.get\(ex\.competence_id\)\s*:\s*null/);
});

/* ---------------------------------------------------------------------------------------- */

/**
 * LA PREUVE PAR L'EXÉCUTION pour le défaut principal. Les assertions de source ci-dessus gèlent
 * la FORME de la correction ; celle-ci vérifie l'EFFET — qu'un paramètre d'URL ne choisit plus
 * la grille servie à un membre externe du jury.
 */
const cheminDb = require.resolve('../config/database.js');
const GRILLES = {
    FORMATEUR: { id: 'g-form', program_id: 'p1', role: 'FORMATEUR', label: 'Notation du formateur', pass_score: 70, template_slug: null, active: 1 },
    JURY: { id: 'g-jury', program_id: 'p1', role: 'JURY', label: 'Grille du jury', pass_score: null, template_slug: null, active: 1 },
};
let grilleDemandee = null;
const faux = {
    promise: () => ({
        query: async (sql, params) => {
            if (/information_schema/i.test(sql)) return [[{ 1: 1 }]];
            if (/FROM session_intervenant/i.test(sql)) return [[{ id: 'si-1' }]];          // affecté
            if (/FROM training_session s JOIN training_program/i.test(sql)) return [[{ id: 's1', program_id: 'p1', code: 'RS7404', title: 'T' }]];
            if (/FROM evaluation_grille/i.test(sql)) {
                grilleDemandee = params[2];                                                 // le rôle réellement demandé
                return [[GRILLES[params[2]] || null].filter(Boolean)];
            }
            if (/FROM evaluation_exercice/i.test(sql)) return [[]];
            if (/FROM evaluation_competence/i.test(sql)) return [[]];
            if (/FROM enrollment e LEFT JOIN learner/i.test(sql)) return [[]];
            return [[]];
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
};
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };
const { getMyJuryGrille } = require('../controllers/intervenant.controller.js');

test('UN PARAMÈTRE D\'URL NE CHOISIT PLUS LA GRILLE SERVIE AU JURY', async () => {
    /* L'ATTAQUE EXACTE : un membre externe du jury, réellement affecté à la session, demande
       `?role=FORMATEUR`. Avant, il recevait la grille de notation continue du formateur. */
    for (const tentative of ['FORMATEUR', 'JURY', 'n-importe-quoi', undefined]) {
        grilleDemandee = null;
        const res = { status() { return this; }, json() { return this; } };
        /* `query` EST POSÉE EN ACCESSEUR SANS MUTATEUR, comme Express 5 la pose sur le prototype
           de la requête. C'est la condition qui rend le défaut réel : avec un objet ordinaire,
           `req.query = {…}` FONCTIONNE et le test passerait au vert en laissant la faille —
           vérifié en réintroduisant le défaut, qui ne le faisait pas virer au rouge. */
        const q = tentative ? { role: tentative } : {};
        const req = {
            params: { id: 's1' },
            user: { id: 'u-jure', organization_id: 'o1', role: 'INTERVENANT' }, headers: {},
        };
        Object.defineProperty(req, 'query', { get: () => q, configurable: true });
        await getMyJuryGrille(req, res);
        assert.strictEqual(grilleDemandee, 'JURY',
            `avec ?role=${tentative} la grille servie doit rester celle du JURY`);
    }
});
