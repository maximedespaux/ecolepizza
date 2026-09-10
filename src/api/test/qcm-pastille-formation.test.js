/**
 * LA PASTILLE DE FORMATION SUR L'ÉCRAN DES QCM — même code, même couleur que partout ailleurs.
 *
 * Les sections de « Modèles de QCM » n'affichaient que le code en texte (« NIV1H, Pizzaïolo… »).
 * Un code en gris parmi d'autres titres ne se repère pas ; la couleur, si — c'est elle qui relie
 * cet écran aux stagiaires, aux sessions et à la carte, qui portent déjà la même pastille.
 *
 * LE PIÈGE ÉVITÉ, ET C'EST LUI QUI COMPTE. `lib/levels.js` tient une palette par défaut, MAIS
 * l'organisme choisit une couleur par formation, qui prime (`setBadgeColors`). Sur la base réelle,
 * six formations sur neuf en ont une — NIV1H est en turquoise (#00b2b2) alors que la palette la
 * donnerait en bleu foncé, NIVEXP en orange (#fe8400) alors qu'elle sortirait ROUGE, à deux
 * doigts du rouge de NIV1PRO. Sans le relais des couleurs choisies, l'écran des QCM aurait donc
 * affiché d'autres couleurs que le reste de l'application : deux vérités pour un seul code, ce
 * qui est pire que pas de couleur du tout.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const PAGE = fs.readFileSync(
    path.join(__dirname, '..', '..', 'app/ui/pages/Quiz.jsx'), 'utf8');
const LEVELS = fs.readFileSync(
    path.join(__dirname, '..', '..', 'app/ui/lib/levels.js'), 'utf8');

test('chaque section de formation porte sa pastille', () => {
    assert.match(PAGE, /<span className="lvl-chip" style=\{\{ background: colorForLevel\(g\.program_code\) \}\}>\{g\.program_code\}<\/span>/,
        'la pastille affiche le code, coloré par la source unique');
    // `.lvl-chip` est la classe DÉJÀ utilisée par les stagiaires et la carte : on ne réinvente pas
    // une pastille pour cet écran, sinon elles divergeraient au premier ajustement de style.
    assert.match(PAGE, /import \{ colorForLevel, setBadgeColors \} from "\.\.\/lib\/levels\.js"/);
});

test('les couleurs CHOISIES par l\'organisme sont relayées', () => {
    /* Sans ces trois lignes, `colorForLevel` retomberait sur la palette par défaut et la même
       formation aurait deux couleurs selon l'écran. Le relais doit accompagner le chargement des
       formations, pas vivre ailleurs : c'est la seule réponse qui les porte. */
    assert.match(PAGE, /for \(const f of r\.data \|\| \[\]\) if \(f\.color\)/, 'on lit la couleur choisie');
    assert.match(PAGE, /setBadgeColors\(m\);/, 'et on l\'enregistre dans la source unique');
    const bloc = PAGE.slice(PAGE.indexOf('getFormations().then'), PAGE.indexOf('}, []);'));
    assert.ok(bloc.includes('setBadgeColors'), 'le relais est DANS le chargement des formations');
});

test('la source de couleur reste unique, et surchargeable', () => {
    // Le contrat de lib/levels.js : les surcharges de l'organisme priment sur la palette.
    assert.match(LEVELS, /return OVERRIDES\[K\] \|\| PALETTE\[k\] \|\| PALETTE\[K\] \|\| hashColor\(K\);/,
        'ordre de résolution : choix de l\'organisme, puis palette, puis couleur calculée stable');
    /* Le repli calculé n'est pas un pis-aller : il donne une couleur STABLE à un code non
       répertorié (AMATEUR, sur la base réelle), plutôt qu'un gris indistinct partagé par tous. */
    assert.match(LEVELS, /function hashColor\(s\)/);
});
