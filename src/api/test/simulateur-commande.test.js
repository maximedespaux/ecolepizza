/**
 * « FAIS TA PIZZA » : UNE COMMANDE TIRÉE AU SORT, PAS UN MENU.
 *
 * L'écran d'accueil montrait quatre pavés — « Classique », « Napolitaine AVPN », « Contemporaine »,
 * « In teglia ». On prenait toujours le même, et comme le style était NOMMÉ en gras pendant tout
 * le réglage, la bonne réponse s'apprenait par cœur : quatre jeux de quatre valeurs, et le
 * simulateur ne simulait plus rien.
 *
 * Le jeu s'ouvre maintenant sur une COMMANDE : « J'ai vu vos photos : le bord bien alvéolé ».
 * C'est au joueur de traduire — le geste du comptoir, et le seul qui s'apprenne.
 *
 * ⚠ CE QUI N'EST SURTOUT PAS ALÉATOIRE : les valeurs. Les fenêtres de W, d'hydratation et de
 * température viennent des manuels et du disciplinare AVPN. Les tirer au hasard produirait des
 * napolitaines à 300 °C — un jeu « varié » qui enseigne du faux est pire qu'un jeu répétitif.
 * Seules la FORMULATION et le style tiré changent.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui',
    'components', 'SimulateurPizza.jsx'), 'utf8');
const rendu = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

test('chaque style a ses commandes, et il y en a plusieurs', () => {
    const styles = [...rendu.matchAll(/id: "(\w+)"/g)].map((m) => m[1]);
    assert.ok(styles.length >= 4, 'les quatre styles des manuels doivent rester');
    const bloc = /const COMMANDES = \{([\s\S]*?)\n\};/.exec(rendu);
    assert.ok(bloc, 'COMMANDES introuvable');
    for (const s of styles) {
        const liste = new RegExp(`${s}: \\[([\\s\\S]*?)\\]`).exec(bloc[1]);
        assert.ok(liste, `« ${s} » n'a aucune commande : il sortirait sans phrase de client.`);
        const n = (liste[1].match(/"/g) || []).length / 2;
        assert.ok(n >= 3, `« ${s} » n'a que ${n} formulation(s) : deux parties suffiraient à en faire le tour.`);
    }
});

test('le style n\'est PAS nommé pendant le réglage', () => {
    /* C'est toute la différence : un nom en gras au-dessus des curseurs, et le jeu redevient une
       table de correspondance. Le briefing, lui, guide en MOTS — « une farine 00, peu cendrée » —
       ce qui rend la commande soluble sans la nommer. */
    const bandeau = /<div className="sim-goal">([\s\S]*?)<\/div>/.exec(rendu);
    assert.ok(bandeau, 'le bandeau de commande est introuvable');
    assert.doesNotMatch(bandeau[1], /obj\.nom/, 'le nom du style ne doit pas s\'afficher pendant le réglage');
    assert.match(bandeau[1], /cmd\.dit/, 'c\'est la phrase du client qui s\'affiche');
});

test('le verdict dit TOUJOURS ce que le client demandait', () => {
    /* Le nom ne tombait qu'au sans-faute : en ratant, on ne savait donc jamais ce qu'il aurait
       fallu reconnaître — et c'est exactement là qu'on apprend. Cacher le nom pendant le réglage
       rend le jeu instructif ; le cacher au verdict le rendrait seulement obscur. */
    assert.match(rendu, /className="sim-etait"/, 'le rappel du style doit exister');
    const bloc = /<p className="sim-etait">([\s\S]*?)<\/p>/.exec(rendu);
    assert.ok(bloc, 'le rappel est introuvable');
    assert.match(bloc[1], /Le client demandait une <b>\{obj\.nom\}<\/b>/, 'il nomme le style');
    /* Hors de toute condition : ni `stars === 3`, ni `encoreEnVie`. */
    assert.doesNotMatch(bloc[1], /stars|encoreEnVie|\?/, 'il ne doit dépendre d\'aucune réussite');
});

