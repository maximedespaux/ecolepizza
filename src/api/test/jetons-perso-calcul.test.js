/**
 * JETONS PERSONNALISÉS : MULTIPLIER, DIVISER — ET UN APERÇU QUI DIT VRAI.
 *
 * LA DEMANDE (2026-09-21) : « calculer un pourcentage, du genre {Prix|*0.20} », « et diviser
 * aussi ». Le modificateur `|` ne savait qu'ajouter ou retrancher : `{Prix|*0.20}` n'était pas
 * reconnu, et le document imprimait la formule telle quelle, accolades comprises.
 *
 * TROIS DÉFAUTS TROUVÉS EN CHEMIN, gelés ici aussi :
 *   · LE CENTIME. En flottants, 2,15 € × 30 % donnait 0,64 € et 0,35 € × 10 % donnait 0,03 €
 *     (mesuré le jour même). Le calcul se fait désormais sur l'écriture décimale, en entiers.
 *   · LE SÉPARATEUR. « 900 € » × 2 rendait « 1800 € », là où `euro()` écrit « 1 800 € ». Le
 *     défaut existait déjà pour l'addition : « 900 € » + 150 rendait « 1050 € ».
 *   · L'APERÇU. La fenêtre « Jetons perso » avait sa propre copie du calcul, annoncée « mêmes
 *     règles que le serveur » et restée aux seules dates : « {Prix|-450} » s'y affichait inchangé
 *     pendant que le document soustrayait. On corrige alors une formule qui était juste.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const serveur = require('../lib/customtokens.js');

const client = () => import('../../app/ui/lib/jetonsPerso.js');
/* L'ATTENDU EST CONSTRUIT, pas recopié : `toLocaleString('fr-FR')` sépare les milliers par une
   espace FINE INSÉCABLE (U+202F), invisible à la relecture — même parade que jeton-calcul-et-today. */
const eur = (n) => n.toLocaleString('fr-FR') + ' €';
const V = {
    Prix: eur(1500), Mille: eur(1000), TTC: eur(1200), Neuf: '900 €',
    Petit: '2,15 €', Cent: '0,35 €', Sou: '0,05 €',
    Annee: '2026', Heures: '35', Jour1: '02/06/2026', Titre: 'Pizzaïolo', Vide: '',
};
const calc = (f) => serveur.applyTemplate(f, V);

test('UN POURCENTAGE SE CALCULE, avec la syntaxe qu\'on devine', () => {
    for (const f of ['{Prix|*20%}', '{Prix|*0,2}', '{Prix|*0.2}', '{Prix|* 20 %}']) {
        assert.strictEqual(calc(f), eur(300), f);
    }
    assert.strictEqual(calc('{Prix|*90%}'), eur(1350), 'une remise de 10 % s\'écrit « × 90 % »');
    assert.strictEqual(calc('TVA : {Prix|*20%}'), `TVA : ${eur(300)}`, 'le texte autour reste');
});

test('DIVISER : un tiers, et le hors-taxe d\'un TTC', () => {
    assert.strictEqual(calc('{Mille|/3}'), eur(333.33));
    assert.strictEqual(calc('{TTC|/120%}'), eur(1000), 'diviser par 120 %, c\'est retirer 20 % de TVA');
    assert.strictEqual(calc('{TTC|/1,2}'), eur(1000));
    assert.strictEqual(calc('{Heures|/7}'), '5', 'un nombre sans unité se divise aussi');
});

test('AU CENTIME PRÈS — là où les flottants se trompent', () => {
    /* LA PREUVE QUE LE PIÈGE EXISTE, écrite dans le test : l'arrondi naïf rend bien 0,64 et 0,03.
       Si un jour ces deux lignes échouaient, c'est que JavaScript aurait changé — pas ce code. */
    const naif = (x) => Math.round(x * 100) / 100;
    assert.strictEqual(naif(2.15 * 0.30), 0.64);
    assert.strictEqual(naif(0.35 * 0.10), 0.03);
    // Et le calcul, lui, tombe juste : le demi-centime s'éloigne de zéro, comme à la calculette.
    assert.strictEqual(calc('{Petit|*30%}'), '0,65 €');
    assert.strictEqual(calc('{Cent|*10%}'), '0,04 €');
    assert.strictEqual(calc('{Sou|/3}'), '0,02 €', '0,0166… s\'arrondit au centime le plus proche');
    assert.strictEqual(serveur.calculer('1 015 €', '*', '5', true), eur(50.75));
});

test('UN MONTANT QUI FRANCHIT LE MILLIER PREND SON SÉPARATEUR — une année, non', () => {
    assert.strictEqual(calc('{Neuf|*2}'), eur(1800), '« 1 800 € », comme euro() l\'écrit');
    assert.strictEqual(calc('{Neuf|+150}'), eur(1050), 'le même défaut, côté addition');
    // Ce qui ne porte pas « € » garde sa forme : « 2026 » est une année, pas « 2 026 ».
    assert.strictEqual(calc('{Annee|+1}'), '2027');
    assert.strictEqual(calc('{Annee|*1}'), '2026');
    assert.strictEqual(calc('{Heures|*2}'), '70');
});

