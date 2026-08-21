/**
 * DEUX NOUVEAUX JEUX : « Le service » et « L'accord des saveurs ».
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (p) => fs.readFileSync(path.join(UI, p), 'utf8');
const service = lire('components/LeService.jsx');
const accords = lire('components/AccordSaveurs.jsx');
const materiel = lire('lib/materiel.js');
const quest = lire('pages/PizzaQuest.jsx');

/* ═════════════════════════════════════════════════════════════════════════════════════════════
   « LE SERVICE » — du nombre de pizzas au poids de farine.
   ═════════════════════════════════════════════════════════════════════════════════════════════ */

test('le poids de pâte n\'est PAS calculé par `kgPateDepuisPizzas`', () => {
    /* ⚠ LE PIÈGE, ET IL A FAILLI PASSER. Cette fonction arrondit au dixième de KILO
       (`toFixed(1)`) : parfaite pour l'affichage du conseil matériel, fausse au gramme.
       72 pâtons de 280 g pèsent 20 160 g ; elle rend 20 200. Le jeu aurait donc marqué FAUX un
       stagiaire calculant juste — sur un écran qui existe pour lui apprendre à calculer.

       ET MA PROPRE VÉRIFICATION NE POUVAIT PAS LE VOIR : elle recalculait avec la même
       fonction, donc elle était forcément d'accord. Trouvé en comparant les nombres à la main.
       C'est pour ça que ce test refait l'arithmétique lui-même. */
    assert.doesNotMatch(service.replace(/\/\*[\s\S]*?\*\//g, ''), /kgPateDepuisPizzas/,
        'un arrondi au dixième de kilo n\'a rien à faire dans une réponse au gramme');
    assert.match(service, /pate: pizzas \* PATON_G,/, 'la multiplication exacte');

    /* La preuve chiffrée : sur les services proposés, l'écart est réel. */
    const arrondi = (n, g) => +((n * g) / 1000).toFixed(1) * 1000;
    const services = JSON.parse(/const SERVICES = (\[[^\]]*\]);/.exec(service)[1]);
    const ecarts = services.filter((n) => Math.round(arrondi(n, 280)) !== n * 280);
    assert.ok(ecarts.length >= 3,
        'si plus aucun service ne diverge, la démonstration a perdu son sens — revoir SERVICES');
});

test('les services tombent juste en unités de calcul', () => {
    /* `PATONS_PAR_KG_FARINE` vaut 6 : un service qui n'en est pas un multiple demanderait
       « 8,33 unités », qui ne veut rien dire en labo. */
    const par = +/export const PATONS_PAR_KG_FARINE = (\d+);/.exec(materiel)[1];
    const services = JSON.parse(/const SERVICES = (\[[^\]]*\]);/.exec(service)[1]);
    for (const n of services) {
        assert.strictEqual(n % par, 0, `${n} pizzas ne se divisent pas par ${par}`);
    }
    assert.match(service, /const unites = pizzas \/ PATONS_PAR_KG_FARINE;/,
        'le repère doit venir de lib/materiel.js, pas d\'un 6 écrit en dur');
});

test('le pâton reste à 280 g, comme le repère du manuel', () => {
    /* Le manuel écrit « environ 6 pâtons de 280 g » : c'est un repère, pas une identité. Le
       faire varier donnerait des divisions justes sur une règle fausse — on enseignerait une
       généralisation que le manuel ne fait pas. */
    assert.match(service, /const PATON_G = 280;/);
    assert.match(materiel, /grammesParPaton = 280/, 'le défaut de lib/materiel.js dit le même repère');
});

/* ═════════════════════════════════════════════════════════════════════════════════════════════
   « L'ACCORD DES SAVEURS » — ce que l'école associe.
   ═════════════════════════════════════════════════════════════════════════════════════════════ */

test('la question demande ce que l\'école SUGGÈRE, jamais ce qui est faux', () => {
    /* C'est la seule formulation que la donnée autorise. Les affinités de `garnitures.js` sont
       des SUGGESTIONS, pas une table de vérité : l'absence de « jambon » chez la sauce tomate ne
       dit pas que l'accord est mauvais, elle dit qu'il n'est pas listé. Un jeu qui demanderait
       « lequel détonne ? » marquerait faux des accords parfaitement classiques. */
    assert.match(accords, /Lequel l'école <b>suggère-t-elle<\/b> pour compléter/);
    assert.match(accords, /Les autres ne sont pas mauvais — ils ne sont simplement pas dans ses accords/,
        'l\'écran doit dire ce que « faux » veut dire ici');
    assert.doesNotMatch(accords.replace(/\/\*[\s\S]*?\*\//g, ''), /intrus|détonne/,
        'aucune formulation qui prétendrait juger un accord');
});

test('la réponse est toujours justifiée par ceux qui la suggèrent', () => {
    /* `pairSuggestions` rend `matches` : les produits d'où vient la suggestion. Sans cette
       justification, le jeu se réduirait à un « c'est comme ça » — et sur le goût, ça ne suffit
       pas. */
    assert.match(accords, /suggéré par <b>\{q\.bon\.matches\.join\(" et "\)\}<\/b>/);
    assert.match(accords, /GARN_TIPS\[q\.bon\.key\]/, 'et le conseil produit quand il existe');
});

test('le moteur d\'affinités est celui de la bibliothèque', () => {
    /* Les relations sont ASYMÉTRIQUES — 70 symétriques contre 168 qui ne le sont pas. Chercher
       « qui va avec X » à l'envers donnerait des réponses fausses. `pairSuggestions` part des
       produits DÉJÀ POSÉS et remonte leurs propres listes ; il écarte au passage les quatre
       affinités qui pointent vers un produit inexistant. */
    assert.match(accords, /import \{[^}]*pairSuggestions[^}]*\} from "\.\.\/lib\/garnitures\.js"/);
    assert.match(accords, /pairSuggestions\(\[p1\.key, p2\.key\], base\.key\)/);
    /* Les leurres sont pris HORS des suggestions, sinon deux réponses seraient justes. */
    assert.match(accords, /const exclus = new Set\(\[bon\.key, p1\.key, p2\.key, \.\.\.sugg\.map\(\(s\) => s\.key\)\]\)/);
});

test('un tirage impossible se dit, il ne s\'affiche pas vide', () => {
    assert.match(accords, /if \(!total\) \{/, 'le catalogue peut changer : l\'écran doit le dire');
});

test('les deux jeux sont branchés à l\'arcade', () => {
    for (const [imp, cle, comp] of [
        ['LeService', 'service', 'LeService'],
        ['AccordSaveurs', 'accords', 'AccordSaveurs'],
    ]) {
        assert.match(quest, new RegExp(`import ${imp} from "\\.\\./components/${imp}\\.jsx"`));
        assert.match(quest, new RegExp(`mini\\?\\.key === "${cle}" && <${comp}[\\s\\S]{0,140}?finishMini\\("${cle}", stars\\)`));
    }
    assert.match(quest, /ARCADE = \[[\s\S]{0,200}?GAME_SERV, GAME_ACC/);
});
