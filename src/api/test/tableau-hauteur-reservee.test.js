/**
 * Tableau « à hauteur réservée » : data-rows="inline" + data-minlines="N".
 *
 * LE DÉFAUT GELÉ ICI. Un bloc {#Articles} produit normalement UNE LIGNE DE TABLEAU par article :
 * le tableau grandit et rétrécit avec la commande, et tout ce qui suit — totaux, mentions
 * légales, cadre de signature — se déplace verticalement d'une facture à l'autre. Le mode « en
 * ligne » garde UNE SEULE ligne et empile les articles dans la cellule avec les <br> du gabarit ;
 * `data-minlines` réserve un plancher de hauteur pour que le bas de page ne bouge plus.
 *
 * LE PIÈGE PRINCIPAL (test « une seule ligne de tableau »). `expandListBlocks` essaie d'abord sa
 * forme « ligne de tableau », dont la regex attrape TOUT <tr> contenant les deux marqueurs —
 * y compris quand ils tiennent dans une seule cellule. Sans le garde-fou `opts.inline`, le
 * tableau voyait quand même sa ligne dupliquée et le mode ne servait à rien. C'est la raison
 * d'être d'`expandInlineTables`, qui développe ces tableaux AVANT le passage général.
 *
 * POURQUOI DES LIGNES VIDES ET PAS UNE HAUTEUR CSS. Vérifié au rendu LibreOffice, six variantes
 * côte à côte : l'attribut `height` sur <table> comme sur <tr>, `height` en CSS sur la table ou
 * la cellule, et même `padding-bottom` en millimètres sont TOUS ignorés — le tableau sort à la
 * hauteur de son seul contenu. Seul le contenu fait la hauteur, d'où le comblement par des
 * `&nbsp;<br>`. Un test qui vérifierait une hauteur CSS passerait au vert en décrivant un PDF
 * faux : on vérifie donc les lignes de comblement.
 */
const test = require('node:test');
const assert = require('node:assert');
const { renderBodyOnlyDoc } = require('../lib/htmlfill.js');

const BLOC = '{#Articles}<span data-token="Désignation"></span> — '
    + '<span data-token="Montant TTC"></span><br>{/Articles}';

/* FORME RÉELLE DES MODÈLES — celle de `facture-stagiaire`, relevée dans l'éditeur : le bloc
   ENJAMBE la ligne, `{#Articles}` dans la PREMIÈRE cellule et `{/Articles}` dans la DERNIÈRE,
   chaque cellule portant son propre jeton dans un <p> (ProseMirror). C'est cette forme-là qu'il
   faut geler : la première version de ces tests posait les deux marqueurs dans une seule cellule
   — forme inventée — et laissait donc passer le défaut qui dupliquait les COLONNES. */
const CEL = (contenu) => `<td colspan="1" rowspan="1"><p>${contenu}</p></td>`;
const LIGNE_REELLE = '<tr>'
    + CEL('{#Articles}<span data-token="Référence"></span>')
    + CEL('<span data-token="Désignation"></span>')
    + CEL('<span data-token="Quantité"></span>')
    + CEL('<span data-token="Montant TTC"></span>{/Articles}')
    + '</tr>';

/** Corps de modèle : un tableau contenant le bloc, en mode « en ligne » ou non. */
const corps = ({ inline = false, mini = 0 } = {}) =>
    `<table data-border="solid" data-width="full"`
    + `${inline ? ' data-rows="inline"' : ''}${mini ? ` data-minlines="${mini}"` : ''}>`
    + `<tbody><tr><th>Désignation</th><th>Montant</th></tr>`
    + `<tr><td>${BLOC}</td><td>Total</td></tr></tbody></table>`;

const articles = (n) => Array.from({ length: n }, (_, i) => ({
    name: `Article ${i + 1}`, qty: 1, unit_price_ht: 100, amount: 100, taxRate: 20,
}));

const rendu = (opts, n) =>
    renderBodyOnlyDoc(corps(opts), { org: { legal_name: 'X' }, articles: articles(n) }, {});

const nbLignes = (html) => (html.match(/<tr\b/gi) || []).length;
const nbComble = (html) => (html.match(/&nbsp;/g) || []).length;

test('en mode « en ligne », les articles tiennent dans UNE seule ligne de tableau', () => {
    const html = rendu({ inline: true }, 4);
    // 2 seulement : l'en-tête et la ligne d'articles. 5 signalerait la répétition classique.
    assert.strictEqual(nbLignes(html), 2, 'la ligne ne doit pas être dupliquée');
    // …et les quatre désignations sont bien toutes présentes, dans l'ordre.
    for (let i = 1; i <= 4; i++) assert.ok(html.includes(`Article ${i}`), `Article ${i} manquant`);
    const p1 = html.indexOf('Article 1'), p4 = html.indexOf('Article 4');
    assert.ok(p1 < p4, 'ordre des articles conservé');
    // Aucune balise de fin de ligne entre le premier et le dernier : même cellule.
    assert.ok(!/Article 1[\s\S]*?<\/tr>[\s\S]*?Article 4/.test(html),
        'les articles doivent rester dans la MÊME cellule');
});

