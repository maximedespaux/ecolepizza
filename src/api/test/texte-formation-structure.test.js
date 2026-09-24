/**
 * LE TEXTE D'UNE FORMATION GARDE SA FORME DANS UN DOCUMENT (constaté le 2026-09-24).
 *
 * LE DÉFAUT. Les objectifs d'une formation, écrits ligne à ligne avec des puces (« - Connaître…\n- Citer… »),
 * sortaient dans le devis sur UNE seule ligne : « - Connaître… - Citer… ». Un saut de ligne inséré tel
 * quel dans le HTML ne vaut qu'une espace, et LibreOffice le replie comme un navigateur. Même sort pour la
 * durée (« Lundi… Mardi… Vendredi… » d'un seul tenant) et pour le public (puces « • »).
 *
 * Les balisages ci-dessous sont ceux, EXACTS, des modèles de production (devis-particulier et
 * devis-professionnel, relevés le 2026-09-24) : un jeton seul dans son paragraphe, enveloppé d'une taille
 * de police ; et un jeton dans une phrase, « Durée : {DuréeDétail} ». Le rendu a été vérifié en PDF par
 * LibreOffice avec les vrais textes de NIV1H et RS7404 : listes à retrait suspendu, une ligne par jour.
 */
const test = require('node:test');
const assert = require('node:assert');
const { blocsDuTexte, texteEnLignes } = require('../lib/texteStructure.js');
const { fillHtml } = require('../lib/htmlfill.js');

const jeton = (k, l = k) => `<span class="doc-token" contenteditable="false" data-token="${k}" data-label="${l}">${l}</span>`;
const SEUL = (k) => `<p style="line-height: 1;"><span style="font-size: 10pt;">${jeton(k)}</span></p>`;
const PHRASE = `<p style="line-height: 1;"><span style="color: rgb(84, 141, 212);"><strong><u>Durée</u>&nbsp;: </strong></span><span style="font-size: 10pt;">${jeton('DuréeDétail', 'Durée (détail)')}</span></p>`;
const OBJECTIFS = "- Identifier les composants du blé\n- Citer les ingrédients\nGérer un établissement en appliquant l'hygiène.\n1- Les fondamentaux\n- Fabriquer un empâtement direct - Pointer, diviser";

/* ─── La lecture du texte ──────────────────────────────────────────────────────────────────── */

test('les lignes à puce qui se suivent font UNE liste ; le reste garde ses lignes', () => {
    assert.deepStrictEqual(blocsDuTexte(OBJECTIFS), [
        { liste: ['Identifier les composants du blé', 'Citer les ingrédients'] },
        { ligne: "Gérer un établissement en appliquant l'hygiène." },
        { ligne: '1- Les fondamentaux' },
        { liste: ['Fabriquer un empâtement direct - Pointer, diviser'] },
    ]);
});

test('toutes les puces de l\'organisme, collées ou non — mais jamais un tiret devant un chiffre', () => {
    assert.deepStrictEqual(blocsDuTexte('- a\n• b\n* c\n– d\n-e'), [{ liste: ['a', 'b', 'c', 'd', 'e'] }]);
    assert.deepStrictEqual(blocsDuTexte('-12h00\n-5 % de remise'), [{ ligne: '-12h00' }, { ligne: '-5 % de remise' }]);
    assert.deepStrictEqual(blocsDuTexte('Lundi 8H45 - 12H00 :\nMardi – Jeudi'), [{ ligne: 'Lundi 8H45 - 12H00 :' }, { ligne: 'Mardi – Jeudi' }],
        'un tiret au milieu d\'une ligne n\'est pas une puce');
    assert.deepStrictEqual(blocsDuTexte('A :\n- a\n\n\nB :\n- b\n\n'), [{ ligne: 'A :' }, { liste: ['a'] }, { vide: true }, { ligne: 'B :' }, { liste: ['b'] }],
        'une ligne vide sépare (plusieurs formations : « Titre :\\n… » séparés d\'une ligne vide), sans s\'accumuler ni traîner');
});

/* ─── Le document ─────────────────────────────────────────────────────────────────────────── */

test('SEUL dans son paragraphe : de vraies listes, dans le style du paragraphe', () => {
    const out = fillHtml(SEUL('Objectifs'), {}, { Objectifs: OBJECTIFS });
    assert.match(out, /^<ul><li><p style="line-height: 1;"><span style="font-size: 10pt;">Identifier les composants du blé<\/span><\/p><\/li><li>/,
        'même interligne, même taille de police, même forme de liste que l\'éditeur');
    assert.strictEqual((out.match(/<ul>/g) || []).length, 2, 'deux listes, coupées par les lignes de texte');
    assert.match(out, /<p style="line-height: 1;"><span style="font-size: 10pt;">1- Les fondamentaux<\/span><\/p>/);
    assert.doesNotMatch(out, />- /, 'plus aucun tiret de puce dans le texte');
    assert.doesNotMatch(out, /<p[^>]*>(?:(?!<\/p>).)*<ul>/, 'jamais une liste à l\'intérieur d\'un paragraphe');
});

test('DANS une phrase : une ligne par ligne, et aucune liste dans le paragraphe', () => {
    const out = fillHtml(PHRASE, {}, { 'DuréeDétail': 'Lundi : 8h45\nMardi, Mercredi : 8h00\nVendredi : 8h00' });
    assert.match(out, /<u>Durée<\/u>&nbsp;: <\/strong><\/span><span style="font-size: 10pt;">Lundi : 8h45<br>Mardi, Mercredi : 8h00<br>Vendredi : 8h00<\/span><\/p>$/);
    assert.strictEqual(texteEnLignes('- a\n- b'), '• a<br>• b', 'une puce dans une phrase reste une puce');
});

test('un texte d\'une ligne, sans puce, sort exactement comme avant', () => {
    const avant = `<p style="line-height: 1;"><span style="font-size: 10pt;">Tout public &amp; &lt;débutants&gt;</span></p>`;
    assert.strictEqual(fillHtml(SEUL('Public'), {}, { Public: 'Tout public & <débutants>' }), avant);
});

test('le texte reste échappé, en liste comme en ligne', () => {
    const seul = fillHtml(SEUL('Objectifs'), {}, { Objectifs: '- <script>x</script>\n- b' });
    const phrase = fillHtml(PHRASE, {}, { 'DuréeDétail': '<img src=x>\nMardi' });
    assert.doesNotMatch(seul + phrase, /<script>|<img/);
    assert.match(seul, /&lt;script&gt;x&lt;\/script&gt;/);
});

test('seuls les textes de formation changent : les autres jetons gardent leur rendu', () => {
    const autre = `<p>${jeton('Adresse')}</p>`;
    assert.strictEqual(fillHtml(autre, {}, { Adresse: '1 rue A\n65300 B' }), '<p>1 rue A\n65300 B</p>');
    const champ = fillHtml(SEUL('field:training_program.objectives'), {}, { 'field:training_program.objectives': '- a\n- b' });
    assert.match(champ, /^<ul><li>/, 'le même texte par « Champs documents » a la même forme');
});

test('une mise en forme bancale autour du jeton : rendu en lignes, jamais un HTML cassé', () => {
    const bancal = `<p><span style="font-size: 10pt;"><strong>${jeton('Objectifs')}</span></p>`;
    const out = fillHtml(bancal, {}, { Objectifs: '- a\n- b' });
    assert.doesNotMatch(out, /<ul>/);
    assert.match(out, /• a<br>• b/);
});
