/**
 * SON D'ACTIVITÉ TEMPS RÉEL — « quelqu'un d'AUTRE a agi » déclenche un carillon dans le
 * backoffice, mais JAMAIS ma propre action.
 *
 * Le serveur diffuse un « refresh » à toute l'organisation sur chaque mutation (realtime),
 * y compris les miennes. Trois défauts réels, gelés ici :
 *   1. sans repère de mutation locale, mes propres clics me sonneraient (écho de soi-même) ;
 *   2. sans l'abonnement temps réel dans le Topbar, aucun son sur l'activité d'autrui ;
 *   3. sans l'anti-doublon, une notification qui m'est destinée sonnerait DEUX fois
 *      (déclencheur notification + déclencheur activité sur le même événement).
 *
 * Tests de SOURCE (regex) : renommer une de ces fonctions casse le test — c'est voulu,
 * ça signale un contrat entre trois fichiers front (apiClient / Topbar / notifSound).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const lire = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', 'app/ui', rel), 'utf8');
const api = lire('api/apiClient.js');
const top = lire('components/Topbar.jsx');
const son = lire('lib/notifSound.js');

test('apiClient note l\'instant de MES mutations (POST/PUT/PATCH/DELETE), pas des lectures', () => {
    assert.match(api, /export function msDepuisMutationLocale/,
        'le Topbar a besoin de savoir depuis quand je n\'ai pas agi moi-même.');
    // Dans request() : une méthode mutante (hors GET/HEAD) marque l'instant.
    assert.match(api, /methode !== "GET" && methode !== "HEAD"\)\s*marquerMutationLocale\(\)/,
        'une mutation doit poser le repère ; une simple lecture (GET) ne le doit pas.');
    // Les uploads FormData court-circuitent request() : ils doivent marquer aussi, sinon
    // téléverser un modèle ou importer des archives me sonnerait moi-même.
    assert.ok((api.match(/marquerMutationLocale\(\)/g) || []).length >= 4,
        'les uploads directs (import archives, image, pièce, modèle) doivent aussi marquer.');
});

test('le Topbar sonne l\'activité d\'AUTRUI, et jamais la mienne (garde msDepuisMutationLocale)', () => {
    assert.match(top, /import \{ subscribeRealtime \} from "\.\.\/lib\/realtime\.js"/,
        'le son d\'activité s\'appuie sur le flux temps réel.');
    // L'abonnement ne joue le son QUE si aucune de mes actions n'est récente.
    assert.match(top, /subscribeRealtime\(\(\)\s*=>\s*\{[\s\S]*?msDepuisMutationLocale\(\)\s*>\s*\d+[\s\S]*?playNotif\(\)[\s\S]*?\}\)/,
        'sans la garde msDepuisMutationLocale, mes propres mutations me sonneraient (écho de soi-même).');
});

test('un même événement ne sonne qu\'une fois (anti-doublon notification + activité)', () => {
    assert.match(son, /dernierSon/, 'playNotif doit mémoriser le dernier carillon.');
    assert.match(son, /Date\.now\(\)[\s\S]*?dernierSon\s*<\s*\d+/,
        'deux déclencheurs sur le même événement ⇒ un seul « pop » dans une courte fenêtre.');
});
