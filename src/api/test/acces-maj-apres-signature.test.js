/**
 * LE POINT D'ACCÈS SE DÉBLOQUE DÈS LA SIGNATURE, SANS ATTENDRE UNE NAVIGATION (constaté le 2026-09-24).
 *
 * Le « checkpoint » d'une formation (point de rupture) ferme Pizza Quest, les Outils et la
 * Communauté tant que le stagiaire n'a pas signé tous ses documents jusqu'au point. C'est juste :
 * mesuré sur une stagiaire NIV1H arrivée via une entreprise, tout était verrouillé À RAISON tant
 * que « Droit à l'image » — le dernier document avant le point — n'était pas signé.
 *
 * LE DÉFAUT, GELÉ ICI. StudentLayout ne relisait l'accès (getMyAccess) qu'au CHANGEMENT DE PAGE.
 * Or on signe son dernier document SUR PLACE, dans DocumentViewModal, qui ne change pas d'URL :
 * une fois le point franchi, la coquille restait grisée (Pizza Quest, Outils, Communauté) jusqu'à
 * ce que le stagiaire navigue ailleurs. On émet donc un signal `ACCES_EVENT` à la signature, que
 * StudentLayout écoute pour redemander l'accès au serveur — même schéma que `COMMUNITY_EVENT`.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (f) => fs.readFileSync(path.join(UI, f), 'utf8');

test('gamification.js expose le signal ACCES_EVENT et son émetteur pingAcces', () => {
    const g = lire('lib/gamification.js');
    assert.match(g, /export const ACCES_EVENT\s*=/, 'le nom de l\'événement doit être exporté');
    assert.match(g, /export const pingAcces\s*=\s*\(\)\s*=>\s*window\.dispatchEvent\(new Event\(ACCES_EVENT\)\)/,
        'pingAcces émet l\'événement (comme pingCommunaute)');
});

test('DocumentViewModal émet pingAcces APRÈS la signature du document', () => {
    const m = lire('components/DocumentViewModal.jsx');
    assert.match(m, /import \{ pingAcces \} from "\.\.\/lib\/gamification\.js"/);
    /* L'ordre compte : le ping suit signDocument (le serveur a enregistré la signature), sinon
       StudentLayout relirait l'accès AVANT que le point soit franchi et se croirait encore fermé. */
    const iSign = m.indexOf('await signDocument(id');
    const iPing = m.indexOf('pingAcces()');
    assert.ok(iSign > 0 && iPing > iSign, 'pingAcces() doit être appelé après await signDocument(...)');
});

test('StudentLayout relit l\'accès sur ACCES_EVENT, pas seulement au changement de page', () => {
    const l = lire('layouts/StudentLayout.jsx');
    assert.match(l, /ACCES_EVENT/, 'le nom de l\'événement doit être importé');
    /* Un vrai écouteur d'ACCES_EVENT qui rappelle la lecture de l'accès. */
    assert.match(l, /addEventListener\(ACCES_EVENT,\s*rafraichirAcces\)/);
    assert.match(l, /removeEventListener\(ACCES_EVENT,\s*rafraichirAcces\)/, 'écouteur retiré au démontage');
    /* rafraichirAcces lit BIEN l'accès complet (le verrou unlocked, pas juste une pastille). */
    assert.match(l, /const rafraichirAcces = useCallback\(/);
    const corps = l.slice(l.indexOf('const rafraichirAcces'), l.indexOf('const rafraichirAcces') + 500);
    assert.match(corps, /getMyAccess\(\)/);
    assert.match(corps, /setUnlocked\(/, 'le rafraîchissement doit reposer le verrou Pizza Quest/Outils/Communauté');
});
