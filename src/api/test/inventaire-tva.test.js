/**
 * LA TVA D'UN ARTICLE, DANS LA FENÊTRE « MODIFIER L'ARTICLE » — relevé le 2026-09-30, en marge de
 * montant-saisi-ventes.test.js.
 *
 * LE DÉFAUT : un article à 10 %, à 5,5 %, à 2,1 % ou exonéré s'ouvrait en affichant « 20 % ».
 * `inventory_item.tax_rate` est un DECIMAL(5,2), et mysql2 rend un décimal en CHAÎNE, avec ses deux
 * décimales — « 10.00 », « 5.50 » (config/database.js n'active pas `decimalNumbers`). La fenêtre
 * donnait cette chaîne telle quelle à la liste, `value={String(editing.tax_rate)}`, dont les options
 * s'écrivent « 20 », « 10 », « 5.5 », « 2.1 », « 0 ». « 10.00 » n'en désigne aucune, et une liste
 * dont la valeur n'existe pas affiche sa PREMIÈRE option.
 *
 * CE QUE ÇA DONNAIT, vu dans le navigateur sur six articles fictifs : « 20 % » pour les six, à côté
 * d'un « TTC : 110 € » calculé, lui, au vrai taux — la fenêtre se contredisait. Enregistrer sans
 * toucher à la liste renvoyait « 10.00 » : rien ne s'abîmait. Mais c'est sur l'écran qu'on décide :
 * « 20 %, c'est bon » devant un article à 10 %, ou une « correction » qui change la TVA.
 *
 * POURQUOI RIEN NE L'A VU : aucune erreur, nulle part — React ne dit rien d'une liste dont la valeur
 * n'est dans aucune option —, et l'article à 20 %, le cas courant, s'affichait juste PAR HASARD :
 * « 20 » est la première option.
 *
 * LA CORRECTION : le taux entre dans l'état de la fenêtre écrit COMME LA LISTE L'ÉCRIT (`tauxEnListe`,
 * « 10.00 » → « 10 »), et un taux enregistré HORS de la liste y reste proposé (`tauxProposes`) — même
 * idée que la forme juridique de l'organisme (Reglages.jsx) : sans son option, il s'afficherait
 * « 20 % » à son tour.
 *
 * Tout ce qui s'exécute ici est le VRAI code de l'écran, découpé dans son fichier (`bloc`). Chaque
 * test a été vu ROUGE en réintroduisant le défaut qu'il gèle.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const PAGE = 'pages/Inventaire.jsx';
const lireUi = (f) => fs.readFileSync(path.join(UI, f), 'utf8');
/** Le code seul : les commentaires RACONTENT l'ancien `String(editing.tax_rate)`, ils ne doivent pas compter. */
const sansCommentaires = (f) => lireUi(f).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

/** Évalue un bloc d'un fichier de l'écran (entre deux repères) : le vrai code, pas une copie. Ce dont
 *  il dépend lui est passé par `avec` — les bibliothèques de l'écran, ou un témoin à la place d'un
 *  `setEditing`. */
function bloc(fichier, debut, fin, noms, avec = {}) {
    const src = lireUi(fichier);
    const i = src.indexOf(debut);
    const j = src.indexOf(fin, i);
    assert.ok(i >= 0 && j > i, `${fichier} : bloc introuvable (${debut} … ${fin})`);
    return new Function(...Object.keys(avec), `${src.slice(i, j)}\nreturn { ${noms.join(', ')} };`)(...Object.values(avec));
}

/** Ce que l'écran a sous la main : la liste et ses règles, le calcul du TTC, et l'OUVERTURE de la
 *  fenêtre — `openEdit` tel qu'il est écrit, dont on recueille ce qu'il donne à `setEditing`. */
