/**
 * LA POPUP DE SIGNATURE NE SE CENTRAIT PAS SUR L'ÉCRAN.
 *
 * LE DÉFAUT, mesuré dans le navigateur sur l'émargement d'une session (fenêtre 1217×827, page
 * défilée de 1363 px) : le voile `.overlay` de la fenêtre de signature, pourtant
 * `position:fixed;inset:0`, ne faisait pas 1217×827 à (0,0) mais **893×528 à (291,228)**. Il
 * épousait la CARTE d'émargement. La fenêtre se centrait donc sur la carte, et selon le
 * défilement son pied — le bouton « Signer le document » — sortait du champ de vision.
 *
 * LA CAUSE est une matrice invisible. `.card` portait `animation:rise .45s var(--ease) both`, et
 * `@keyframes rise` finit sur `transform:none`. Mais une animation qui INTERPOLE une
 * transformation ne rend jamais le mot-clé : elle fige la valeur CALCULÉE. À la fin, ce n'est
 * donc pas `none` mais `matrix(1, 0, 0, 1, 0, 0)` — l'identité, rigoureusement invisible à
 * l'œil. Or toute transformation non nulle fait de l'élément le BLOC CONTENEUR de ses
 * descendants `position:fixed` : `inset:0` cesse de désigner l'écran pour désigner la carte.
 * Relevé sur la page : les 6 cartes sur 6 portaient la matrice, animation `finished`.
 *
 * `both` = `backwards` + `forwards`. Seul `backwards` sert ici — il tient l'état de départ
 * pendant le `animation-delay`, ce dont dépendent les cascades `.grid > *:nth-child(n)`.
 * `forwards` ne faisait que retenir un état final DÉJÀ identique à l'état naturel, au prix de
 * cette matrice. Vérifié après correction, même sonde : overlay 1217×827 à (0,0), fenêtre
 * centrée.
 *
 * LE MÊME `both` TRAÎNAIT SUR VINGT-SIX AUTRES RÈGLES, toutes des animations d'entrée dont
 * l'image finale était déjà l'état naturel de l'élément : `forwards` n'y retenait rien, il ne
 * laissait qu'une matrice. Vingt-trois sont passées en `backwards`. Deux gardent `both` pour
 * une raison écrite sur place — `voile` n'anime que l'opacité (rien à figer), `pqEclat` doit
 * rester éteint après ses deux tours. La vingt-sixième, `.carte-rien`, cachait un second
 * défaut VISIBLE : elle se centre par `translate(-50%,-50%)`, et `hudPose`, qui finit sur
 * `transform:none`, le lui retirait. Mesuré en production : le panneau pendait 170 px à droite
 * et 31 px sous le centre, soit exactement la moitié de ses 340×62. Une animation REMPLACE la
 * propriété, elle ne s'y ajoute pas — d'où `hudPoseCentre`, qui réécrit le centrage dans
 * chaque image.
 *
 * DEUXIÈME VERROU, indépendant du premier : `SignatureModal` passe par un portail vers
 * `document.body`. `Emargement` la monte à l'intérieur d'une `<Card>`, et `.card.hover:hover`
 * translate la carte de 2 px — le survol remontant depuis la fenêtre elle-même, le défaut
 * serait revenu par intermittence, sous la souris. Sans ancêtre, plus rien à piéger.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const racine = path.join(__dirname, '..', '..', 'app/ui');
const CSS = fs.readFileSync(path.join(racine, 'styles/app.css'), 'utf8');
const SIGNATURE = fs.readFileSync(path.join(racine, 'components/SignatureModal.jsx'), 'utf8');

/* Toutes les images-clés du fichier, pour savoir lesquelles touchent à `transform`. */
function imagesCles(css) {
    const out = {};
    const re = /@keyframes\s+([A-Za-z0-9_-]+)\s*\{/g;
    let m;
    while ((m = re.exec(css))) {
        let i = re.lastIndex, prof = 1;
        while (prof && i < css.length) {
            if (css[i] === '{') prof++;
            else if (css[i] === '}') prof--;
            i++;
        }
        out[m[1]] = css.slice(re.lastIndex, i - 1);
    }
    return out;
}

/* SEULE EXCEPTION ADMISE. `pqEclat` doit rester en `both` : l'éclat de fête s'éteint
   (`opacity:0`) au bout de ses deux tours, et seul `forwards` retient cet état. L'élément
   porte de toute façon sa propre rotation en permanence, donc le mode de remplissage ne
   change rien à ce qu'il pourrait contenir — et il ne contient rien. */
const EXCEPTIONS = new Set(['pqEclat']);

test('aucune animation porteuse de transformation ne se remplit en `both`', () => {
    const kf = imagesCles(CSS);
    const fautes = [];
    const re = /animation:\s*([A-Za-z0-9_-]+)[^;}]*?\bboth\b/g;
    let m;
    while ((m = re.exec(CSS))) {
        const nom = m[1];
        if (EXCEPTIONS.has(nom)) continue;
        if (/transform/.test(kf[nom] || '')) {
            const ligne = CSS.slice(0, m.index).split('\n').length;
            fautes.push(`L${ligne} : animation \`${nom}\` en \`both\``);
        }
    }
    assert.deepStrictEqual(fautes, [],
        'Une animation qui interpole une transformation ne rend jamais le mot-clé `none` : '
        + 'elle fige la matrice identité, et l\'élément devient le bloc conteneur de ses '
        + 'descendants `position:fixed`. Utiliser `backwards`, qui garde le seul effet utile '
        + '(l\'état de départ pendant le `animation-delay`) et relâche l\'élément à la fin.');
});

