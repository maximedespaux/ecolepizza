/**
 * LE COÛT MATIÈRE (app/ui/lib/coutMatiere.js) — l'arithmétique de gestion de l'organisme.
 *
 * Elle sort du mini-jeu « Le juste prix », qui l'a fait naître mais n'en est que le premier
 * client : la même question se pose à une fiche recette, à une carte et à l'assistant Garniture.
 * Le volet Gestion du manuel la pose d'ailleurs le premier (notion « Le coût matière »).
 *
 * LE DÉFAUT QUE CE FICHIER EXISTE POUR EMPÊCHER : diviser par le TTC.
 *
 * C'est l'erreur naturelle — le TTC est le chiffre affiché, celui qu'on a sous les yeux — et elle
 * ne se voit pas, parce qu'elle donne un résultat plausible. Une pizza à 11 € TTC qui coûte 2,75 €
 * de matière affiche 25 % si l'on divise par 11, et 27,5 % si l'on divise par 10 € HT. Trois
 * points d'écart, pile dans la zone où se décide « ça tient » ou « ça dérive » : le calcul faux
 * dit que tout va bien au moment précis où il faudrait corriger. Aucun test d'écran ne l'aurait
 * attrapé, les deux chiffres étant également crédibles.
 *
 * LES AUTRES RÈGLES GELÉES ICI, toutes tirées du manuel :
 *   · le PÂTON fait partie du coût matière (« pâton + base + garniture ») — l'oublier retire deux
 *     à trois points de ratio à chaque pizza d'une carte, une erreur invisible et répétée partout ;
 *   · la MARGE SE COMPTE EN EUROS, pas en pourcentage (notion « La matrice BCG », qui l'écrit sous
 *     un pictogramme d'avertissement). Une pizza au meilleur ratio rapporte souvent MOINS d'euros,
 *     parce qu'elle est bon marché — et ce sont des euros qui paient le loyer ;
 *   · le coût du pâton est CALCULÉ par `computeBuild`, la fonction de l'assistant Pâte, et non
 *     écrit en dur : les deux écrans ne peuvent donc pas se contredire quand l'école corrige le
 *     prix de la farine.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const load = () => import('../../app/ui/lib/coutMatiere.js');
const pres = (a, b, tol = 0.005) => Math.abs(a - b) <= tol;

test('le ratio se calcule sur le HT, jamais sur le TTC', async () => {
    const { ratio, ht, TVA } = await load();
    // Le cas du manuel, repris tel quel dans un piège du jeu.
    assert.ok(pres(ht(11), 10), 'ht(11 € TTC) doit valoir 10 € à TVA 10 %');
    const r = ratio(2.75, 11);
    assert.ok(pres(r, 0.275), `2,75 € sur 11 € TTC = 27,5 % de ratio, obtenu ${(r * 100).toFixed(1)} %`);
    // LE DÉFAUT, nommé : la division par le TTC donne 25 % et fait croire à une carte saine.
    assert.ok(!pres(r, 0.25, 0.02), 'diviser par le TTC donnerait 25 % — trois points de mensonge');
    assert.strictEqual(TVA, 1.10, 'TVA restauration, consommation immédiate (manuel).');
});

test('le pâton fait partie du coût matière', async () => {
    const { coutPizza, COUT_PATON, coutIngredient } = await load();
    const ing = [{ qty: 80, price: 3 }, { qty: 100, price: 7 }];
    const garnitures = ing.reduce((s, i) => s + coutIngredient(i), 0);
    assert.ok(pres(coutPizza(ing), COUT_PATON + garnitures),
        'coutPizza doit ajouter le pâton : le manuel écrit « pâton + base + garniture ».');
    // Une pizza sans aucune garniture coûte quand même son pâton.
    assert.ok(pres(coutPizza([]), COUT_PATON), 'une pizza vide coûte son pâton, pas zéro.');
    assert.ok(COUT_PATON > 0.1 && COUT_PATON < 0.6,
        `le pâton de 250 g doit rester dans un ordre de grandeur crédible (obtenu ${COUT_PATON.toFixed(3)} €)`);
});

test("le coût du pâton est calculé, pas écrit en dur", () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'app/ui/lib/coutMatiere.js'), 'utf8');
    assert.match(src, /computeBuild\(/,
        "Le pâton doit venir de `computeBuild` — la fonction de l'assistant Pâte. Un 0,22 € en dur "
        + "serait devenu faux en silence le jour où l'école corrige le prix de la farine.");
});

test('la cible du manuel encadre le verdict — 25 à 30 % du HT', async () => {
    const { verdictPrix, CIBLE_BASSE, CIBLE_HAUTE, ht } = await load();
    assert.strictEqual(CIBLE_BASSE, 0.25);
    assert.strictEqual(CIBLE_HAUTE, 0.30);
    const ttc = 11;                        // 10 € HT
    assert.strictEqual(verdictPrix(2.75, ttc), 'bon', '27,5 % : dans la cible');
    assert.strictEqual(verdictPrix(3.60, ttc), 'bas', '36 % : la pizza mange la marge');
    assert.strictEqual(verdictPrix(1.80, ttc), 'cher', '18 % : hors marché');
    // Les bornes elles-mêmes tiennent : à 25,0 % et 30,0 % pile, le prix TIENT (bande fermée).
    assert.strictEqual(verdictPrix(0.25 * ht(ttc), ttc), 'bon', '25,0 % pile est dans la cible');
    assert.strictEqual(verdictPrix(0.30 * ht(ttc), ttc), 'bon', '30,0 % pile est dans la cible');
});

test("la marge se compte en euros — le meilleur ratio n'est pas la meilleure marge", async () => {
    const { marge, ratio } = await load();
    // Le cas que le manuel décrit sous son pictogramme d'avertissement (notion BCG), en chiffres :
    // une pizza bon marché au ratio impeccable rapporte MOINS qu'une pizza chère au ratio médiocre.
    const petite = { cout: 1.50, ttc: 7.00 };   // ratio ~23,6 %
    const grande = { cout: 4.00, ttc: 16.00 };  // ratio ~27,5 %
    assert.ok(ratio(petite.cout, petite.ttc) < ratio(grande.cout, grande.ttc),
        'la petite a le meilleur ratio');
    assert.ok(marge(grande.cout, grande.ttc) > marge(petite.cout, petite.ttc),
        "…et pourtant la grande rapporte plus d'euros. C'est toute la leçon : on surveille le "
        + 'ratio, on encaisse des euros.');
    assert.ok(pres(marge(2.75, 11), 7.25), 'marge brute = HT − coût matière');
});

test('le prix conseillé est celui du manuel : coût matière ÷ objectif', async () => {
    const { prixConseille, ratio, verdictPrix, TVA } = await load();
    const cout = 2.50;
    const htConseille = prixConseille(cout, 0.30);
    assert.ok(pres(htConseille, cout / 0.30), 'formule du manuel');
    // Et le prix TTC qui en découle tient bien la cible — la boucle est fermée.
    assert.strictEqual(verdictPrix(cout, htConseille * TVA), 'bon');
    assert.ok(pres(ratio(cout, htConseille * TVA), 0.30));
});

test("l'arrondi commercial déplace le ratio — d'où le recalcul du verdict", async () => {
    const { auDemi, verdictPrix, ratio, TVA } = await load();
    assert.strictEqual(auDemi(8.47), 8.5);
    assert.strictEqual(auDemi(8.24), 8.0);
    /* CE QUI SE PASSERAIT SI ON GARDAIT L'INTENTION. On vise 25,4 % — dans la cible — puis on
       arrondit le prix vers le haut : le ratio tombe sous 25 % et le verdict change. Un jeu qui
       annoncerait « ça tient » sur ce prix-là affirmerait une chose fausse. D'où la règle : le
       verdict est TOUJOURS déduit du prix affiché. */
    const cout = 1.40;
    const vise = (cout / 0.254) * TVA;            // ≈ 6,06 €
    const affiche = auDemi(vise);                 // → 6,00 €… mais l'arrondi peut aussi monter
    const rApres = ratio(cout, affiche);
    assert.strictEqual(verdictPrix(cout, affiche), rApres > 0.30 ? 'bas' : rApres < 0.25 ? 'cher' : 'bon',
        "verdictPrix doit lire le prix réel, pas l'intention qui a servi à le tirer.");
});