async function ecran() {
    const { lireMontant, montantEnSaisie } = await import(pathToFileURL(path.join(UI, 'lib', 'montantSaisi.js')).href);
    const liste = bloc(PAGE, 'const TVA_RATES', 'const CAT_ICON',
        ['TVA_RATES', 'TVA_DEFAUT', 'tauxEnListe', 'tauxProposes', 'EMPTY'], { lireMontant });
    const { ttc } = bloc(PAGE, 'const ttc', 'function stockState', ['ttc'], { lireMontant });
    const ouvrir = (article) => {
        let etat = null;
        const { openEdit } = bloc(PAGE, 'function openEdit(item)', 'const setEdit', ['openEdit'],
            { setStatus: () => {}, setEditing: (e) => { etat = e; }, montantEnSaisie, tauxEnListe: liste.tauxEnListe });
        openEdit(article);
        return etat;
    };
    return { ...liste, ttc, ouvrir };
}

/** LA RÈGLE DU NAVIGATEUR, celle qui faisait mentir l'écran : une liste dont la valeur ne désigne
 *  aucune option affiche la PREMIÈRE. */
const affichee = (valeur, options) => (options.includes(valeur) ? valeur : options[0]);

/** Un article comme `GET /api/inventaire` le rend : ses décimaux en chaînes, à deux décimales. */
const article = (tax_rate) => ({
    id: 'art-1', name: 'Pelle à enfourner', category: 'Pelle à enfourner', sku: 'PE-33', quantity: 12, threshold: 2,
    unit_price: '100.00', tax_rate, learner_discount_pct: null, learner_discount_eur: null, image_url: null,
});

test('UN ARTICLE S\'OUVRE SUR SON TAUX — 10 %, 5,5 %, 2,1 %, exonéré : plus « 20 % » à leur place', async () => {
    const { TVA_RATES, tauxEnListe, tauxProposes, ttc, ouvrir } = await ecran();
    // Les deux cas relevés, tels que la base les rend.
    assert.strictEqual(affichee(ouvrir(article('10.00')).tax_rate, TVA_RATES), '10', 'un article à 10 % s\'ouvrait sur « 20 % »');
    assert.strictEqual(affichee(ouvrir(article('5.50')).tax_rate, TVA_RATES), '5.5', 'un article à 5,5 % aussi');

    /* Et TOUTE la liste : un article par taux proposé, rendu comme la base le rend, et ce que la liste
       AFFICHE à l'ouverture — avant, « 20 » à chaque fois. Un taux qu'on ajouterait à la liste y passe
       aussi : proposé sous l'écriture « 8.50 », il ne serait jamais retrouvé (il s'ouvre écrit « 8.5 »). */
    const deLaBase = (taux) => Number(taux).toFixed(2);
    assert.deepStrictEqual(TVA_RATES.map((taux) => affichee(ouvrir(article(deLaBase(taux))).tax_rate, TVA_RATES)), TVA_RATES,
        'chaque article s\'ouvre sur SON taux : « 10.00 » ne désignait aucune option, et la liste affichait la première');

    for (const taux of TVA_RATES) {
        const etat = ouvrir(article(deLaBase(taux)));
        assert.deepStrictEqual(tauxProposes(etat.tax_rate), TVA_RATES,
            `la liste ne gagne pas une option « ${deLaBase(taux)} % » à côté de « ${taux} % »`);
        // La liste et le TTC de la même fenêtre disent enfin la même chose : 100 € HT, à ce taux.
        assert.strictEqual(ttc(etat.unit_price, etat.tax_rate).toFixed(2), (100 + Number(taux)).toFixed(2));
    }
    // Un NOMBRE — ce que rendrait mysql2 avec `decimalNumbers` — s'y retrouve aussi.
    assert.strictEqual(tauxEnListe(5.5), '5.5');
    assert.strictEqual(tauxEnListe(10), '10');

    const src = sansCommentaires(PAGE);
    assert.match(src, /tax_rate: tauxEnListe\(item\.tax_rate\)/, 'le taux se ramène à l\'écriture de la liste DÈS l\'ouverture');
    assert.doesNotMatch(src, /String\(editing\.tax_rate\)/, '« 10.00 » donné tel quel à la liste : le défaut');
    assert.match(src, /<ChoixTva key=\{editing\.id\} value=\{editing\.tax_rate\} onChange=\{setEdit\("tax_rate"\)\} \/>/,
        'la liste montre l\'état de la fenêtre, tel quel');
});