test('sans le mode, le comportement classique est intact (une ligne par article)', () => {
    const html = rendu({}, 4);
    assert.strictEqual(nbLignes(html), 5, 'en-tête + une ligne par article');
    assert.strictEqual(nbComble(html), 0, 'aucun comblement hors hauteur réservée');
});

test('une hauteur réservée SANS le mode « en ligne » reste sans effet', () => {
    // État que la barre d'outils produit vraiment : on active le mode, on choisit 10 lignes,
    // puis on désactive le mode — `data-minlines` reste sur le tableau. Il doit être inerte,
    // sinon un tableau redevenu classique se retrouverait avec des lignes vides parasites.
    const html = rendu({ mini: 10 }, 3);
    assert.strictEqual(nbLignes(html), 4, 'en-tête + une ligne par article');
    assert.strictEqual(nbComble(html), 0, 'aucun comblement sans data-rows="inline"');
});

test('la hauteur réservée comble les articles manquants par des lignes vides', () => {
    const html = rendu({ inline: true, mini: 10 }, 3);
    assert.strictEqual(nbComble(html), 7, '10 lignes réservées - 3 articles = 7 lignes vides');
    assert.strictEqual(nbLignes(html), 2, 'le comblement ne crée pas de lignes de tableau');
});

test('une facture sans article garde quand même sa hauteur réservée', () => {
    // Sinon les totaux remonteraient : c'est le cas qui justifie le plancher.
    const html = rendu({ inline: true, mini: 10 }, 0);
    assert.strictEqual(nbComble(html), 10);
});

test('au-delà de la hauteur réservée, le tableau s\'allonge sans être tronqué', () => {
    const html = rendu({ inline: true, mini: 10 }, 14);
    assert.strictEqual(nbComble(html), 0, 'rien à combler quand on dépasse');
    for (let i = 1; i <= 14; i++) assert.ok(html.includes(`Article ${i}`), `Article ${i} perdu`);
});

test('le comblement ne décale pas d\'une ligne quand le gabarit finit déjà par <br>', () => {
    // Le gabarit ci-dessus finit par <br> : on est déjà en début de ligne neuve. Ajouter un
    // saut d'amorce ferait un tableau d'une ligne DE TROP par rapport à la hauteur demandée.
    const html = rendu({ inline: true, mini: 5 }, 2);
    const cellule = /<td[^>]*>([\s\S]*?)<\/td>/i.exec(html)[1];
    // 2 articles + 3 lignes vides = 5 lignes => 4 sauts de ligne séparateurs exactement.
    assert.strictEqual((cellule.match(/<br\s*\/?>/gi) || []).length, 4,
        'un <br> de trop = une ligne de trop dans le PDF');
});

/* ------------------------------------------------------------------------------------------
   La forme RÉELLE : bloc qui enjambe la ligne. C'est le défaut vu à l'aperçu PDF.
   ------------------------------------------------------------------------------------------ */

/** Corps de modèle bâti sur la ligne réelle (bloc réparti sur plusieurs cellules). */
const corpsReel = ({ inline = false, mini = 0 } = {}) =>
    `<table data-border="solid" data-width="full"`
    + `${inline ? ' data-rows="inline"' : ''}${mini ? ` data-minlines="${mini}"` : ''}>`
    + `<tbody><tr><th>Réf</th><th>Désignation</th><th>Qté</th><th>TTC</th></tr>`
    + `${LIGNE_REELLE}</tbody></table>`;

const renduReel = (opts, n) =>
    renderBodyOnlyDoc(corpsReel(opts), { org: { legal_name: 'X' }, articles: articles(n) }, {});

/** Nombre de cellules de la ligne de corps (la 2ᵉ ligne du tableau). */
const nbCellulesCorps = (html) => {
    const lignes = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
    return ((lignes[1] || '').match(/<td\b/gi) || []).length;
};

test('bloc réparti sur la ligne : les articles s\'empilent SANS créer de colonnes', () => {
    const html = renduReel({ inline: true, mini: 10 }, 3);
    // LE DÉFAUT GELÉ : la version fautive recopiait les `</td><td>` entre les marqueurs et la
    // ligne passait de 4 à 12 cellules — le 2ᵉ article s'étalait à DROITE du premier.
    assert.strictEqual(nbCellulesCorps(html), 4, '3 articles ne doivent pas multiplier les colonnes');
    assert.strictEqual(nbLignes(html), 2, 'une seule ligne de corps');
    for (let i = 1; i <= 3; i++) assert.ok(html.includes(`Article ${i}`), `Article ${i} manquant`);
});

