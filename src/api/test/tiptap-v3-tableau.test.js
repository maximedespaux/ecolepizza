/**
 * COMPATIBILITÉ DU RENDU PDF AVEC LA SÉRIALISATION TIPTAP v3 — migration de l'éditeur v2 -> v3
 * (2026-09-28). Un modèle rouvert et enregistré dans le nouvel éditeur sort désormais ses tableaux
 * avec DEUX ajouts propres à la v3, tous deux en CSS :
 *   · un `<colgroup>` dont chaque `<col>` porte `style="min-width:Npx"` (la v2 écrivait `width:Npx`) ;
 *   · un `style="min-width:50px"` sur le `<table>` lui-même.
 * LibreOffice ignore le CSS (cf. CLAUDE.md § 3) : il faut que le serveur RETROUVE des largeurs en
 * ATTRIBUTS. C'est déjà le cas — `colsEnPourcent` (htmlfill.js) attrape `min-width:Npx` par la même
 * regex que `width:Npx` (le mot « width » y est contenu) et réécrit `<col width="X%">`, et
 * `sansLargeur` remplace le style du `<table>` par `width="100%"`. Ce test GÈLE ce contrat : si un
 * jour `colsEnPourcent` ne visait plus que `width:` (et pas `min-width:`), les colonnes des modèles
 * réenregistrés en v3 perdraient leur largeur au PDF, en silence. Il vérifie donc que la forme v3
 * rend EXACTEMENT comme la forme v2 équivalente.
 *
 * Le reste de la sérialisation (jetons `data-token`, `data-border/width/rows/minlines`, colonnes
 * `data-cols`, saut de page `p.doc-pagebreak`, image `width/height`) est resté MOT POUR MOT celui de
 * la v2 — vérifié au banc d'essai de l'éditeur le jour de la migration ; seuls les tableaux changeaient.
 */
const test = require('node:test');
const assert = require('node:assert');
const { renderBodyOnlyDoc } = require('../lib/htmlfill.js');

/* Le bloc {#Articles} ENJAMBE la ligne (ouvre dans la 1re cellule, ferme dans la dernière), et
   chaque cellule porte colspan/rowspan="1" — la forme que ProseMirror écrit DÉJÀ en v2. */
const LIGNE = '<tr>'
    + '<td colspan="1" rowspan="1"><p>{#Articles}<span data-token="Référence"></span></p></td>'
    + '<td colspan="1" rowspan="1"><p><span data-token="Désignation"></span></p></td>'
    + '<td colspan="1" rowspan="1"><p><span data-token="Montant TTC"></span>{/Articles}</p></td>'
    + '</tr>';
const ENTETE = '<tr>'
    + '<th colspan="1" rowspan="1"><p>Réf</p></th>'
    + '<th colspan="1" rowspan="1"><p>Désignation</p></th>'
    + '<th colspan="1" rowspan="1"><p>Montant</p></th></tr>';

/* Tiptap v3 : colgroup à min-width + style min-width sur la table. */
const V3 = '<table data-border="solid" class="tbl-b-solid" data-width="full" data-rows="inline" data-minlines="3" style="min-width: 50px;">'
    + '<colgroup><col style="min-width: 25px;"><col style="min-width: 25px;"><col style="min-width: 25px;"></colgroup>'
    + `<tbody>${ENTETE}${LIGNE}</tbody></table>`;
/* Tiptap v2 équivalent : ni colgroup à min-width ni style de table. */
const V2 = '<table data-border="solid" data-width="full" data-rows="inline" data-minlines="3">'
    + `<tbody>${ENTETE}${LIGNE}</tbody></table>`;

const CTX = { org: { legal_name: 'X' }, articles: [
    { name: 'Pizza', qty: 1, unit_price_ht: 100, amount: 100, taxRate: 20, ref: 'R1' },
    { name: 'Focaccia', qty: 2, unit_price_ht: 50, amount: 100, taxRate: 20, ref: 'R2' },
] };

const rendreV3 = () => renderBodyOnlyDoc(V3, CTX, {});
const rendreV2 = () => renderBodyOnlyDoc(V2, CTX, {});

test('un tableau sérialisé par Tiptap v3 ne garde AUCUN min-width au rendu (converti en largeur)', () => {
    const html = rendreV3();
    assert.doesNotMatch(html, /min-width/i, 'le CSS min-width, ignoré par LibreOffice, doit être remplacé par des largeurs en attribut');
    assert.match(html, /<col width="33\.3%">/, 'les colonnes du colgroup deviennent des largeurs en pourcentage');
    assert.match(html, /<table[^>]*\bwidth="100%"/, 'le style min-width de la table cède la place à width="100%"');
});

test('la forme v3 rend comme la forme v2 : mêmes bordures, mêmes lignes, mêmes articles', () => {
    const v3 = rendreV3();
    const v2 = rendreV2();
    const compte = (h) => ({
        tr: (h.match(/<tr\b/gi) || []).length,
        bordures: (h.match(/border:1px solid/gi) || []).length,
        articles: (h.match(/Pizza|Focaccia/g) || []).length,
        comblement: (h.match(/&nbsp;/g) || []).length,
    });
    const cv3 = compte(v3);
    assert.deepStrictEqual(cv3, compte(v2), 'le colgroup et le style de table de la v3 ne changent rien au PDF');
    assert.strictEqual(cv3.articles, 2, 'les deux articles sont rendus');
    assert.ok(cv3.bordures >= 6, 'les bordures sont réinjectées en ligne sur chaque cellule');
});

test('en mode « en ligne », la v3 garde UNE seule ligne d\'articles (le bloc ne duplique pas la ligne)', () => {
    // 2 lignes attendues : l'en-tête + l'unique ligne d'articles empilés (data-rows="inline").
    assert.strictEqual((rendreV3().match(/<tr\b/gi) || []).length, 2);
});
