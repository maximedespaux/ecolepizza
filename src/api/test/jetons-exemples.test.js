/**
 * LES EXEMPLES DE LA PALETTE DOIVENT ÊTRE VRAIS (revue du 2026-09-23, demandée par l'école).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * CE QU'UN EXEMPLE FAIT VRAIMENT. Il est lu au survol, dans la palette, par quelqu'un qui compose
 * un document et se demande « qu'est-ce que ça va imprimer ». C'est donc une PROMESSE : s'il
 * montre une forme que le code ne produit jamais, il fait construire un document autour d'une
 * mise en page qui n'arrivera pas — et l'écart ne se voit qu'à l'impression, trop tard.
 *
 * LES ÉCARTS TROUVÉS À LA REVUE, tous gelés ici :
 *   · {TVA} annonçait « 0 € », que `euro(0)` ne produit JAMAIS (il rend une chaîne vide) ;
 *   · {Ville} et {Lieu naissance} s'affichaient en minuscules, alors que la base les stocke en
 *     capitales depuis les migrations 162 et 171 ;
 *   · les montants de FACTURE étaient écrits en virgule (« 17,82 € ») quand le code les écrit
 *     avec un point (`toFixed(2)`) ;
 *   · {Date} et {Today}, qui rendent la MÊME valeur, montraient deux dates différentes ;
 *   · {Lundi}…{Vendredi} promettaient un jour de la semaine ; ils donnent le 1er, 2e… jour OUVRÉ
 *     depuis le début de la session ;
 *   · le personnage d'exemple s'appelait « Dupont », « DUPONT » ou « Camille BERGER » selon les
 *     groupes, et {Organisme court} portait le nom du LOGICIEL (« Impastio »).
 */
const test = require('node:test');
const assert = require('node:assert');
const { TOKEN_CATALOG, euro, businessDay, frDate } = require('../lib/tokens.js');

const tous = TOKEN_CATALOG.flatMap((g) => g.tokens.map((t) => ({ ...t, groupe: g.group })));
const par = (cle) => tous.find((t) => t.key === cle);

test('chaque jeton du catalogue porte un exemple', () => {
    /* Un jeton sans exemple oblige à l'essayer pour savoir ce qu'il fait : on compose alors un
       document, on l'imprime, et on recommence. */
    const sans = tous.filter((t) => !t.sample || !String(t.sample).trim()).map((t) => t.key);
    assert.deepStrictEqual(sans, []);
});

test('aucun exemple ne montre un montant que le code n\'imprime jamais', () => {
    /* `euro(0)` REND UNE CHAÎNE VIDE, exprès : un « 0 € » sur une convention exonérée se lit
       comme une erreur de saisie. Un exemple qui l'annonce ferait prévoir une ligne qui
       n'apparaîtra pas — et le document garderait un blanc à sa place. */
    assert.strictEqual(euro(0), '');
    const zeros = tous.filter((t) => /^0(,00|\.00)? €$/.test(String(t.sample).trim())).map((t) => t.key);
    assert.deepStrictEqual(zeros, [], 'aucun exemple ne vaut « 0 € »');
    assert.strictEqual(par('TVA').sample, '300 €');
    assert.ok(par('TVA').desc, 'et le jeton dit qu’il sort vide quand la formation est exonérée');
});

test('les exemples de ville sont en CAPITALES, comme la base', () => {
    /* Migrations 162 (villes) et 171 (lieux de naissance) : les minuscules n'existent plus en
       base. Un exemple en minuscules montrait une casse que le document n'imprime jamais. */
    assert.strictEqual(par('Ville').sample, 'BORDEAUX');
    assert.strictEqual(par('Lieu naissance').sample, 'TOULOUSE');
    for (const cle of ['Adresse', 'Adresse acheteur']) {
        assert.match(par(cle).sample, /BORDEAUX$/, `${cle} : la ville y est aussi en capitales`);
    }
});

test('les montants de FACTURE ont la forme que le code produit', () => {
    /* `toFixed(2)` — ici comme dans invoice.controller — écrit « 17.82 € », avec un POINT. Les
       exemples disaient « 17,82 € ». La virgule serait plus juste en français : c'est une
       correction à part, qui touche le rendu de toutes les factures, y compris à la
       réimpression d'une facture déjà émise. Tant qu'elle n'est pas faite, la palette dit vrai. */
    const facture = TOKEN_CATALOG.find((g) => g.group === 'Facture').tokens;
    const montants = facture.filter((t) => /€/.test(t.sample));
    assert.ok(montants.length >= 4);
    for (const t of montants) {
        assert.ok(!/\d,\d{2} €/.test(t.sample), `${t.key} : pas de virgule, le code n’en met pas`);
        assert.match(t.sample, /\d\.\d{2} €/, `${t.key} : deux décimales après un point`);
    }
});

test('deux jetons qui rendent la même valeur montrent le même exemple', () => {
    /* {Date} et {Today} sont la même chose (`Date: today, Today: today`). Deux exemples
       différents laissaient croire à deux dates : celle du document et celle du jour. */
    assert.strictEqual(par('Date').sample, par('Today').sample);
});

test('les cinq jours de session ne promettent plus un jour de la semaine', () => {
    /* `businessDay(début, n)` donne le n-ième jour OUVRÉ à partir du début — pas le mardi.
       Une session qui commence un mercredi remplit donc {Mardi} avec le jeudi. Les noms des
       clés viennent des premiers modèles et ne se renomment plus ; les LIBELLÉS, eux, peuvent
       cesser de mentir. */
    assert.strictEqual(businessDay('2026-09-16', 1), frDate('2026-09-17'), 'mercredi + 1 ouvré = jeudi');
    assert.strictEqual(businessDay('2026-09-18', 1), frDate('2026-09-21'), 'vendredi + 1 ouvré = lundi');
    for (const [cle, rang] of [['Lundi', 1], ['Mardi', 2], ['Mercredi', 3], ['Jeudi', 4], ['Vendredi', 5]]) {
        const t = par(cle);
        assert.strictEqual(t.label, `Jour ${rang} de la session`);
        assert.ok(t.desc && /ouvré/.test(t.desc), `${cle} : l’explication dit « jour ouvré »`);
    }
});

test('une seule identité d\'exemple, et l\'organisme s\'appelle par son nom', () => {
    /* Trois orthographes du même personnage laissaient croire à trois mises en forme. Et
       « Impastio » est le nom du LOGICIEL : le porter en exemple du nom court de l'organisme
       faisait attendre un document signé « Impastio ». */
    for (const cle of ['Personne', 'Nom signataire', 'Acheteur']) {
        assert.match(par(cle).sample, /DUPONT/, `${cle} : le nom de famille s’écrit comme l’école le saisit`);
    }
    assert.strictEqual(par('Nom').sample, 'DUPONT');
    const noms = tous.filter((t) => /Dupont/.test(String(t.sample))).map((t) => t.key);
    assert.deepStrictEqual(noms, [], 'plus aucun « Dupont » en minuscules');
    assert.ok(!/Impastio/.test(par('Organisme court').sample));
    assert.strictEqual(par('Organisme').sample, par('Centre examen').sample,
        'le même organisme porte le même nom d’un exemple à l’autre');
});
