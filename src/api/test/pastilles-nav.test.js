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

/* ═════════════════════════════════════════════════════════════════════════════════════════════
   LA PASTILLE « SESSIONS » — les stagiaires jamais interrogés sur la transmission aux partenaires.
   ═════════════════════════════════════════════════════════════════════════════════════════════ */

test('la pastille compte l\'ABSENCE de réponse, pas un refus', () => {
    /* NI ACCEPTÉ NI REFUSÉ = aucune ligne au registre, lequel est en ajout seul : qui s'est
       prononcé y a forcément une trace. Compter `accorde = 0` compterait les REFUS — c'est-à-dire
       des gens qui ont répondu, et qu'on relancerait pour une question déjà tranchée. */
    assert.match(srcBadges, /LEFT JOIN consent_record[\s\S]*?c\.id IS NULL/,
        'La pastille doit compter les stagiaires SANS ligne au registre.');
    assert.doesNotMatch(srcBadges, /c\.accorde\s*=\s*0/,
        'Un refus est une réponse : il ne doit pas gonfler la pastille.');
    assert.ok(clesDesPastilles().includes('/sessions'), 'la clé /sessions n\'est plus émise');
});

test('la pastille se limite aux sessions en cours ou à venir, et à une personne par tête', () => {
    /* SANS LA BORNE DE DATE, la pastille compterait tout le fichier — un nombre à quatre chiffres
       que personne ne peut faire descendre, puisque les stagiaires d'il y a six ans ne repasseront
       pas. Une pastille qui ne bouge jamais cesse d'être lue, et emporte les autres avec elle. */
    assert.match(srcBadges, /COALESCE\(s\.end_date, s\.start_date\) >= CURDATE\(\)/,
        'Seules les sessions non terminées peuvent être comptées.');
    /* Et DISTINCT : deux inscriptions pour la même personne, c'est UNE question à poser. */
    assert.match(srcBadges, /COUNT\(DISTINCT e\.learner_id\)/,
        'La pastille compte des personnes, pas des inscriptions.');
});

test('aucune pastille tant qu\'aucun partenaire ne reçoit rien', () => {
    /* La 131 démarre à zéro destinataire, volontairement. Tant que l'école n'a coché personne,
       demander un consentement reviendrait à faire autoriser une transmission vers personne :
       la pastille enverrait courir après des signatures pour un flux qui n'existe pas. Le contrat
       compte au même titre — une convention échue ne reçoit plus rien. */
    assert.match(srcBadges, /recoit_coordonnees = 1[\s\S]*?CONTRAT_VALABLE/,
        'Le compte des destinataires doit exiger la case ET un contrat valable.');
    assert.match(srcBadges, /if \(!destinataires\) return 0;/,
        'Sans destinataire, la pastille doit valoir zéro sans même interroger le registre.');
});

test('répondre pour quelqu\'un fait redescendre la pastille tout de suite', () => {
    /* La barre latérale ne sonde que toutes les 60 s. Sans ce signal, on saisit trois réponses,
       le compte ne bouge pas, et l'on croit que rien ne s'est enregistré. Le bus existait déjà
       (`lib/events.js`) mais AUCUN appelant ne l'utilisait — il était branché dans le vide. */
    const src = fs.readFileSync(path.join(APP, 'ui/components/SessionConsentements.jsx'), 'utf8');
    assert.match(src, /import \{ bumpBadges \}/, 'SessionConsentements doit importer bumpBadges.');
    assert.match(src, /await charger\(\);[\s\S]{0,400}?bumpBadges\(\);/,
        'Après une réponse enregistrée, la pastille doit être rafraîchie.');
    assert.match(srcSidebar, /onBadgesRefresh\(load\)/, 'La barre latérale doit écouter le bus.');
});
