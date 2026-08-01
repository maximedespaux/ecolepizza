/**
 * Toute pastille comptée par le serveur doit pouvoir S'AFFICHER quelque part.
 *
 * LE DÉFAUT GELÉ ICI. `badges.controller.js` comptait les articles sous seuil et les renvoyait
 * sous la clé `/inventaire`. Mais `/inventaire` n'a PAS d'entrée dans le menu : c'est une
 * sous-page de `/ventes` (cf. SECTION_OF). Or la barre latérale cherche la pastille avec
 * `badges[it.to]`, où `it.to` est le chemin d'une ENTRÉE de menu. Le compte était donc calculé
 * à chaque appel — une requête SQL toutes les soixante secondes — puis jeté faute d'entrée pour
 * le porter. La pastille « articles sous seuil » n'est jamais apparue.
 *
 * Rien ne signalait la panne : pas d'erreur, pas de log, juste une pastille absente. C'est
 * précisément le genre de défaut qu'un test doit tenir, parce que l'œil ne le voit pas.
 *
 * On vérifie l'INVARIANT plutôt que le cas particulier : chaque clé émise par le contrôleur
 * doit se résoudre, directement ou via SECTION_OF, sur un `to` réellement présent dans NAV.
 * Ajouter demain une pastille sur une autre sous-page rouvrirait le même trou en silence.
 *
 * Ces tests lisent le SOURCE (cf. CLAUDE.md § 2.5) : nav.js est un module ES du front, que la
 * suite node:test de l'API ne peut pas `require`.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const APP = path.join(API, '..', 'app');

const srcBadges = fs.readFileSync(path.join(API, 'controllers/badges.controller.js'), 'utf8');
const srcNav = fs.readFileSync(path.join(APP, 'ui/lib/nav.js'), 'utf8');
const srcSidebar = fs.readFileSync(path.join(APP, 'ui/components/Sidebar.jsx'), 'utf8');

/** Clés renvoyées par GET /api/badges — le bloc `data: { '/x': …, }` du contrôleur. */
function clesDesPastilles() {
    const bloc = /data:\s*\{([\s\S]*?)\}/.exec(srcBadges);
    assert.ok(bloc, 'bloc `data:` introuvable dans badges.controller.js');
    return [...bloc[1].matchAll(/['"](\/[a-z0-9-]+)['"]\s*:/gi)].map((m) => m[1]);
}

/** Table SECTION_OF de nav.js : sous-page -> rubrique de menu. */
function sectionOf() {
    const bloc = /const SECTION_OF = \{([\s\S]*?)\};/.exec(srcNav);
    assert.ok(bloc, 'SECTION_OF introuvable dans nav.js');
    const m = {};
    for (const p of bloc[1].matchAll(/"(\/[^"]+)":\s*"(\/[^"]+)"/g)) m[p[1]] = p[2];
    return m;
}

/** Chemins RÉELLEMENT présents comme entrée de menu (`to:` dans NAV). */
function cheminsDuMenu() {
    const bloc = /export const NAV = \[([\s\S]*?)\n\];/.exec(srcNav);
    assert.ok(bloc, 'NAV introuvable dans nav.js');
    return new Set([...bloc[1].matchAll(/\bto:\s*"(\/[^"]+)"/g)].map((m) => m[1]));
}

test('chaque pastille du serveur atterrit sur une entrée de menu existante', () => {
    const menu = cheminsDuMenu();
    const sections = sectionOf();
    const orphelines = clesDesPastilles().filter((cle) => !menu.has(sections[cle] || cle));
    assert.deepStrictEqual(orphelines, [],
        `pastille(s) sans entrée de menu pour les porter : ${orphelines.join(', ')} — `
        + 'comptées par le serveur, jamais affichées.');
});

test('les articles sous seuil sont bien comptés et rattachés à une rubrique', () => {
    // Le cas qui a échoué : la requête existait, la rubrique manquait.
    assert.match(srcBadges, /inventory_item[\s\S]*?quantity\s*<=\s*threshold/,
        'le compte des articles sous seuil a disparu du contrôleur');
    assert.ok(clesDesPastilles().includes('/inventaire'), 'la clé /inventaire n\'est plus émise');
    assert.strictEqual(sectionOf()['/inventaire'], '/ventes',
        '/inventaire doit se rattacher à /ventes, seule entrée de menu qui puisse porter sa pastille');
});

test('la barre latérale regroupe les pastilles par rubrique avant de les afficher', () => {
    // Sans ce passage, une pastille de sous-page redevient invisible.
    assert.match(srcSidebar, /badgesParRubrique/,
        'Sidebar.jsx doit passer les pastilles par badgesParRubrique');
    assert.match(srcSidebar, /setBadges\(badgesParRubrique\(/,
        'le regroupement doit être appliqué au chargement, pas seulement importé');
    assert.match(srcNav, /export function badgesParRubrique/, 'badgesParRubrique doit rester exportée');
});

test('le regroupement ADDITIONNE deux sous-pages d\'une même rubrique', () => {
    // Écraser au lieu d'additionner perdrait une alerte sans que rien ne le signale.
    const corps = /export function badgesParRubrique[\s\S]*?\n\}/.exec(srcNav)[0];
    assert.match(corps, /out\[rubrique\]\s*=\s*\(out\[rubrique\]\s*\|\|\s*0\)\s*\+/,
        'les pastilles d\'une même rubrique doivent s\'additionner');
    assert.match(corps, /if \(!n\) continue/, 'un compte à zéro ne doit pas créer de pastille');
});
