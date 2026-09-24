/**
 * LE TEXTE D'UNE FORMATION GARDE SA FORME DANS UN DOCUMENT (constaté le 2026-09-24).
 *
 * LE DÉFAUT. Les objectifs d'une formation, écrits ligne à ligne avec des puces (« - Connaître…\n- Citer… »),
 * sortaient dans le devis sur UNE seule ligne : « - Connaître… - Citer… ». Un saut de ligne inséré tel
 * quel dans le HTML ne vaut qu'une espace, et LibreOffice le replie comme un navigateur. Même sort pour la
 * durée (« Lundi… Mardi… Vendredi… » d'un seul tenant) et pour le public (puces « • »).
 *
 * PUIS LES NUMÉROS (même jour). Les objectifs de NIV1H finissent par « 1- Les fondamentaux… », « 2- Les
 * bonnes pratiques… », « 3- Le plan de maîtrise sanitaire » : une fois les puces en liste, ces trois
 * lignes restaient du texte à tiret, seules de leur espèce. Elles font maintenant une liste numérotée — sans
 * jamais prendre pour un numéro une heure, une date, une quantité ou une fourchette (« 12 - 15 personnes »).
 *
 * Les balisages ci-dessous sont ceux, EXACTS, des modèles de production (devis-particulier et
 * devis-professionnel, relevés le 2026-09-24) : un jeton seul dans son paragraphe, enveloppé d'une taille
 * de police ; et un jeton dans une phrase, « Durée : {DuréeDétail} ». Le rendu a été vérifié en PDF par
 * LibreOffice avec les vrais textes de NIV1H et RS7404 : listes à retrait suspendu, une ligne par jour.
 */
const test = require('node:test');
const assert = require('node:assert');
const { blocsDuTexte, texteEnLignes, texteEnBlocs } = require('../lib/texteStructure.js');
const { fillHtml } = require('../lib/htmlfill.js');

const jeton = (k, l = k) => `<span class="doc-token" contenteditable="false" data-token="${k}" data-label="${l}">${l}</span>`;
const SEUL = (k) => `<p style="line-height: 1;"><span style="font-size: 10pt;">${jeton(k)}</span></p>`;
const PHRASE = `<p style="line-height: 1;"><span style="color: rgb(84, 141, 212);"><strong><u>Durée</u>&nbsp;: </strong></span><span style="font-size: 10pt;">${jeton('DuréeDétail', 'Durée (détail)')}</span></p>`;
/* La forme des objectifs de NIV1H : des puces, une phrase, puis trois lignes numérotées. */
const OBJECTIFS = "- Identifier les composants du blé\n- Fabriquer un empâtement direct - Pointer, diviser\nGérer un établissement en appliquant l'hygiène.\n1- Les fondamentaux\n2- Les bonnes pratiques\n3- Le plan de maîtrise sanitaire";

/* ─── La lecture du texte ──────────────────────────────────────────────────────────────────── */

