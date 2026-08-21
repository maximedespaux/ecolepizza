/**
 * PLUSIEURS CATÉGORIES SUR UN PRODUIT PARTENAIRE, séparées par des virgules.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN SÉPARATEUR PLUTÔT QUE DES CHAMPS EN PLUS. Un four est « Four » ET « 400 °C » ET
 * « électrique » : combien de champs faudrait-il prévoir ? Trois, et le quatrième manquera. Une
 * seule ligne, des virgules, autant d'étiquettes que nécessaire — et RIEN À MIGRER, puisque la
 * colonne reste une chaîne de texte. Une valeur sans virgule ressort telle quelle : tout
 * l'existant s'affiche exactement comme avant, sans reprise de données.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUI NE CHANGE PAS, ET IL FAUT QUE ÇA RESTE AINSI : la catégorie des ARTICLES DE L'ÉCOLE.
 * Elle sert de FILTRE DE RAYON (`items.filter((i) => i.category === cat)`) et de clé de
 * regroupement dans l'inventaire. La découper y ferait disparaître des articles de leur rayon
 * sans erreur ni message — un défaut silencieux sur un écran de stock.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (f) => fs.readFileSync(path.join(UI, f), 'utf8');

/* On charge la vraie fonction plutôt que d'en recopier une : un test qui réimplémente ce qu'il
   vérifie ne prouve que sa propre cohérence. */
function listeCategories(v) {
    const src = lire('lib/format.js');
    const bloc = src.slice(src.indexOf('export function listeCategories'));
    const corps = bloc.slice(0, bloc.indexOf('\n}\n') + 3).replace('export function', 'function');
    // eslint-disable-next-line no-new-func
    return new Function(`${corps}\nreturn listeCategories(${JSON.stringify(v)});`)();
}

test('le découpage ne coupe que sur la virgule', () => {
    assert.deepStrictEqual(listeCategories('Four'), ['Four'], 'une valeur simple ressort intacte');
    assert.deepStrictEqual(listeCategories('Four,400 °C'), ['Four', '400 °C']);
    assert.deepStrictEqual(listeCategories(' Four , 400 °C , Électrique '), ['Four', '400 °C', 'Électrique'],
        'les espaces autour des virgules sont mangés');
    assert.deepStrictEqual(listeCategories('Four,,400 °C'), ['Four', '400 °C'],
        'une virgule en trop ne crée pas d\'étiquette vide');
    assert.deepStrictEqual(listeCategories(''), []);
    assert.deepStrictEqual(listeCategories(null), [], 'une valeur absente ne doit pas crier');

    /* NI POINT-VIRGULE NI BARRE OBLIQUE. Les deux se glissent naturellement dans un libellé
       — « Bac 60/40 », « Coupe-pâte / Roulette » est une catégorie RÉELLE de cet annuaire — et
       les accepter comme séparateurs couperait en deux la première catégorie qui en contient. */
    assert.deepStrictEqual(listeCategories('Bac 60/40'), ['Bac 60/40']);
    assert.deepStrictEqual(listeCategories('Coupe-pâte / Roulette'), ['Coupe-pâte / Roulette']);
    assert.deepStrictEqual(listeCategories('Pelle 33 cm ; manche court'), ['Pelle 33 cm ; manche court']);
});

test("l'en-tête du partenaire n'est pas répété étiquette par étiquette", () => {
    /* LE DÉFAUT INTRODUIT PUIS CORRIGÉ : l'ancien test comparait la chaîne ENTIÈRE à la catégorie
       du partenaire. Dès qu'un produit portait « Four, 400 °C », l'égalité échouait et « Four » se
       réaffichait en doublon sous l'en-tête « Marana — FOUR ». La règle voulue n'a pas changé — ne
       pas répéter ce que dit déjà l'en-tête — mais elle porte maintenant sur CHAQUE étiquette. */
    const page = lire('pages/Boutique.jsx');
    assert.match(page,
        /listeCategories\(p\.category\)\s*\n\s*\.filter\(\(c\) => c\.toLowerCase\(\) !== String\(g\.partner_category \|\| ""\)\.toLowerCase\(\)\)/,
        'Le filtrage doit porter sur chaque étiquette, pas sur la chaîne entière.');
    assert.doesNotMatch(page, /const repete =/,
        'La comparaison de chaîne entière ne doit pas revenir : elle rate tout multi-étiquette.');
});

