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
