/**
 * Remise réservée aux stagiaires, article par article (migration 125).
 *
 * LE BESOIN. L'école veut faire un geste sur certains articles pour ceux qui suivent la
 * formation — « tu es stagiaire, cette pelle est à −15 % pour toi ». Un seul prix existait
 * (`inventory_item.unit_price`) : la seule façon de faire ce geste était de baisser le prix POUR
 * TOUT LE MONDE, client de passage compris, ou de remiser à la main à chaque commande — donc de
 * l'oublier une fois sur deux.
 *
 * VISIBLE UNIQUEMENT DANS LA BOUTIQUE STAGIAIRE. La caisse garde le prix catalogue : elle sert
 * aussi bien un stagiaire qu'un tiers, et l'opérateur y remise au cas par cas (migration 122).
 * L'appliquer partout reviendrait à baisser le prix tout court, ce que `unit_price` fait déjà.
 *
 * LE TAUX EST FIGÉ À LA COMMANDE, pas relu à la facturation : le stagiaire a vu un prix, c'est
 * celui-là qui l'engage même si l'école change sa remise le lendemain. Même raison que le SKU
 * figé sur la ligne de facture (118).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const APP = path.join(API, '..', 'app');
const MIG = path.join(API, '..', '..', 'database/migrations');
const srcEspace = fs.readFileSync(path.join(API, 'controllers/espace.controller.js'), 'utf8');
const srcInv = fs.readFileSync(path.join(API, 'controllers/inventory.controller.js'), 'utf8');
const srcShop = fs.readFileSync(path.join(API, 'controllers/shopRequest.controller.js'), 'utf8');
const srcBoutique = fs.readFileSync(path.join(APP, 'ui/pages/Boutique.jsx'), 'utf8');
const srcVentes = fs.readFileSync(path.join(APP, 'ui/pages/Ventes.jsx'), 'utf8');

test('la migration 125 pose les quatre colonnes, avec son revert', () => {
    const up = fs.readFileSync(path.join(MIG, '125_inventory_remise_stagiaire.sql'), 'utf8');
    const down = fs.readFileSync(path.join(MIG, '125_revert_inventory_remise_stagiaire.sql'), 'utf8');
    for (const c of ['learner_discount_pct', 'learner_discount_eur', 'discount_pct', 'unit_price_gross_ht']) {
        assert.match(up, new RegExp(`ADD COLUMN IF NOT EXISTS ${c}`), `${c} manquante à l'aller`);
        assert.match(down, new RegExp(`DROP COLUMN IF EXISTS ${c}`), `${c} manquante au retour`);
    }
    assert.doesNotMatch(up, /^\s*--/m, 'commentaires en blocs, jamais en --');
    // Entièrement rejouable : la colonne « euros » a été ajoutée au fichier APRÈS que la 125
    // ait déjà été jouée en production. Sans `IF NOT EXISTS` partout, la rejouer échouerait.
    assert.strictEqual((up.match(/^ALTER TABLE/gm) || []).length,
        (up.match(/ADD COLUMN IF NOT EXISTS/g) || []).length,
        'chaque ALTER doit être rejouable sans risque');
});

/* Le calcul vit dans `lib/remise.js` : sans base ni requête, donc requis tel quel. Il y a été
 * DÉPLACÉ quand l'écran d'inventaire a eu besoin du même résultat — l'extraire du contrôleur par
 * regex, comme ici auparavant, ne tenait plus dès lors que trois appelants le partagent. */
const { prixStagiaire } = require('../lib/remise.js');

test('une remise en EUROS retire un montant fixe', () => {
    // « la pelle, 5 € de moins pour toi » : le geste ne bouge pas si le prix change.
    const r = prixStagiaire({ unit_price: 39.90, learner_discount_eur: 5 });
    assert.strictEqual(r.net, 34.90);
    assert.strictEqual(r.libelle, '−5,00 €');
});

test('une remise en POURCENTAGE suit le prix', () => {
    const r = prixStagiaire({ unit_price: 39.90, learner_discount_pct: 10 });
    assert.strictEqual(r.net, 35.91);
    assert.strictEqual(r.libelle, '−10 %');
});

