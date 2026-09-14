/**
 * ÉQUIPE & ACCÈS / RÔLES D'ACCÈS : CONSULTABLES SUR ACCORD, JAMAIS MODIFIABLES.
 *
 * LE DÉFAUT SIGNALÉ. Un secrétariat à qui l'on accordait « Rôles d'accès » voyait la page
 * s'ouvrir — le Guard du front se règle sur le menu, pas sur le rôle — puis l'API répondait
 * « Accès refusé ». Le menu promettait, le serveur refusait : l'écart exact qu'un contrôle par
 * rubrique doit interdire, et que ce projet a déjà payé une fois.
 *
 * DEUX CAUSES SUPERPOSÉES, l'une et l'autre nécessaires :
 *   1. `SECTIONS_NON_DELEGUEES` fermait ces rubriques à TOUTE délégation, lecture comprise ;
 *   2. leurs bases API (`equipe`, `access-profiles`) n'étaient rattachées à AUCUNE rubrique —
 *      sans rubrique pour le chemin demandé, il n'y a rien à comparer au menu, et la garde de
 *      rôle refuse seule. Lever la première sans la seconde n'aurait rien changé.
 *
 * CE QUI NE BOUGE PAS. Écrire sur ces rubriques, c'est distribuer les accès : un membre pourrait
 * se promouvoir, ou s'ouvrir toutes les autres. La borne est déplacée de « rien » à « lecture »,
 * pas supprimée.
 *
 * ET ELLE TIENT DANS LE SERVEUR, PAS DANS L'ÉCRAN. Le mode stocké n'est même pas consulté sur
 * ces rubriques : une base modifiée à la main pour y inscrire « write » n'ouvrirait rien. La
 * liste côté interface ne sert qu'à ne pas PROMETTRE un droit qui serait refusé.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const {
    accesParMenuAutorise, sectionDeLaRequete, SECTIONS_LECTURE_SEULE,
} = require('../middlewares/sectionAccess.middleware.js');

const RACINE = path.join(__dirname, '..', '..');
const lireUi = (f) => fs.readFileSync(path.join(RACINE, 'app/ui', f), 'utf8');
const NAV = lireUi('lib/nav.js');
const ROLES = lireUi('pages/AccessRoles.jsx');
const EQUIPE = lireUi('pages/Equipe.jsx');

test('les deux rubriques sont bien celles qui distribuent les accès', () => {
    assert.deepStrictEqual([...SECTIONS_LECTURE_SEULE].sort(), ['/equipe', '/roles']);
});

test('accordées, elles se consultent — quel que soit le mode stocké', () => {
    for (const section of SECTIONS_LECTURE_SEULE) {
        for (const role of ['SECRETARIAT', 'FORMATEUR', 'AUDITEUR']) {
            assert.strictEqual(
                accesParMenuAutorise({ role, method: 'GET', section, mode: 'read' }), true,
                `${role} doit pouvoir consulter ${section} si on la lui accorde`);
        }
    }
});

test('non accordées, elles restent fermées', () => {
    /* La délégation ACCORDE, elle n'ouvre pas par défaut : sans mode, rien. */
    for (const section of SECTIONS_LECTURE_SEULE) {
        assert.strictEqual(
            accesParMenuAutorise({ role: 'SECRETARIAT', method: 'GET', section, mode: null }), false);
    }
});

test('aucune écriture ne passe, même avec « write » en base', () => {
    /* LE TEST QUI COMPTE. On passe `write` exprès : si la garantie dépendait de ce que l'écran
       propose, une base modifiée à la main la contournerait. */
    for (const section of SECTIONS_LECTURE_SEULE) {
        for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
            for (const role of ['SECRETARIAT', 'FORMATEUR', 'AUDITEUR']) {
                assert.strictEqual(
                    accesParMenuAutorise({ role, method, section, mode: 'write' }), false,
                    `${role} ${method} ${section} : escalade de privilèges`);
            }
        }
    }
});

test('un rôle NON configurable n\'obtient rien, même accordé', () => {
    for (const role of ['STAGIAIRE', 'ENTREPRISE', 'INTERVENANT']) {
        for (const section of SECTIONS_LECTURE_SEULE) {
            assert.strictEqual(
                accesParMenuAutorise({ role, method: 'GET', section, mode: 'read' }), false,
                `${role} ne se délègue jamais, quelle que soit la rubrique`);
        }
    }
});

test('les bases API mènent à leur rubrique — sans quoi rien ne s\'ouvre', () => {
    const sect = (p) => sectionDeLaRequete({ path: p });
    assert.strictEqual(sect('/api/equipe'), '/equipe');
    assert.strictEqual(sect('/api/equipe/abc'), '/equipe');
    assert.strictEqual(sect('/api/access-profiles'), '/roles');
    assert.strictEqual(sect('/api/access-profiles/abc'), '/roles');
});

test('l\'écran ne propose pas une écriture que le serveur refusera', () => {
    /* Le défaut « menu ouvert, route fermée » dans l'autre sens : afficher un bouton
       « Modifier » qui ne produirait rien apprendrait à se méfier de tous les autres. */
    assert.match(NAV, /export const NAV_LECTURE_SEULE = \["\/equipe", "\/roles"\];/);
    for (const [nom, SRC] of [['Rôles d\'accès', ROLES], ['Équipe & accès', EQUIPE]]) {
        assert.match(SRC, /const lectureSeule = NAV_LECTURE_SEULE\.includes\(it\.to\);/,
            `${nom} doit reconnaître les rubriques en lecture seule`);
        assert.match(SRC, /\{on && lectureSeule \? \(/,
            `${nom} doit afficher un état figé au lieu du choix Modifier / Lecture`);
    }
});

test('aucun réglage par défaut ne pose « write » sur ces rubriques', () => {
    /* Les valeurs d'office d'un rôle, et la case « tout accorder » d'un membre, écrivaient
       `write` pour chaque page. Sur ces deux-là, le serveur l'ignore : le stocker ne ferait que
       laisser croire, dans la base comme à l'écran, à un droit qui n'existe pas. */
    for (const [nom, SRC] of [['nav.js', NAV], ['Équipe & accès', EQUIPE]]) {
        for (const ligne of SRC.split('\n')) {
            if (!ligne.includes('o[it.to] =')) continue;
            assert.match(ligne, /NAV_LECTURE_SEULE\.includes\(it\.to\)/,
                `${nom} : un réglage par défaut oublie les rubriques en lecture seule — ${ligne.trim()}`);
        }
    }
});

test('« Équipe & accès » est devenue accordable', () => {
    /* Elle était retirée de la liste des rubriques délégables : on ne pouvait même pas la
       proposer en consultation. */
    assert.doesNotMatch(NAV, /items: g\.items\.filter\(\(it\) => it\.to !== "\/equipe"\)/,
        'la rubrique Équipe ne doit plus être exclue des accès accordables');
});
