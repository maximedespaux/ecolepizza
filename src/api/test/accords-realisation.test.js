/**
 * LES ACCORDS DE SAVEURS VIVENT DANS LA RÉALISATION (demandé par l'école le 2026-09-29).
 *
 * « Empâtement = la pâte ; Préparation = un ingrédient préparé ; Réalisation = pâte + préparation
 * + les autres ingrédients. » Le guide des accords était dans la PRÉPARATION, où il n'a pas de
 * sens : on ne se demande pas quoi mettre avec une sauce en fabriquant la sauce, mais en
 * composant la pizza. Il est donc passé dans la réalisation — et il n'y demande plus rien : il LIT
 * la composition (sa base, souvent une préparation importée, et ce qui est déjà posé).
 *
 * CE QUE CES TESTS GÈLENT :
 *   · le guide n'est proposé QUE dans la réalisation ;
 *   · la lecture va au plus PRÉCIS (jambon cru ≠ jambon, bufala ≠ mozzarella) et préfère une
 *     PRÉPARATION importée pour base ;
 *   · une suggestion vient de MA mercuriale quand le produit y est — l'article dont la lecture
 *     la plus précise est ce produit, et, pour une base, seulement l'article qui porte son nom.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const garnitures = () => import('../../app/ui/lib/garnitures.js');
const ligne = (label, extra = {}) => ({ label, ...extra });

test('la réalisation porte le guide des accords, la préparation ne le porte plus', () => {
    const ed = fs.readFileSync(path.join(UI, 'pages/FicheRecette.jsx'), 'utf8');
    assert.match(ed, /\{isRecette && \(\s*<Repliable[^>]*titre="Accords de saveurs"[^>]*>\s*<PairingSuggest lignes=\{r\.ingredients\}/,
        'le guide suit la composition de la réalisation');
    assert.doesNotMatch(ed, /isPrep && \(\s*<Repliable[^>]*Accords de saveurs/, 'plus de guide dans la préparation');
    assert.equal((ed.match(/<PairingSuggest /g) || []).length, 1, 'un seul guide, celui de la réalisation');
});

test('la base se lit dans la composition, de préférence une préparation importée', async () => {
    const { lireComposition, pairSuggestions } = await garnitures();
    const reine = [
        ligne('Pâte napolitaine 24 h', { component_kind: 'PATE' }),
        ligne('Sauce tomate San Marzano', { component_kind: 'PREPARATION' }),
        ligne('Mozzarella fior di latte'), ligne('Jambon cuit supérieur'), ligne('Champignons de Paris'), ligne('Origan'),
    ];
    const lu = lireComposition(reine);
    assert.equal(lu.base && lu.base.key, 'tomate', 'la sauce tomate importée est la base');
    assert.equal(lu.ligneBase.label, 'Sauce tomate San Marzano');
    assert.deepStrictEqual([...lu.presents].sort(), ['champignon', 'jambon', 'mozzarella', 'origan']);
    const sugg = pairSuggestions(lu.presents, lu.base.key).map((p) => p.key);
    assert.ok(sugg.includes('basilic'), 'le basilic va avec la tomate et la mozzarella');
    for (const deja of lu.presents) assert.ok(!sugg.includes(deja), `${deja} est déjà posé : il n'est pas resuggéré`);

    /* Une tomate crue posée ET une préparation de crème : la préparation fait la base. */
    const deux = lireComposition([ligne('Tomates pelées'), ligne('Crème à l\'ail', { component_kind: 'PREPARATION' })]);
    assert.equal(deux.base.key, 'creme');
    assert.equal(lireComposition([ligne('Mozzarella')]).base, null, 'pas de base : le guide le dit et en propose');
});

test('la lecture va au plus précis', async () => {
    const { lireComposition } = await garnitures();
    const cle = (label) => lireComposition([ligne(label)]).presents[0];
    assert.equal(cle('Jambon cru de Parme'), 'jambon_cru', 'du jambon cru, pas du jambon');
    assert.equal(cle('Jambon cuit supérieur'), 'jambon');
    assert.equal(cle('Mozzarella di bufala DOP'), 'mozza_bufala', 'de la bufala, pas de la mozzarella');
    assert.equal(cle('Poivrons grillés'), 'poivron_grille');
    assert.equal(cle('Tomates cerises'), 'tomate_cerise', 'des tomates cerises, pas une base tomate');
    assert.equal(cle('Basilic'), 'basilic', 'la clé reconnaît ce que le libellé « Basilic frais » ne reconnaîtrait pas');
    assert.equal(lireComposition([ligne('Crème chorizo maison')]).base.key, 'creme_chorizo', 'la crème chorizo, pas la crème');
});

test('une suggestion vient de MA mercuriale quand le produit y est', async () => {
    const { dansMercuriale, prodOf, GARN_BASES } = await garnitures();
    const merc = [{ label: 'Mozzarella di bufala DOP' }, { label: 'Mozzarella fior di latte' }, { label: 'Tomates cerises' }];
    assert.equal(dansMercuriale(merc, prodOf('mozzarella')).label, 'Mozzarella fior di latte',
        'la mozzarella n\'est pas la bufala, même si son nom la contient');
    assert.equal(dansMercuriale(merc, prodOf('mozza_bufala')).label, 'Mozzarella di bufala DOP');
    const sauce = GARN_BASES.find((b) => b.key === 'tomate');
    assert.equal(dansMercuriale(merc, sauce), null, 'une base ne se reconnaît qu\'à son nom : les tomates cerises ne sont pas une sauce');
    assert.equal(dansMercuriale([{ label: 'Sauce Tomate' }], sauce).label, 'Sauce Tomate');
});