test('CE QUI N\'A PAS DE SENS NE S\'IMPRIME NI EN « NaN » NI EN « Infinity »', () => {
    /* Diviser par zéro est une FORMULE fausse : elle reste écrite telle quelle, et l'aperçu la
       montre aussitôt. Un « 1 500 € » inchangé passerait pour un résultat. */
    assert.strictEqual(calc('{Prix|/0}'), '{Prix|/0}');
    assert.strictEqual(calc('{Prix|/0,00}'), '{Prix|/0,00}');
    // Multiplier une date ou un texte n'a pas de sens : la VALEUR ressort intacte, sans dégât.
    assert.strictEqual(calc('{Jour1|*2}'), '02/06/2026');
    assert.strictEqual(calc('{Titre|/2}'), 'Pizzaïolo');
    assert.strictEqual(calc('{Vide|*20%}'), '');
    assert.strictEqual(calc('{Inconnu|*2}'), '', 'un jeton absent reste vide');
    // Et le décalage des dates n'a pas bougé.
    assert.strictEqual(calc('{Jour1|-1}'), '01/06/2026');
});

test('« % » APRÈS + OU − EST REFUSÉ — donc visible, jamais mal compris', () => {
    /* « {Prix|-10%} » : 10 % de remise pour les uns, 0,10 € de moins pour les autres. Refusé, il
       s'affiche tel quel dans l'aperçu ; la remise s'écrit sans ambiguïté {Prix|*90%}. */
    assert.strictEqual(calc('{Prix|-10%}'), '{Prix|-10%}');
    assert.strictEqual(calc('{Prix|+10%}'), '{Prix|+10%}');
});

test('les étapes s\'enchaînent par un jeton intermédiaire', () => {
    // « 20 % de ce qui reste à payer » : le reste d'abord, le pourcentage ensuite.
    const out = serveur.resolveCustomTokens([
        { token_key: 'Reste', template: '{Prix|-450}' },
        { token_key: 'Part', template: '{custom:Reste|*20%}' },
    ], V);
    assert.strictEqual(out['custom:Reste'], eur(1050));
    assert.strictEqual(out['custom:Part'], eur(210));
});

test('L\'APERÇU ET LE DOCUMENT CALCULENT PAREIL, formule par formule', async () => {
    /* Les deux copies du calcul — le serveur (CommonJS) et l'aperçu de l'éditeur (module) —
       passent sur la même liste. C'est ce test qui manquait : l'aperçu avait dérivé sans bruit. */
    const { applyTemplate } = await client();
    const FORMULES = [
        '{Prix|*20%}', '{Prix|*0,2}', '{Prix|* 20 %}', '{Prix|*90%}', '{Mille|/3}', '{TTC|/120%}',
        '{Petit|*30%}', '{Cent|*10%}', '{Sou|/3}', '{Neuf|*2}', '{Neuf|+150}', '{Prix|-450}',
        '{Prix|+99,5}', '{Annee|+1}', '{Heures|/7}', '{Prix|/0}', '{Prix|-10%}', '{Jour1|*2}',
        '{Jour1|-1}', '{Jour1|+30}', '{Jour1|-1,5}', '{Titre|-5}', '{Vide|*2}', '{Inconnu}',
        'du {Jour1} au {Jour1|+4}', 'Reste : {Prix|-450}, soit {Prix|/3} par mois',
    ];
    for (const f of FORMULES) assert.strictEqual(applyTemplate(f, V), calc(f), f);
});

test('les espaces insécables des motifs sont ÉCRITS, pas collés', () => {
    /* Les deux copies reconnaissent « 1 500 € » grâce à \u00a0 et \u202f dans leurs motifs. Le
       jour de leur écriture, ces échappements sont arrivés dans les fichiers en caractères
       LITTÉRAUX : même comportement, mais invisibles — qui retouche le motif ne les voit pas, les
       efface sans le savoir, et les montants à milliers cessent de se calculer. Le linteur de
       l'interface l'a vu ; celui de l'API, non. */
    const API = path.join(__dirname, '..');
    for (const rel of ['lib/customtokens.js', '../app/ui/lib/jetonsPerso.js']) {
        const src = fs.readFileSync(path.join(API, rel), 'utf8');
        assert.doesNotMatch(src, /[\u00a0\u202f]/, `${rel} : caractère insécable littéral`);
        assert.match(src, /\\u00a0\\u202f/, `${rel} : les échappements doivent y être`);
    }
});

test('la fenêtre « Jetons perso » emploie le calcul partagé, et l\'annonce', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', '..', 'app', 'ui', 'components', 'CustomTokenManager.jsx'), 'utf8');
    assert.match(src, /import \{ applyTemplate \} from "\.\.\/lib\/jetonsPerso\.js";/);
    assert.doesNotMatch(src, /function applyTemplate\(/, 'plus de copie locale, qui dériverait');
    // L'aide est le seul endroit où la syntaxe se lit : sans elle, personne ne devine « *20% ».
    assert.match(src, /\{"\{Prix\|\*20%\}"\}/);
    assert.match(src, /\{"\{Prix\|\/3\}"\}/);
});
