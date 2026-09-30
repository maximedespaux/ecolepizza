/**
 * L'ÉDITEUR D'EMPÂTEMENT SUIT QUATRE ÉTAPES LOGIQUES — demandé par l'école le 2026-09-30, après
 * l'allègement : « la Production (ancienne étape 5) passe en étape 2, comme : 1 quoi, 2 combien,
 * 3 laquelle, 4 complément ».
 *
 * L'ORDRE RETENU, gelé ici :
 *   1 · Quelle pizza   (la typologie — QUOI)
 *   2 · Combien        (les quantités : nombre de pâtons, poids — remontées de l'ancienne étape 5)
 *   3 · La pâte        (la recette : force + empâtement + hydratation, en SOUS-sections)
 *   4 · Compléments    (les blocs repliables : prix, température, stockage)
 *
 * LE DÉFAUT que ça corrige : les quantités (« combien de pâtons ») étaient tout en bas, après toute
 * la recette. On les décide maintenant juste après le type de pizza. Remettre la Production en
 * dernier, ou casser l'ordre des quatre étapes, rougit ici.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const page = fs.readFileSync(path.join(UI, 'pages', 'FicheRecette.jsx'), 'utf8');

// Position de la première occurrence d'un motif (index dans le source), -1 si absent.
const at = (re) => { const m = page.match(re); return m ? m.index : -1; };

test('QUATRE ÉTAPES numérotées, dans l\'ordre 1 Quelle pizza → 2 Combien → 3 La pâte → 4 Compléments', () => {
    const p1 = at(/ate-num">1<\/span> Quelle pizza/);
    const p2 = at(/ate-num">2<\/span> Combien/);
    const p3 = at(/ate-num">3<\/span> La pâte/);
    const p4 = at(/ate-num">4<\/span> Compléments/);
    for (const [nom, i] of [['1 Quelle pizza', p1], ['2 Combien', p2], ['3 La pâte', p3], ['4 Compléments', p4]]) {
        assert.notStrictEqual(i, -1, `étape « ${nom} » introuvable`);
    }
    assert.ok(p1 < p2 && p2 < p3 && p3 < p4, `étapes dans le désordre : ${[p1, p2, p3, p4]}`);
    // Et pas d'étape 5 restante (l'ancienne « Production »).
    assert.doesNotMatch(page, /ate-num">5<\/span>/, 'plus d\'étape 5 : la Production est remontée en étape 2');
});

test('COMBIEN (les quantités) est AVANT la recette de la pâte', () => {
    // Le nombre de pâtons se choisit avant d'entrer dans la force de la farine.
    const nbPatons = at(/<label>Nombre de pâtons<\/label>/);
    const force = at(/ate-sub"[^>]*>Force de la farine/);
    assert.ok(nbPatons !== -1 && force !== -1 && nbPatons < force,
        'les quantités doivent précéder « Force de la farine » (Production remontée en étape 2)');
});

test('LA PÂTE réunit force, empâtement et hydratation en sous-sections', () => {
    // La première sous-section porte un style en ligne : on tolère des attributs avant le « > ».
    assert.match(page, /className="ate-sub"[^>]*>Force de la farine</);
    assert.match(page, /className="ate-sub"[^>]*>Empâtement</);
    assert.match(page, /className="ate-sub"[^>]*>Hydratation &amp; assaisonnement</);
});

test('COMPLÉMENTS contient les prix et les réglages repliables', () => {
    const comp = at(/ate-num">4<\/span> Compléments/);
    const prix = at(/> Prix des ingrédients</);
    const temp = at(/> Température de la pâte/);
    assert.ok(comp !== -1 && prix > comp && temp > comp,
        'prix et température sont sous « Compléments »');
    // Le prix de la farine (le champ) vit bien dans ce bloc, plus dans la Production.
    assert.ok(at(/<label>Prix de la farine/) > comp, 'le prix de la farine est dans Compléments');
});