test('les lignes à puce qui se suivent font UNE liste, les lignes numérotées une autre ; le reste garde ses lignes', () => {
    assert.deepStrictEqual(blocsDuTexte(OBJECTIFS), [
        { liste: ['Identifier les composants du blé', 'Fabriquer un empâtement direct - Pointer, diviser'] },
        { ligne: "Gérer un établissement en appliquant l'hygiène." },
        { numerotee: [{ n: 1, texte: 'Les fondamentaux' }, { n: 2, texte: 'Les bonnes pratiques' }, { n: 3, texte: 'Le plan de maîtrise sanitaire' }] },
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

test('tous les numéros de l\'organisme — mais jamais une heure, une date, une quantité ni une fourchette', () => {
    assert.deepStrictEqual(blocsDuTexte('1- a\n2) b\n3. c\n4/ d\n5-e\n6 - f'),
        [{ numerotee: ['a', 'b', 'c', 'd', 'e', 'f'].map((texte, i) => ({ n: i + 1, texte })) }]);
    for (const t of ['8h45 - 12h30', '10h00 - 12h00 : pratique', '2026-09-24 : examen', '1.5 L de lait', '3,5 kg de farine',
        '12 - 15 personnes', '8 - 12h', '2 ans minimum', '1er jour', '100- a', '12.']) {
        assert.deepStrictEqual(blocsDuTexte(t), [{ ligne: t }], `« ${t} » n'est pas un numéro`);
    }
});

test('les numéros écrits sont gardés : une liste qui commence à 3, ou qui saute un numéro', () => {
    assert.strictEqual(texteEnBlocs('3- a\n4- b'), '<ol start="3"><li><p>a</p></li><li><p>b</p></li></ol>');
    assert.strictEqual(texteEnBlocs('1- a\n3- b'), '<ol><li><p>a</p></li></ol><ol start="3"><li><p>b</p></li></ol>',
        'renuméroter « 1- … 3- … » en 1, 2 changerait ce que l\'organisme a écrit');
});

test('puces et numéros se coupent l\'un l\'autre, et la numérotation reprend où elle en était', () => {
    assert.deepStrictEqual(blocsDuTexte('1- a\n- x\n2- b'), [{ numerotee: [{ n: 1, texte: 'a' }] }, { liste: ['x'] }, { numerotee: [{ n: 2, texte: 'b' }] }]);
    assert.strictEqual(texteEnBlocs('1- a\n- x\n2- b'), '<ol><li><p>a</p></li></ol><ul><li><p>x</p></li></ul><ol start="2"><li><p>b</p></li></ol>');
});

/* ─── Le document ─────────────────────────────────────────────────────────────────────────── */

test('SEUL dans son paragraphe : de vraies listes, dans le style du paragraphe', () => {
    const out = fillHtml(SEUL('Objectifs'), {}, { Objectifs: OBJECTIFS });
    assert.match(out, /^<ul><li><p style="line-height: 1;"><span style="font-size: 10pt;">Identifier les composants du blé<\/span><\/p><\/li><li>/,
        'même interligne, même taille de police, même forme de liste que l\'éditeur');
    assert.strictEqual((out.match(/<ul>/g) || []).length, 1);
    assert.match(out, /<ol><li><p style="line-height: 1;"><span style="font-size: 10pt;">Les fondamentaux<\/span><\/p><\/li><li><p style="line-height: 1;"><span style="font-size: 10pt;">Les bonnes pratiques<\/span><\/p><\/li><li>[^]*sanitaire<\/span><\/p><\/li><\/ol>$/,
        'les trois lignes numérotées font UNE liste numérotée, dans le même style');
    assert.doesNotMatch(out, />- |>\d+- /, 'plus aucun tiret de puce ni numéro écrit à la main dans le texte');
    assert.doesNotMatch(out, /<p[^>]*>(?:(?!<\/p>).)*<[uo]l>/, 'jamais une liste à l\'intérieur d\'un paragraphe');
});

test('DANS une phrase : une ligne par ligne, et aucune liste dans le paragraphe', () => {
    const out = fillHtml(PHRASE, {}, { 'DuréeDétail': 'Lundi : 8h45\nMardi, Mercredi : 8h00\nVendredi : 8h00' });
    assert.match(out, /<u>Durée<\/u>&nbsp;: <\/strong><\/span><span style="font-size: 10pt;">Lundi : 8h45<br>Mardi, Mercredi : 8h00<br>Vendredi : 8h00<\/span><\/p>$/);
    assert.strictEqual(texteEnLignes('- a\n- b'), '• a<br>• b', 'une puce dans une phrase reste une puce');
    assert.strictEqual(texteEnLignes('1- a\n2) b'), '1. a<br>2. b', 'un numéro dans une phrase reste un numéro, écrit d\'une seule façon');
});

test('un texte d\'une ligne, sans puce, sort exactement comme avant', () => {
    const avant = `<p style="line-height: 1;"><span style="font-size: 10pt;">Tout public &amp; &lt;débutants&gt;</span></p>`;
    assert.strictEqual(fillHtml(SEUL('Public'), {}, { Public: 'Tout public & <débutants>' }), avant);
    const fourchette = `<p style="line-height: 1;"><span style="font-size: 10pt;">12 - 15 personnes</span></p>`;
    assert.strictEqual(fillHtml(SEUL('Public'), {}, { Public: '12 - 15 personnes' }), fourchette, 'une fourchette n\'est pas un numéro');
});

test('le texte reste échappé, en liste comme en ligne', () => {
    const seul = fillHtml(SEUL('Objectifs'), {}, { Objectifs: '- <script>x</script>\n- b\n1- <b>c</b>' });
    const phrase = fillHtml(PHRASE, {}, { 'DuréeDétail': '<img src=x>\nMardi\n2- <i>y</i>' });
    assert.doesNotMatch(seul + phrase, /<script>|<img|<b>|<i>/);
    assert.match(seul, /&lt;script&gt;x&lt;\/script&gt;/);
    assert.match(seul, /<ol><li><p[^>]*><span[^>]*>&lt;b&gt;c&lt;\/b&gt;<\/span><\/p><\/li><\/ol>$/, 'un numéro garde son texte échappé');
    assert.match(phrase, /<br>2\. &lt;i&gt;y&lt;\/i&gt;/);
});

test('seuls les textes de formation changent : les autres jetons gardent leur rendu', () => {
    const autre = `<p>${jeton('Adresse')}</p>`;
    assert.strictEqual(fillHtml(autre, {}, { Adresse: '1 rue A\n65300 B' }), '<p>1 rue A\n65300 B</p>');
    const champ = fillHtml(SEUL('field:training_program.objectives'), {}, { 'field:training_program.objectives': '- a\n- b' });
    assert.match(champ, /^<ul><li>/, 'le même texte par « Champs documents » a la même forme');
});

test('une mise en forme bancale autour du jeton : rendu en lignes, jamais un HTML cassé', () => {
    const bancal = `<p><span style="font-size: 10pt;"><strong>${jeton('Objectifs')}</span></p>`;
    const out = fillHtml(bancal, {}, { Objectifs: '- a\n- b\n1- c' });
    assert.doesNotMatch(out, /<[uo]l>/);
    assert.match(out, /• a<br>• b<br>1\. c/);
});