test('les animations d\'entrée finissent bien sur l\'état naturel', () => {
    /* C'est ce qui rend `backwards` sans effet visible : l'image finale est déjà ce que
       l'élément vaut sans elle. Si une image de fin cessait d'être neutre, le passage en
       `backwards` produirait un saut — d'où ce garde-fou. */
    const kf = imagesCles(CSS);
    for (const nom of ['rise', 'stuPop', 'hudPose', 'pastille', 'accOpen', 'loginRise',
                       'pheadPop', 'pqPose', 'profPop', 'pqEtoile', 'pqFeteEntre']) {
        assert.ok(kf[nom], `@keyframes ${nom} introuvable`);
        assert.match(kf[nom], /to\{opacity:1;transform:none\}/,
            `@keyframes ${nom} doit finir sur l'état naturel (opacity:1;transform:none)`);
    }
});

test('un élément déjà transformé garde son centrage pendant son animation', () => {
    /* `.carte-rien` se centre par `translate(-50%,-50%)`. Animée par `hudPose`, qui finit sur
       `transform:none`, elle perdait ce centrage : mesuré en production, le panneau pendait
       170 px à droite et 31 px sous le centre — exactement la moitié de ses 340×62. Une
       animation REMPLACE la propriété, elle ne s'y ajoute pas : le centrage doit donc être
       réécrit dans chaque image. */
    const regle = CSS.match(/^\.carte-rien\{[\s\S]*?\}/m);
    assert.ok(regle, 'règle .carte-rien introuvable');
    assert.match(regle[0], /transform:translate\(-50%,-50%\)/,
        '.carte-rien doit garder son centrage déclaré');
    assert.match(regle[0], /animation:hudPoseCentre[^;}]*backwards/,
        '.carte-rien doit utiliser les images qui préservent le centrage, en backwards');
    const kf = imagesCles(CSS);
    assert.ok(kf.hudPoseCentre, '@keyframes hudPoseCentre introuvable');
    for (const image of kf.hudPoseCentre.split('}').filter((x) => x.includes('transform'))) {
        assert.match(image, /transform:translate\(-50%,-50%\)/,
            `chaque image de hudPoseCentre doit réécrire le centrage — manquant dans : ${image.trim()}`);
    }
});

test('la fenêtre de signature est rendue dans document.body, hors de tout ancêtre', () => {
    assert.match(SIGNATURE, /import \{ createPortal \} from "react-dom";/,
        'SignatureModal doit importer createPortal');
    assert.match(SIGNATURE, /return createPortal\(\s*<div className="overlay"/,
        'le rendu doit partir d\'un createPortal, pas d\'un return direct');
    assert.match(SIGNATURE, /<\/div>,\s*document\.body\s*\);/,
        'la cible du portail doit être document.body');
});