test('le MONTANT prime si les deux formes sont renseignées', () => {
    // État que l'écran interdit, mais que la base autorise : il faut une règle, pas un hasard.
    const r = prixStagiaire({ unit_price: 39.90, learner_discount_pct: 10, learner_discount_eur: 5 });
    assert.strictEqual(r.net, 34.90, 'le montant doit gagner');
});

test('une remise ne rend jamais un article gratuit… ni créditeur', () => {
    // Une saisie malheureuse (50 € sur un article à 12 €) ne doit pas payer le stagiaire.
    const r = prixStagiaire({ unit_price: 12, learner_discount_eur: 50 });
    assert.strictEqual(r.net, 0);
    assert.strictEqual(r.taux, 100);
    // Et le libellé dit la réduction RÉELLE : « −50,00 € » à côté d'un prix à zéro serait un
    // mensonge que le prix affiché dément aussitôt.
    assert.strictEqual(r.libelle, '−12,00 €');
});

test('un taux aberrant est borné à 100 %', () => {
    assert.strictEqual(prixStagiaire({ unit_price: 12, learner_discount_pct: 300 }).net, 0);
});

test('sans remise, le prix ne bouge pas et rien ne s\'affiche', () => {
    const r = prixStagiaire({ unit_price: 39.90 });
    assert.strictEqual(r.net, 39.90);
    assert.strictEqual(r.taux, 0);
    assert.strictEqual(r.libelle, null, 'aucun badge à montrer');
});

