/**
 * LE SON DU BACKOFFICE — seulement pour une ALERTE, et jamais pour l'écho de mon propre geste.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * CE FICHIER S'APPELAIT `son-activite.test.js`, ET IL GELAIT L'INVERSE. Il exigeait que le Topbar
 * sonne « l'activité d'AUTRUI » : un carillon à chaque écriture de n'importe qui dans l'organisme.
 * C'était une fonctionnalité voulue. L'école l'a retirée le 2026-09-17 : « trop de sons, sans
 * savoir d'où ils viennent ».
 *
 * La plainte était structurelle, pas un réglage à ajuster. Le signal temps réel est VIDE depuis
 * le pentest d'août — il faisait fuiter la trace des actions du personnel vers les stagiaires. Un
 * son sur ce signal ne pouvait donc JAMAIS dire ce qui s'était passé, et rien ne s'affichait au
 * même instant. Mesuré sur le journal du 16/09 : soixante-sept actions dont dix-neuf entre 16 h et
 * 17 h — un plancher, les écritures non journalisées sonnant aussi.
 *
 * LA RÈGLE, alignée sur les onglets de la page Notifications : une ALERTE appelle un geste, elle
 * sonne et la cloche se secoue au même instant. L'ACTIVITÉ est une information, elle ne sonne pas.
 *
 * Deux protections du fichier d'origine gardent tout leur sens, et restent : le repère de mes
 * propres écritures (une alerte peut être l'écho de mon geste), et l'anti-doublon.
 *
 * Tests de SOURCE (regex) : renommer une de ces fonctions casse le test — c'est voulu, ça signale
 * un contrat entre trois fichiers front (apiClient / Topbar / notifSound).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

/* Sans les commentaires : ceux de Topbar racontent l'ancien son d'activité — `playNotif` sur le
   signal temps réel — pour expliquer pourquoi il a disparu. Une assertion d'ABSENCE les trouvait. */
const sansCommentaires = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
const lire = (rel) => sansCommentaires(fs.readFileSync(path.join(__dirname, '..', '..', 'app/ui', rel), 'utf8'));
const api = lire('api/apiClient.js');
const top = lire('components/Topbar.jsx');
const son = lire('lib/notifSound.js');

test('apiClient note l\'instant de MES écritures (POST/PUT/PATCH/DELETE), pas des lectures', () => {
    assert.match(api, /export function msDepuisMutationLocale/,
        'le Topbar a besoin de savoir depuis quand je n\'ai pas agi moi-même.');
    assert.match(api, /const mutation = methode !== "GET" && methode !== "HEAD";/,
        'une mutation pose le repère ; une simple lecture (GET) ne le doit pas.');
    /* À L'ENVOI ET À L'ARRIVÉE. La diffusion du serveur part à la FIN de la requête : posé à
       l'envoi seulement, une action lente — sceller un PDF signé — voyait son écho arriver après
       la fenêtre de garde, et sonnait. */
    assert.match(api, /if \(mutation\) marquerMutationLocale\(\);\s*try \{/, 'à l\'envoi');
    assert.match(api, /finally \{\s*if \(mutation\) marquerMutationLocale\(\);/, 'et à l\'arrivée');
    // Les uploads FormData court-circuitent request() : ils doivent marquer aussi.
    assert.ok((api.match(/marquerMutationLocale\(\)/g) || []).length >= 4,
        'les uploads directs (import archives, image, pièce, modèle) doivent aussi marquer.');
});

test('le repère est PARTAGÉ entre les onglets du navigateur', () => {
    /* Il vivait dans une variable de module, donc PAR ONGLET : un geste dans l'onglet de devant
       sonnait dans celui de derrière, qui ne l'avait pas vu passer — « un son sans savoir d'où il
       vient », très exactement. */
    assert.match(api, /localStorage\.setItem\(CLE_MUTATION, String\(derniereMutationLocale\)\)/);
    assert.match(api, /Math\.max\(t, Number\(localStorage\.getItem\(CLE_MUTATION\)\) \|\| 0\)/,
        'lu en prenant le plus récent des deux, local ou partagé');
    // Le stockage peut être indisponible (navigation privée stricte) : jamais une exception.
    assert.match(api, /try \{ localStorage\.setItem\(CLE_MUTATION/, 'écriture protégée');
    assert.match(api, /try \{ t = Math\.max\(t, Number\(localStorage\.getItem\(CLE_MUTATION\)\)/, 'lecture protégée');
});

test('le Topbar ne sonne QUE pour une alerte, jamais pour l\'activité', () => {
    /* LE SIGNAL TEMPS RÉEL NE JOUE PLUS RIEN. L'abonnement qui reste recharge le compteur, et ce
       n'est plus le signal qui décide du son : c'est la hausse des ALERTES. */
    const abonnement = top.slice(top.indexOf('subscribeRealtime('));
    assert.ok(!/subscribeRealtime\(\(\)\s*=>\s*\{[^}]*playNotif/.test(top),
        'aucun son directement sur le signal temps réel — il est vide, il ne peut rien dire');
    assert.match(abonnement, /document\.visibilityState === "hidden"\) loadNotifs\(\)/,
        'il ne fait que RECHARGER, et seulement un onglet masqué');

    /* ON COMPTE LES ALERTES (`data`), PAS LE TOTAL (`unread`), qui inclut l'activité des collègues :
       comparer le total aurait fait sonner chaque ligne d'activité au sondage suivant. */
    assert.match(top, /const alertes = \(r\.data \|\| \[\]\)\.filter\(\(x\) => !x\.is_read\)\.length;/);
    assert.match(top, /alertes > prevAlertes\.current && msDepuisMutationLocale\(\) > \d+\)/,
        'une hausse d\'alertes, hors écho de mon propre geste');
    assert.ok(!/prevUnread/.test(top), 'plus de comparaison sur le total');
});

test('un onglet en arrière-plan peut encore sonner pour une alerte', () => {
    /* C'EST LÀ QU'UNE ALERTE SERT : quand on travaille ailleurs. Or `useAutoRefresh` s'arrête dès
       que l'onglet est masqué — sans l'abonnement ci-dessus, retirer le son d'activité aurait
       aussi rendu muettes les vraies alertes, jusqu'au retour sur l'onglet. */
    const hook = lire('lib/useAutoRefresh.js');
    assert.match(hook, /if \(document\.visibilityState !== "hidden"\)/, 'le rechargement habituel s\'arrête en arrière-plan…');
    assert.match(top, /subscribeRealtime\(\(\) => \{\s*if \(document\.visibilityState === "hidden"\) loadNotifs\(\);/,
        '…d\'où ce rechargement-ci, réservé à l\'onglet masqué pour ne pas interroger deux fois');
});

test('un même événement ne sonne qu\'une fois (anti-doublon)', () => {
    assert.match(son, /dernierSon/, 'playNotif doit mémoriser le dernier carillon.');
    assert.match(son, /Date\.now\(\)[\s\S]*?dernierSon\s*<\s*\d+/,
        'plusieurs rechargements qui se croisent sur une même alerte ⇒ un seul « pop ».');
});