test('UN TAUX HORS DE LA LISTE y reste proposé, même après en avoir choisi un autre', async () => {
    const { TVA_RATES, tauxProposes, ouvrir } = await ecran();
    // 8,5 % : un taux que l'écran ne propose pas, mais que l'API accepte (tout taux de 0 à 100).
    const etat = ouvrir(article('8.50'));
    assert.strictEqual(etat.tax_rate, '8.5', 'écrit comme la liste écrit les siens : « 5.5 », pas « 5.50 »');
    assert.strictEqual(affichee(etat.tax_rate, TVA_RATES), '20', 'sur les seuls taux courants, il s\'afficherait « 20 % » à son tour…');
    assert.deepStrictEqual(tauxProposes(etat.tax_rate), ['8.5', ...TVA_RATES], '… d\'où son option, en tête des taux courants');

    /* On choisit « 20 % » : le taux trouvé à l'ouverture reste dans la liste. Sinon, un clic de trop
       et il n'y a plus moyen d'y revenir sans annuler. */
    assert.deepStrictEqual(tauxProposes('8.5', '20'), ['8.5', ...TVA_RATES]);
    assert.deepStrictEqual(tauxProposes('8.5', '8.5'), ['8.5', ...TVA_RATES], 'une seule fois, pas deux');
    // Un taux de la liste n'y ajoute rien, et n'en change pas l'ordre.
    assert.deepStrictEqual(tauxProposes('10', '5.5'), TVA_RATES);

    const src = sansCommentaires(PAGE);
    assert.match(src, /const \[ouverture\] = useState\(value\);/, 'le taux de l\'ouverture est gardé tant que la liste est à l\'écran');
    assert.match(src, /\{tauxProposes\(ouverture, value\)\.map\(\(r\) => <option key=\{r\} value=\{r\}>/);
    assert.doesNotMatch(src, /TVA_RATES\.map\(/, 'plus aucune liste écrite à part, sans le taux enregistré');
});

test('LA CRÉATION s\'ouvre sur un taux de la liste, et passe par la même liste', async () => {
    const { TVA_RATES, TVA_DEFAUT, EMPTY, tauxEnListe } = await ecran();
    /* Le formulaire vide affiche ce qu'il enverra. `includes`, et non `affichee` : écrit « 20.00 », son
       taux s'afficherait « 20 % » quand même — le hasard qui a caché le défaut de la modification. */
    assert.strictEqual(TVA_DEFAUT, '20', 'le taux de la colonne (DEFAULT 20.00), et du serveur à la création');
    assert.strictEqual(EMPTY.tax_rate, TVA_DEFAUT);
    assert.ok(TVA_RATES.includes(TVA_DEFAUT), `« ${TVA_DEFAUT} » doit être une option de la liste`);
    /* Illisible ou absent : le taux par défaut — jamais « NaN % », ni « 0 % » pour un vide
       (`Number("")` vaut 0 : un article sans taux se serait ouvert EXONÉRÉ). */
    for (const v of [null, undefined, '', 'abc']) assert.strictEqual(tauxEnListe(v), TVA_DEFAUT, JSON.stringify(v));

    const src = sansCommentaires(PAGE);
    assert.match(src, /<ChoixTva value=\{form\.tax_rate\} onChange=\{set\("tax_rate"\)\} \/>/);
    assert.strictEqual((src.match(/<ChoixTva /g) || []).length, 2, 'création ET modification');
});