/* ---- Le mini-jeu « Le juste prix » ---------------------------------------------------------
   Contrats de source : le jeu est le premier client de l'arithmétique ci-dessus, et ces tests
   vérifient qu'il ne s'en écarte pas. Ils lisent le fichier — un composant JSX ne se charge pas
   depuis les tests d'API — donc ils prouvent que le câblage est écrit, pas qu'il s'exécute. La
   partie a été jouée à l'écran en plus, sur ordinateur et sur téléphone. */

const JEU = path.join(__dirname, '..', '..', 'app/ui/components/JustePrix.jsx');
const QUEST = path.join(__dirname, '..', '..', 'app/ui/pages/PizzaQuest.jsx');

test("le jeu ne réécrit pas l'arithmétique, il l'importe", () => {
    const src = fs.readFileSync(JEU, 'utf8');
    assert.match(src, /from "\.\.\/lib\/coutMatiere\.js"/,
        "Le ratio, la marge et la cible viennent de la lib partagée — une copie locale finirait par "
        + "diverger de ce que l'école corrige.");
    // Le défaut évité : redéfinir le ratio dans le jeu, sur le TTC.
    assert.doesNotMatch(src, /const ratio\s*=|function ratio\s*\(/,
        'Le jeu ne doit pas redéfinir `ratio` : il y a un seul endroit où cette division est écrite.');
});

test("les coûts affichés sont arrêtés au centime — sinon les équations dérivent", () => {
    const src = fs.readFileSync(JEU, 'utf8');
    /* LE DÉFAUT, constaté en jouant : le coût brut valait 1,9865 €, affiché « 1,99 € », et le jeu
       écrivait « 1,99 ÷ 0,275 = 7,22 € HT » alors que 1,99 ÷ 0,275 fait 7,24. Deux centimes, et un
       stagiaire qui refait le calcul cesse de faire confiance au reste. Même leçon que les remises
       de facture (`remise.test.js`) : on fige le chiffre AFFICHÉ, tout en découle. */
    const arrondis = src.match(/Math\.round\(.*?\* 100\) \/ 100/g) || [];  // .*? : le coût passe par coutPizza(ing), donc parenthèses imbriquées
    assert.ok(arrondis.length >= 2,
        'Le coût de la carte ET le coût relevé par la hausse fournisseur doivent être arrêtés au '
        + `centime avant tout affichage (trouvé ${arrondis.length}).`);
});

test("le verdict est déduit du prix affiché, jamais de l'intention du tirage", () => {
    const src = fs.readFileSync(JEU, 'utf8');
    assert.match(src, /verdictPrix\(/,
        "Les questions doivent repasser par `verdictPrix` : l'arrondi commercial déplace le ratio, "
        + "et garder la bande visée ferait affirmer « trop cher » sur un prix qui tient.");
});

test("« Le juste prix » a bien sa porte dans l'arcade", () => {
    const src = fs.readFileSync(QUEST, 'utf8');
    assert.match(src, /import JustePrix from "\.\.\/components\/JustePrix\.jsx"/);
    assert.match(src, /mini\?\.key === "prix" && <JustePrix/,
        'Sans la ligne de rendu, la tuile s\'ouvre sur rien — et le build ne dit rien (cf. CLAUDE.md §2.4).');
    assert.match(src, /const ARCADE = \[[^\]]*GAME_PRIX/,
        "…et sans l'entrée dans ARCADE, la tuile n'existe pas du tout.");
});
