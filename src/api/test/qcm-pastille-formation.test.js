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
const RESULTATS = fs.readFileSync(
    path.join(__dirname, '..', '..', 'app/ui/pages/ResultatsQCM.jsx'), 'utf8');
const CTRL = fs.readFileSync(
    path.join(__dirname, '..', 'controllers/quiz.controller.js'), 'utf8');
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

test('l\'écran des RÉSULTATS porte la même pastille', () => {
    assert.match(RESULTATS, /<span className="lvl-chip" style=\{\{ background: g\.couleur \|\| colorForLevel\(g\.code\) \}\}>\{g\.code\}<\/span>/);
    /* Le code devait être SÉPARÉ de l'intitulé : ils étaient fondus dans une seule chaîne
       (« NIV1H · Pizzaïolo… »), d'où l'impossibilité d'en faire une pastille sans redécouper du
       texte — et redécouper du texte, c'est se tromper le jour où un intitulé contient un point. */
    assert.match(RESULTATS, /code: q\.program_id \? \(q\.program_code \|\| ""\) : "",/);
    assert.match(RESULTATS, /titre: q\.program_id \? \(q\.program_title \|\| ""\) : "Autre — sans formation",/);
});

test('la couleur choisie voyage AVEC la ligne, sans second appel réseau', () => {
    /* L'autre écran relaie les couleurs via `setBadgeColors`, mais il charge déjà le référentiel
       des formations. Celui-ci ne le charge pas : recharger neuf formations pour une teinte serait
       une requête de plus à chaque ouverture. La couleur descend donc dans la requête existante.
       Sans elle, en arrivant DIRECTEMENT sur cette page, la pastille prendrait la couleur de la
       palette par défaut — différente de celle de l'organisme sur six formations sur neuf. */
    assert.match(CTRL, /p\.color AS program_color,/, 'la requête de vue d\'ensemble ramène la couleur');
    assert.match(RESULTATS, /couleur: q\.program_color \|\| null,/, 'et le groupe la porte');
    // Ordre de priorité identique partout : choix de l'organisme, puis palette commune.
    assert.match(RESULTATS, /g\.couleur \|\| colorForLevel\(g\.code\)/);
});

test('la couleur quitte le TEXTE de l\'en-tête pour la pastille', () => {
    /* Garder les deux ferait deux signaux pour une seule information, et le rouge de l'en-tête
       entrait en concurrence avec la teinte propre de la formation. */
    const entete = RESULTATS.slice(RESULTATS.indexOf('letterSpacing: ".06em"'), RESULTATS.indexOf('{g.items.length}'));
    assert.doesNotMatch(entete, /var\(--ember1/, 'plus de rouge sur le libellé');
    assert.match(entete, /color: "var\(--muted\)"/, 'intitulé neutre : la couleur est dans la pastille');
});