test('le glyphe est cherché PAR étiquette', () => {
    /* Sur la chaîne entière, `CAT_ICON["Four, 400 °C"]` ne trouve rien : une catégorie perdrait
       son dessin pour avoir gagné une précision. */
    const page = lire('pages/Boutique.jsx');
    assert.match(page, /\{CAT_ICON\[c\] \? <CatGlyph category=\{c\} size=\{13\} \/> : null\}/,
        'La recherche du glyphe doit porter sur l\'étiquette, pas sur la valeur brute.');
});

test("la catégorie des ARTICLES DE L'ÉCOLE reste indivisible", () => {
    /* Elle filtre les rayons et regroupe l'inventaire. La découper ferait disparaître des articles
       de leur rayon SANS erreur ni message : le filtre comparerait « Pelle » à « Pelle, 33 cm » et
       ne trouverait rien. */
    const page = lire('pages/Boutique.jsx');
    assert.match(page, /items\.filter\(\(i\) => i\.category === cat\)/,
        'Le filtre de rayon compare la catégorie ENTIÈRE — ne pas y introduire de découpage.');
    const inv = lire('pages/Inventaire.jsx');
    assert.doesNotMatch(inv, /listeCategories/,
        "L'inventaire groupe par catégorie : y découper les valeurs éclaterait les rayons.");
});

test("l'aperçu montre le découpage pendant la saisie", () => {
    /* Sans lui, la virgule est une convention invisible : on écrit « Four 400 °C » sans
       séparateur, on enregistre, et il faut aller ouvrir la boutique pour comprendre qu'il n'y a
       qu'une seule étiquette. */
    const comp = lire('components/PartnerProduits.jsx');
    assert.match(comp, /listeCategories\(form\.category\)\.length > 1/,
        'Le formulaire doit montrer les étiquettes dès qu\'il y en a plusieurs…');
    assert.match(comp, /Séparez par des virgules pour plusieurs étiquettes\./,
        '…et le dire tant qu\'il n\'y en a qu\'une.');
});

test("le nom et les étiquettes ne se partagent pas la même ligne", () => {
    /* LE DÉFAUT SIGNALÉ PAR L'ÉCOLE, et il était réel : dans le catalogue côté organisme, le nom
     * du produit et ses étiquettes coulaient dans un MÊME conteneur inline. Elles passaient donc à
     * la ligne LÀ OÙ LA PLACE MANQUAIT — « Four » restait collé au titre, « 400 °C » et
     * « électrique » tombaient dessous — ce qui donnait à croire à DEUX natures d'étiquettes
     * différentes, l'une du titre, l'autre du produit.
     *
     * Pire : le point de coupure changeait d'un produit à l'autre selon la longueur du libellé.
     * Sur « AVGVSTO PR 9 — dôme à sole rotative 500 °C », même le seul « Four » basculait à la
     * ligne. Un groupe stable vaut mieux qu'un groupe qui se réorganise à chaque nom.
     *
     * La correction n'est pas cosmétique : elle rétablit le fait que TOUTES ces étiquettes ont la
     * même nature. */
    const comp = fs.readFileSync(path.join(UI, 'components/PartnerProduits.jsx'), 'utf8');
    assert.match(comp, /<span className="pp-ident">/,
        'Le nom et ses étiquettes doivent vivre dans une colonne, pas dans un flux inline.');
    assert.match(comp, /<span className="pp-cats">/,
        'Les étiquettes doivent former un groupe à part, sur leur propre ligne.');

    const css = fs.readFileSync(path.join(UI, 'styles/app.css'), 'utf8');
    assert.match(css, /\.pp-ident\{[^}]*flex-direction:column/,
        'La colonne empêche les étiquettes de remonter à côté du nom.');
    assert.match(css, /\.pp-ident\{[^}]*min-width:0/,
        'Sans `min-width:0`, un nom long impose sa largeur et pousse le prix hors de la ligne.');
    assert.match(css, /\.pp-cats\{[^}]*flex-wrap:wrap/,
        'À sept étiquettes, le groupe doit s\'enrouler plutôt que déborder.');
});