test('bloc réparti : chaque cellule empile ses propres valeurs, séparées par <br>', () => {
    const html = renduReel({ inline: true }, 3);
    const cellules = (html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [])[1].match(/<td\b[\s\S]*?<\/td>/gi);
    // La cellule « Désignation » porte les trois libellés, et eux seuls.
    const design = cellules[1];
    for (let i = 1; i <= 3; i++) assert.ok(design.includes(`Article ${i}`), `Article ${i} hors de sa cellule`);
    assert.strictEqual((design.match(/<br\s*\/?>/gi) || []).length, 2, '3 articles = 2 séparateurs');
    // La cellule « Qté » ne contient QUE des quantités — pas de désignation qui aurait débordé.
    assert.ok(!/Article/.test(cellules[2]), 'les valeurs ne doivent pas déborder de cellule en cellule');
});

test('bloc réparti : un seul <p> par cellule (pas un par article)', () => {
    // Sinon les marges de paragraphe rouvrent à chaque article et l'empilement respire double.
    const html = renduReel({ inline: true }, 4);
    const design = (html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [])[1].match(/<td\b[\s\S]*?<\/td>/gi)[1];
    assert.strictEqual((design.match(/<p\b/gi) || []).length, 1, 'un seul paragraphe par cellule');
});

test('une cellule à PLUSIEURS paragraphes ne décale pas sa colonne', () => {
    /* Relevé sur `facture-stagiaire` : « Taux TVA » et « Taux TTC » portent DEUX paragraphes,
       dont un vide, hérité du temps où la ligne se répétait (sans conséquence alors). Le défaut
       gelé ici : ces deux colonnes sortaient une ligne plus bas que les cinq autres sur le PDF,
       parce qu'un paragraphe vide répété ajoutait une ligne blanche PAR article — et parce que
       l'extraction du <p> capturait `A</p><p>B` en imbriquant du HTML invalide. */
    const ligne = '<tr>'
        + CEL('{#Articles}<span data-token="Désignation"></span>')
        + '<td colspan="1" rowspan="1"><p></p><p><span data-token="Montant TTC"></span>{/Articles}</p></td>'
        + '</tr>';
    const corps = '<table data-border="solid" data-width="full" data-rows="inline">'
        + `<tbody><tr><th>D</th><th>TTC</th></tr>${ligne}</tbody></table>`;
    const html = renderBodyOnlyDoc(corps, { org: { legal_name: 'X' }, articles: articles(3) }, {});
    const cellules = (html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [])[1].match(/<td\b[\s\S]*?<\/td>/gi);
    const [gauche, droite] = cellules.map((c) => (c.match(/<br\s*\/?>/gi) || []).length);
    assert.strictEqual(droite, gauche,
        'les deux colonnes doivent compter le MÊME nombre de sauts, sinon elles se désalignent');
    assert.strictEqual((cellules[1].match(/<p\b/gi) || []).length, 1,
        'les paragraphes de la cellule sont aplatis en un seul');
});

test('bloc réparti : la hauteur réservée comble CHAQUE cellule', () => {
    const html = renduReel({ inline: true, mini: 8 }, 3);
    const cellules = (html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [])[1].match(/<td\b[\s\S]*?<\/td>/gi);
    for (const [i, c] of cellules.entries()) {
        assert.strictEqual((c.match(/&nbsp;/g) || []).length, 5,
            `cellule ${i} : 8 réservées - 3 articles = 5 lignes vides`);
    }
});

test('bloc réparti SANS le mode : le comportement classique est intact', () => {
    // La répétition de LIGNES reste la norme pour tous les modèles existants.
    const html = renduReel({}, 3);
    assert.strictEqual(nbLignes(html), 4, 'en-tête + une ligne par article');
    assert.strictEqual(nbCellulesCorps(html), 4, 'chaque ligne garde ses 4 cellules');
});

test('les cellules d\'un tableau à hauteur réservée sont calées en haut', () => {
    // valign EN ATTRIBUT : LibreOffice ignore `vertical-align` en CSS (constaté au rendu — le
    // total flottait au milieu du vide, en face de rien). Le CSS est gardé pour l'aperçu écran.
    const html = rendu({ inline: true, mini: 10 }, 2);
    assert.match(html, /<td[^>]*valign="top"/i, 'attribut valign attendu, pas seulement le CSS');
    assert.match(html, /vertical-align:top/);
});

test('un tableau ordinaire n\'est pas calé en haut de force', () => {
    assert.ok(!/valign="top"/i.test(rendu({}, 2)), 'le mode ne doit pas déborder sur les autres tableaux');
});