test('les valeurs des manuels ne sont pas tirées au sort', () => {
    /* Le tirage porte sur le STYLE et la FORMULATION, jamais sur les fenêtres. Un `Math.random`
       dans les objectifs produirait des napolitaines à 300 °C. */
    const objectifs = /const OBJECTIFS = \[([\s\S]*?)\n\];/.exec(rendu);
    assert.ok(objectifs, 'OBJECTIFS introuvable');
    assert.doesNotMatch(objectifs[1], /Math\.random|alea\(/,
        'les fenêtres viennent des manuels : les tirer au sort enseignerait du faux');
    /* Et la napolitaine garde sa température de disciplinare, preuve que rien n'a glissé. */
    assert.match(objectifs[1], /ok: \[430, 485\]/, 'AVPN : 430-485 °C, manuel Niveau II');
});

/* ═════════════════════════════════════════════════════════════════════════════════════════════
   CINQ MANCHES, UN SEUL ENFOURNEMENT CHACUNE, ET UNE NOTE SUR 20.
   ═════════════════════════════════════════════════════════════════════════════════════════════ */

test('le barème répond aux seuils demandés, demi-points compris', () => {
    /* Quatre réglages × cinq manches = 20. La plage JUSTE vaut 1 point, la TOLÉRANCE une demi :
       « 62 % au lieu de 65 » n'est pas la même faute que « 62 au lieu de 80 », et les trois
       couleurs du retour disent déjà cette nuance. Une note sur 20 avec des demis, c'est aussi
       la façon dont on note en France. */
    assert.match(rendu, /const MANCHES = 5;/);
    assert.match(rendu, /const POINTS_MAX = MANCHES \* 4;/);
    assert.match(rendu, /note === 2 \? 1 : note === 1 \? 0\.5 : 0/, 'juste = 1, tolérance = ½');
    /* Les seuils, en `>=` pour que les demi-points tombent du bon côté : 17,5 reste à deux. */
    const bloc = /function etoilesPour[\s\S]*?\n}/.exec(rendu);
    assert.ok(bloc, 'etoilesPour introuvable');
    assert.match(bloc[0], /points >= 18\) return 3/);
    assert.match(bloc[0], /points >= 11\) return 2/);
    assert.match(bloc[0], /points >= 5\) return 1/);
});

test('aucune reprise : le score est cumulé', () => {
    /* « Réessayer » laissait corriger axe par axe jusqu'à tomber juste — les retours disent
       eux-mêmes dans quel sens. Sur un score CUMULÉ, une reprise le ferait grossir à volonté et
       les seuils ne voudraient plus rien dire. Les cœurs sortent donc de ce jeu : ils donnaient
       les trois essais et ne modélisent plus rien. */
    assert.doesNotMatch(rendu, /Réessayer/, 'une reprise rendrait le total extensible');
    assert.doesNotMatch(rendu, /Coeurs|encoreEnVie/, 'les cœurs n\'ont plus d\'objet ici');
});

test('les quatre styles passent dans un service', () => {
    /* Un tirage indépendant à chaque manche pouvait donner cinq fois le même style — une fois
       sur 256. Une partie qui ne montre qu'un quart du programme n'apprend qu'un quart. */
    const bloc = /function tirerPartie[\s\S]*?\n}/.exec(rendu);
    assert.ok(bloc, 'tirerPartie introuvable');
    assert.match(bloc[0], /\[styles\[i\], styles\[j\]\] = \[styles\[j\], styles\[i\]\]/, 'les quatre sont mélangés');
    assert.match(bloc[0], /styles\.push\(OBJECTIFS\[/, 'puis complétés par un cinquième');
});

test('la dernière manche ne sort pas du tableau', () => {
    /* LE PLANTAGE, trouvé en jouant les cinq manches et pas autrement : après la dernière,
       `manche` vaut 5 et `partie[5]` n'existe pas — la partie en compte cinq, indices 0 à 4.
       `cmd.obj` levait, React démontait la modale, et l'écran de fin disparaissait au lieu de
       s'afficher. Le build ne voyait rien : c'est une erreur d'exécution. */
    assert.match(rendu, /partie\[Math\.min\(manche, MANCHES - 1\)\]/,
        'l\'index doit être borné, sinon l\'écran de fin fait tomber la modale');
});

test('le four se règle au curseur, plus en trois pastilles', () => {
    /* « Électrique 340 / Gaz 400 / Bois 460 » donnait la réponse : trois valeurs, une par style,
       il suffisait de reconnaître laquelle. Un curseur oblige à ESTIMER, comme pour le W et
       l'eau — et c'est la même compétence. */
    assert.doesNotMatch(rendu, /const FOURS =/, 'les trois choix ont disparu');
    assert.match(rendu, /min="250" max="500" step="5"[\s\S]{0,60}?value=\{temp\}/,
        'la plage couvre les quatre styles (teglia 280 en tolérance, AVPN 485) sans absurdités');
});