test('le calcul vit à UN SEUL endroit, partagé par ses trois appelants', () => {
    /* Trois copies — catalogue stagiaire, prix de commande, écran d'inventaire — finiraient par
     * diverger d'un centime, et le stagiaire paierait autre chose que le prix affiché. */
    const srcLib = fs.readFileSync(path.join(API, 'lib/remise.js'), 'utf8');
    assert.strictEqual((srcLib.match(/function prixStagiaire\(/g) || []).length, 1,
        'une seule définition, dans la bibliothèque');
    assert.doesNotMatch(srcEspace, /function prixStagiaire\(/, 'plus de copie dans le contrôleur');
    for (const [nom, src] of [
        ['espace.controller', srcEspace],
        ['inventory.controller', srcInv],
    ]) {
        assert.match(src, /require\('\.\.\/lib\/remise\.js'\)/, `${nom} doit requérir la bibliothèque`);
    }
});

test('l\'inventaire montre à l\'école l\'effet de la remise qu\'elle règle', () => {
    // Sans ça, il fallait ouvrir l'espace stagiaire pour savoir ce que l'article y coûte.
    assert.match(srcInv, /r\.prix_stagiaire_ht = px\.net/, 'le prix remisé doit être renvoyé');
    assert.match(srcInv, /r\.remise_libelle = px\.libelle/, 'et le libellé de la remise');
    const srcInvPage = fs.readFileSync(path.join(APP, 'ui/pages/Inventaire.jsx'), 'utf8');
    assert.match(srcInvPage, /textDecoration: "line-through"/, 'prix d\'origine barré');
    assert.match(srcInvPage, /\{it\.remise_libelle\}/, 'taux ou montant consenti');
    assert.match(srcInvPage, /euro\(ttc\(it\.prix_stagiaire_ht, it\.tax_rate\)\)/, 'prix final');
});

test('le prix remisé est calculé PAR LE SERVEUR, jamais repris du panier', () => {
    // Un panier trafiqué imposerait sinon son propre prix. Le taux et le prix viennent tous deux
    // de la fiche article relue en base au moment de la commande.
    assert.match(srcEspace, /const \{ brut, net, taux: tauxStag \} = prixStagiaire\(it\)/,
        'le prix doit être calculé depuis l\'article relu en base');
    assert.match(srcEspace, /price: net, brut, remise: tauxStag/,
        'c\'est le prix NET qui engage la commande');
    assert.doesNotMatch(srcEspace, /price: Number\(l\.price\)/,
        'jamais le prix envoyé par le panier');
});

test('le taux et le prix catalogue sont FIGÉS sur la ligne de commande', () => {
    assert.match(srcEspace, /lc\.push\('discount_pct', 'unit_price_gross_ht'\)/,
        'sans quoi une remise modifiée plus tard changerait le prix d\'une commande passée');
    assert.match(srcEspace, /await colLigneDemande\(conn, 'discount_pct'\)/,
        'colonne optionnelle : sondée avant écriture');
});

test('la remise remonte jusqu\'à la ligne de FACTURE', () => {
    // Sinon le document afficherait un prix nu, inexpliqué : le client ne verrait pas le geste.
    assert.match(srcShop, /if \(l\.discount_pct != null && await colonneLigneFacture\(conn, 'discount_pct'\)\)/,
        'la remise doit être reportée sur invoice_line');
    assert.match(srcShop, /colonneLigneFacture\(conn, colonne\) \{ return colonneDe\(conn, 'invoice_line'/,
        'sondée sur invoice_line — une sonde sur `invoice` aurait toujours répondu non');
});

test('la boutique stagiaire MONTRE la remise, prix barré et badge', () => {
    // Une remise invisible ne fait plaisir à personne.
    assert.match(srcEspace, /remise_label: libelle/,
        'le serveur doit renvoyer le libellé SAISI (« −5,00 € » ou « −10 % »)');
    assert.match(srcEspace, /price_ttc_avant/, 'et le prix catalogue, pour le barrer');
    assert.match(srcBoutique, /textDecoration: "line-through"/, 'le prix d\'avant doit être barré');
    assert.match(srcBoutique, /\{p\.remise_label\}/,
        'et le badge porter le libellé, pas le taux effectif — « −12,53 % » là où l\'école a promis 5 € serait incompréhensible');
});

test('la CAISSE ignore la remise stagiaire', () => {
    /* C'est la limite qui donne son sens au réglage : la caisse sert aussi des clients de
     * passage. L'appliquer là reviendrait à baisser le prix tout court. */
    assert.doesNotMatch(srcVentes, /learner_discount_pct/,
        'la caisse ne doit pas connaître la remise stagiaire');
});

test('l\'inventaire permet de RETIRER une remise, pas seulement d\'en poser une', () => {
    /* Le filtre d'origine sautait tout champ vide : on pouvait poser une remise mais jamais
     * l'effacer — vider le champ ne faisait rien, et le taux restait. */
    assert.match(srcInv, /if \(f !== 'learner_discount_pct' && f !== 'learner_discount_eur'\) continue;/,
        'une chaîne vide doit effacer la remise, dans les DEUX unités');
    assert.match(srcInv, /learner_discount_pct: \[0, 100\], learner_discount_eur: \[0, 1e8\]/,
        'les deux formes doivent être bornées');
});

test('l\'article reste modifiable si la 125 n\'est pas jouée', () => {
    // Écrire une colonne absente ferait échouer TOUTE la mise à jour de l'article.
    assert.match(srcInv, /colRemise\(db\.promise\(\), 'learner_discount_eur'\)/,
        'la colonne doit être sondée');
    /* LE RETRAIT SE FAIT PAR `filter`, PLUS PAR `splice` SUR UN INDICE.
     *
     * L'ancienne forme tenait deux tableaux parallèles (`updates` / `values`) et retirait
     * `values[k]` en se servant de l'indice du FRAGMENT. Or un fragment `= NULL` n'a pas de valeur
     * associée et décale les deux tableaux. Sur
     *     ['learner_discount_pct = NULL', 'learner_discount_eur = ?', 'name = ?'] + [10, 'Nom']
     * le nettoyage retirait « Nom » au lieu de « 10 » : l'article était RENOMMÉ « 10 », par une
     * requête SQL parfaitement valide. Aucune erreur, aucune alerte.
     *
     * En appariant chaque fragment à sa valeur, il n'y a plus d'indice à tenir juste — c'est la
     * raison d'être de la nouvelle forme, et c'est elle que ce test gèle. */
    assert.match(srcInv, /champs\.filter\(\(c\) => !c\.remise\)/,
        'la remise doit se retirer par filtrage du couple fragment+valeur');
    assert.match(srcInv, /const values = retenus\.filter\(\(c\) => 'valeur' in c\)\.map\(\(c\) => c\.valeur\)/,
        'les valeurs doivent se DÉDUIRE des fragments retenus, jamais être indexées en parallèle');
    assert.doesNotMatch(srcInv, /values\.splice\(k, 1\)/,
        'plus aucune arithmétique d\'indices entre les deux tableaux');
});
