/**
 * LE BADGE S'AFFICHAIT D'UNE COULEUR, PUIS D'UNE AUTRE.
 *
 * SIGNALÉ DEPUIS UN TÉLÉPHONE le 2026-09-16 : « au chargement, la couleur du badge de formation
 * ne correspond pas aux données, mais se corrige dès qu'on clique ».
 *
 * MESURÉ SUR LA PRODUCTION, et les deux valeurs se lisent encore aujourd'hui :
 *   · NIV1H vaut #00b2b2 (cyan) dans les réglages de l'école ;
 *   · NIV1H vaut #1e3a8a (bleu marine) dans la palette de repli du code.
 * Le badge paraissait donc marine, puis devenait cyan. Une palette de repli PLAUSIBLE est
 * d'ailleurs pire qu'une couleur neutre : personne ne soupçonne un marine bien franc d'être un
 * bouche-trou.
 *
 * POURQUOI ÇA NE SE CORRIGEAIT PAS TOUT SEUL, et c'est le vrai sujet. `setBadgeColors` écrit
 * dans une table de MODULE, que personne n'observe : aucun composant n'y est abonné. Le
 * `bumpColors` posé dans AppLayout re-rendait bien le layout — mais `<Outlet />` rend un élément
 * dont React Router garde l'IDENTITÉ d'un rendu à l'autre, et React saute alors tout le
 * sous-arbre. La page ne se re-rendait donc jamais, jusqu'au premier clic qui la faisait se
 * re-rendre pour une autre raison. Sur un téléphone, où le réseau est plus lent, la page paraît
 * toujours avant les couleurs : le défaut y est systématique, là où il est intermittent ailleurs.
 *
 * LA PARADE : attendre. Plutôt que d'abonner toute l'application à une table mutable — ce qui
 * demanderait de toucher chaque composant qui affiche un badge — la palette entre dans l'écran
 * d'attente qui existait déjà. Une page ne paraît jamais avec des couleurs qu'elle devra corriger.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const sansCommentaires = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
const LAYOUT = sansCommentaires(fs.readFileSync(path.join(UI, 'layouts/AppLayout.jsx'), 'utf8'));

test('LA PALETTE EST ATTENDUE AVANT LE PREMIER RENDU', () => {
    assert.match(LAYOUT, /if \(isLoading \|\| !paletteChargee\) \{/,
        'sans cette garde, la page paraît avant de connaître les couleurs');
    assert.match(LAYOUT, /setBadgeColors\(map\)/);
});

test('ELLE NE PEUT PAS RETENIR L\'APPLICATION', () => {
    /* TROIS ISSUES, et il faut les trois : la réponse arrive, elle échoue, ou elle ne vient
       jamais. Une seule oubliée et l'application reste sur son écran d'attente — on aurait
       échangé une couleur fausse contre une page blanche, ce qui est bien pire. */
    const zone = LAYOUT.slice(LAYOUT.indexOf('const fini = ()'), LAYOUT.indexOf('}, [isConnected]);'));
    assert.match(zone, /setTimeout\(fini, 2500\)/, 'un filet si la réponse ne vient jamais');
    assert.match(zone, /\.catch\(\(\) => \{\}\)/, 'un échec réseau ne bloque pas');
    assert.match(zone, /\.finally\(\(\) => \{ clearTimeout\(filet\); fini\(\); \}\)/,
        'et la voie normale relâche aussi');
    assert.match(LAYOUT, /if \(!isConnected\) \{ setPaletteChargee\(true\); return undefined; \}/,
        'déconnecté : rien à charger, donc rien à attendre — sinon la redirection vers /login ne partirait jamais');
});

test('LE `bumpColors` QUI NE SERVAIT À RIEN A DISPARU', () => {
    /* Il re-rendait AppLayout et rien d'autre. Le laisser à côté de la vraie parade en ferait un
       commentaire qui ment : on croirait la page rafraîchie alors qu'elle ne l'est pas. */
    assert.ok(!/bumpColors/.test(LAYOUT));
});

test('LA SURCHARGE PRIME SUR LA PALETTE, ET LA CASSE N\'Y CHANGE RIEN', async () => {
    const { badgeColor, setBadgeColors } = await import('../../app/ui/lib/levels.js');
    /* Le cas exact relevé en production : la palette dit marine, l'école dit cyan. */
    assert.strictEqual(badgeColor('NIV1H'), '#1e3a8a', 'la palette de repli, avant toute surcharge');
    setBadgeColors({ NIV1H: '#00b2b2' });
    assert.strictEqual(badgeColor('NIV1H'), '#00b2b2', 'la couleur de l\'école, une fois connue');
    assert.strictEqual(badgeColor('niv1h'), '#00b2b2', 'quelle que soit la casse du code');
    /* Une formation sans couleur choisie garde la palette : la surcharge ajoute, elle ne
       remplace pas la table entière. */
    assert.strictEqual(badgeColor('NIV2'), '#eab308');
});