test("les caractéristiques ne sont plus des badges codés en dur", () => {
    /* LE DÉFAUT : deux rangées d'étiquettes se superposaient sur une même fiche. Les catégories
     * saisies par l'école, et cinq badges tirés de la colonne JSON `specs` — sur un même four,
     * « 400 °C » et « électrique » s'affichaient DEUX FOIS.
     *
     * Le doublon n'était que le symptôme. `specs` est une liste FERMÉE (`energie`, `temp_max_c`,
     * `pizzas`, `sole_rotative`, `avpn`) : ajouter « pierre réfractaire » ou « hotte intégrée »
     * demandait de modifier le code. Les catégories libres n'ont pas cette limite. */
    const page = fs.readFileSync(path.join(UI, 'pages/Boutique.jsx'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '');   // les commentaires EXPLIQUENT le retrait, ils ne comptent pas
    assert.doesNotMatch(page, /function SpecsBadges/, 'Le composant doit avoir disparu…');
    assert.doesNotMatch(page, /<SpecsBadges/, '…et ne plus être appelé.');
    assert.doesNotMatch(page, /ENERGIE_LBL/, 'La table de libellés figés n\'a plus d\'objet.');

    /* MAIS `specs` RESTE LUE : `specs.devis` pilote « Sur devis auprès du partenaire ». Retirer la
       colonne avec les badges aurait fait disparaître ce message des quatre produits Marana, qui
       ne publient aucun prix — ils seraient passés à « Tarif sur demande », plus vague. */
    assert.match(page, /const devis = p\.specs && p\.specs\.devis;/,
        'Le message « Sur devis » dépend toujours de `specs`.');
});

test('la migration 134 recopie EXACTEMENT ce qui était affiché', () => {
    const MIG = path.join(__dirname, '..', '..', '..', 'database', 'migrations');
    const sql = fs.readFileSync(path.join(MIG, '134_specs_vers_categories.sql'), 'utf8');

    /* Les cinq libellés, aux mêmes mots : le stagiaire ne doit voir AUCUNE différence, sinon la
       migration ne transporte pas l'information, elle en invente une autre. */
    for (const libelle of ['Électrique', 'Gaz', 'Bois', 'Bois + gaz', 'Hybride', 'Convoyeur',
        ' °C', ' pizzas', 'sole rotative', 'AVPN']) {
        assert.ok(sql.includes(libelle), `le libellé « ${libelle} » doit être repris tel quel`);
    }
    /* `chambres` EXISTE DANS LE JSON MAIS N'A JAMAIS ÉTÉ AFFICHÉE. La recopier ferait APPARAÎTRE
       une information nouvelle sous couvert de migration — ce n'est pas le rôle d'un transport. */
    assert.doesNotMatch(sql, /\$\.chambres/,
        'Une migration transporte ce qui était affiché, elle n\'ajoute rien.');

    /* REJOUABLE : chaque libellé n'est ajouté que s'il est absent, et la comparaison encadre la
       valeur de virgules — sans quoi « 400 °C » se trouverait dans « 1400 °C » et ne serait
       jamais ajouté. */
    assert.match(sql, /NOT LIKE/, 'Rejouer le fichier ne doit rien dupliquer.');
    assert.ok(fs.existsSync(path.join(MIG, '134_revert_specs_vers_categories.sql')), 'un revert est obligatoire');

    /* LE REVERT NE PEUT PAS DISTINGUER ce que la migration a ajouté de ce que l'école a saisi : il
       doit le DIRE, sinon on le joue en croyant revenir en arrière sans perte. */
    const revert = fs.readFileSync(path.join(MIG, '134_revert_specs_vers_categories.sql'), 'utf8');
    assert.match(revert, /NE PEUT PAS DISTINGUER/,
        'Un revert de données doit annoncer ce qu\'il ne sait pas faire.');
});
