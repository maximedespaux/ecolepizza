/**
 * UNE CARTE DÉBORDAIT LA FENÊTRE, ET SA VOISINE ÉTAIT ÉCRASÉE.
 *
 * LE DÉFAUT, mesuré sur le tableau de bord (fenêtre de 1217 px) : la carte « Derniers dossiers »
 * faisait 1231 px — plus large que l'écran — pendant que « Activité récente », dans la même
 * grille à deux colonnes égales, était réduite à 234 px. La grille annonçait pourtant `1fr 1fr`,
 * et son conteneur ne faisait que 895 px : les colonnes calculées valaient `1231px 234px`.
 *
 * LA CAUSE N'EST PAS DANS LA GRILLE MAIS DANS SON DÉFAUT DE STYLE. Un élément de grille a
 * `min-width: auto`, ce qui signifie « ne descends jamais sous ta taille min-content ». Une
 * seule ligne insécable suffit alors à fixer un plancher : ici le titre de formation le plus
 * long de l'école, rendu sur une seule ligne (`white-space: nowrap`). `1fr` ne pouvant pas
 * passer sous ce plancher, la grille cesse de partager et déborde.
 *
 * L'`ELLIPSIS` POSÉ À L'INTÉRIEUR NE SERVAIT À RIEN : il ne coupe le texte que si quelque chose
 * contraint la largeur, et rien ne la contraignait jamais — la colonne s'élargissait à la
 * demande. C'est le piège de ce défaut : la correction semble déjà écrite.
 *
 * `min-width: 0` lève le plancher. Vérifié dans le navigateur après correction : colonnes
 * `439.5px 439.5px`, carte à 440 px, texte coupé à 296 px sur 1087 px naturels, plus aucun
 * débordement horizontal de la page.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..', '..');
const CSS = fs.readFileSync(path.join(RACINE, 'app/ui/styles/app.css'), 'utf8');
const TABLEAU = fs.readFileSync(path.join(RACINE, 'app/ui/pages/Dashboard.jsx'), 'utf8');

test('les enfants d\'une grille peuvent descendre sous leur min-content', () => {
    assert.match(CSS, /^\.grid > \*\{min-width:0\}/m,
        'sans cette règle, `1fr` ne partage plus : une ligne insécable fait exploser sa colonne');
});

test('la règle est posée APRÈS la déclaration de la grille', () => {
    /* Avant, elle serait écrasée par rien — mais l'ordre dit l'intention : on lève un plancher
       que la règle précédente vient d'installer. */
    assert.ok(CSS.indexOf('.grid{display:grid') < CSS.indexOf('.grid > *{min-width:0}'));
});

test('la ligne « derniers dossiers » tient sur deux lignes tronquées', () => {
    /* À 440 px, moins la barre d'avancement, la colonne laisse ~296 px : sur une seule ligne,
       le nom — la seule chose qu'on cherche ici — partageait la place avec un titre de
       formation coupé en plein mot. */
    /* LA LIGNE A QUITTÉ LA CARTE pour une fonction (2026-09-23) : elle sert telle quelle sous
       une entreprise et hors de tout groupe. On lit donc `ligneDossier`, et non plus le corps de
       la carte — qui contient désormais AUSSI l'en-tête d'entreprise, avec sa propre troncature. */
    const bloc = TABLEAU.slice(TABLEAU.indexOf('function ligneDossier(e)'));
    const ligne = bloc.slice(0, bloc.indexOf('\n  return ('));
    assert.match(ligne, /<span style=\{\{ flex: 1, minWidth: 0 \}\}>/,
        'le conteneur doit pouvoir rétrécir, sinon la troncature ne se déclenche jamais');
    assert.match(ligne, /\{e\.first_name\} \{e\.last_name\}/);
    assert.match(ligne, /\{e\.program_title \|\| "Formation"\}/);
    const coupes = ligne.match(/textOverflow: "ellipsis"/g) || [];
    assert.strictEqual(coupes.length, 2, 'les deux lignes se coupent : le nom ET la formation');
});
