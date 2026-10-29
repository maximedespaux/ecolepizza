/**
 * REFONTE DU CHOIX DE LA COMMISSION (demandé le 2026-10-29, sur retour de l'école).
 *
 * Trois défauts relevés en production sur la liste des membres :
 *  1. DES DOUBLONS DE NOM : une même personne a deux comptes (« Despaux Maxime » administration ET
 *     formateur) — on ne savait pas lequel choisir. On départage par l'e-mail (labelPersonne) ;
 *  2. « actuellement : … » obscur : les membres d'AVANT, saisis à la main, s'affichaient ainsi. On
 *     les RATTACHE à leur compte par le nom (un seul homonyme → relié), sinon on le DIT clairement ;
 *  3. UN INTERVENANT « JURY » N'EST PAS UN FORMATEUR : les membres du jury sont inscrits comme
 *     intervenants de la session avec la spécialité « Jury » (ils délibèrent, ils n'enseignent pas).
 *     Les compter comme « a formé » les signalait à tort en conflit (relevé sur RIOS / LE FAOU).
 *
 * Ces tests gèlent : l'exclusion de la spécialité « jury » du contrôle « a formé » (+ l'e-mail rendu),
 * et le câblage de l'écran (rattachement, deux groupes, départage par e-mail, message clair).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const API = path.join(__dirname, '..');
const lireApi = (f) => fs.readFileSync(path.join(API, f), 'utf8');
const lireUi = (f) => fs.readFileSync(path.join(API, '..', 'app', 'ui', f), 'utf8');

const { personnesDuRegistre } = require('../controllers/examen.controller.js');

test('personnesDuRegistre : rend l\'e-mail et EXCLUT la spécialité « jury » du « a formé »', async () => {
    const conn = {
        query: async (sql) => {
            if (/FROM session_intervenant/i.test(sql)) {
                // Le filtre « pas jury » DOIT être dans la requête (sinon un membre « Jury » serait flaggé).
                assert.match(sql, /LOWER\(specialty\) NOT LIKE/, 'la spécialité « jury » est écartée côté SQL');
                return [[{ user_id: 'u-form' }]]; // ce que la base RENVOIE une fois filtrée : un vrai formateur
            }
            if (/FROM user/i.test(sql)) return [[
                { user_id: 'u-form', first_name: 'Paul', last_name: 'Dubois', email: 'p@x.fr', role: 'INTERVENANT' },
                { user_id: 'u-sec', first_name: 'Marie', last_name: 'Albert', email: 'm@x.fr', role: 'SECRETARIAT' },
            ]];
            return [[]];
        },
    };
    const personnes = await personnesDuRegistre(conn, 'o1', 's-1');
    const parId = new Map(personnes.map((p) => [p.user_id, p]));
    assert.strictEqual(parId.get('u-form').email, 'p@x.fr', 'l\'e-mail est rendu (pour départager les homonymes)');
    assert.strictEqual(parId.get('u-form').a_forme, true, 'un formateur (hors jury) reste signalé');
    assert.strictEqual(parId.get('u-sec').a_forme, false);
});

test('examen.controller : la requête « a formé » écarte la spécialité « jury » et lit l\'e-mail', () => {
    const ctrl = lireApi('controllers/examen.controller.js');
    const fn = ctrl.slice(ctrl.indexOf('async function personnesDuRegistre'), ctrl.indexOf('async function personnesDuRegistre') + 1300);
    assert.match(fn, /AND \(specialty IS NULL OR LOWER\(specialty\) NOT LIKE \?\)/);
    assert.match(fn, /'%jury%'/);
    assert.match(fn, /SELECT id AS user_id, first_name, last_name, email, role FROM user/);
});

test('CommissionJury : rattache un membre saisi à la main à son compte (un seul homonyme)', () => {
    const ui = lireUi('components/CommissionJury.jsx');
    assert.match(ui, /const rattacher = \(m\) =>/);
    assert.match(ui, /cands\.length === 1 \? \{ \.\.\.m, user_id: cands\[0\]\.user_id, nom: cands\[0\]\.last_name, prenom: cands\[0\]\.first_name \}/);
    assert.match(ui, /c\.jury\.map\(rattacher\)/, 'appliqué au chargement de la commission');
    // Le « actuellement : … » obscur en OPTION a disparu : le placeholder est neutre.
    assert.match(ui, /<option value="">— choisir une personne —<\/option>/);
    assert.doesNotMatch(ui, /`actuellement/, 'plus de libellé d\'option « actuellement : … »');
});

test('CommissionJury : deux groupes (Intervenants / Équipe) et départage des homonymes par e-mail', () => {
    const ui = lireUi('components/CommissionJury.jsx');
    assert.match(ui, /\[\["intervenant", "Intervenants"\], \["equipe", "Équipe"\]\]/);
    assert.match(ui, /<optgroup key=\{grp\} label=\{titre\}>/);
    assert.match(ui, /const labelPersonne = \(p\) =>/);
    assert.match(ui, /nomsEnDouble\.has\(cleNom\(p\.last_name, p\.first_name\)\) \? ` · \$\{p\.email/);
    assert.match(ui, /ROLE_LABELS\[p\.role\]/, 'un membre d\'équipe porte son rôle en clair');
});

test('CommissionJury : un membre non rattaché est signalé clairement (pas « actuellement »)', () => {
    const ui = lireUi('components/CommissionJury.jsx');
    assert.match(ui, /const nonTrouve = !m\.user_id && !!\(m\.nom \|\| ""\)\.trim\(\);/);
    assert.match(ui, /pas rattaché à un compte/);
});
