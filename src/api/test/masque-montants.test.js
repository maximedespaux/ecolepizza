/**
 * LE MASQUE DES MONTANTS (app/ui/lib/moneyPrivacy.js) — confidentiel PAR DÉFAUT.
 *
 * LE DÉFAUT CORRIGÉ. `isMoneyMasked()` rendait `localStorage.getItem(KEY) === "1"` : sans clic
 * préalable, les montants s'affichaient. Deux conséquences, la seconde étant la plus gênante.
 * D'abord un écran de caisse ou de comptabilité ouvert devant un stagiaire montrait les chiffres
 * de l'école — le cas même que la confidentialité existe pour couvrir. Ensuite la capacité
 * « Révéler les montants » (cap:reveal-money) ne conditionnait presque rien : elle donne le droit
 * de lever un masque qui n'était pas mis. Un droit qui ne garde rien n'est pas un droit.
 *
 * ET POURQUOI CHANGER LE DÉFAUT NE SUFFISAIT PAS. Le choix vivait en `localStorage`, donc
 * définitif : masqué par défaut une fois, puis visible POUR TOUJOURS dès le premier clic sur
 * « Afficher ». La confidentialité se serait éteinte d'elle-même au premier usage. Le reste du
 * dispositif disait déjà que révéler est un acte délibéré et temporaire — une confirmation le
 * demande, et son « ne plus demander » est borné à la session. Le masque suit la même règle :
 * la révélation vit en `sessionStorage`, et chaque session repart confidentielle.
 *
 * Ces tests lisent le SOURCE : le module importe React, qu'on ne charge pas depuis les tests
 * d'API. Le cycle complet a été vérifié à l'écran sur /ventes — arrivée masquée (« ••••• »),
 * révélation, puis masque de retour à la session suivante.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (p) => fs.readFileSync(path.join(UI, p), 'utf8');
const SRC = () => lire('lib/moneyPrivacy.js');

test('les montants sont masqués par défaut', () => {
    const corps = SRC().slice(SRC().indexOf('export function isMoneyMasked'));
    assert.match(corps.slice(0, 260), /!== "0"/,
        'Masqué SAUF révélation explicite. `=== "1"` rendait visible par défaut, ce qui vidait de '
        + 'son sens la capacité « Révéler les montants ».');
    assert.match(corps.slice(0, 260), /catch \{ return true; \}/,
        "Et si le stockage est inaccessible (navigation privée), on masque : le repli d'une "
        + 'confidentialité se fait du côté sûr.');
});

test('la révélation ne vaut que pour la session', () => {
    const src = SRC();
    const corps = src.slice(src.indexOf('export function isMoneyMasked'), src.indexOf('export function clearMoneyReveal'));
    assert.match(corps, /sessionStorage/,
        "LE DÉFAUT ÉVITÉ : en `localStorage`, un seul clic sur « Afficher » rendait les montants "
        + 'visibles pour toujours et le « masqué par défaut » ne servait plus jamais.');
    assert.doesNotMatch(corps, /localStorage\.getItem/,
        "L'ancien stockage ne doit plus être LU : sinon un réglage « visible » d'avant le "
        + 'changement traverserait et désamorcerait le nouveau défaut dès le premier chargement.');
});

test('masquer, c\'est revenir au défaut — une seule façon d\'être masqué', () => {
    const src = SRC();
    const corps = src.slice(src.indexOf('function write('), src.indexOf('function write(') + 500);
    assert.match(corps, /if \(masked\) sessionStorage\.removeItem\(KEY\); else sessionStorage\.setItem\(KEY, "0"\)/,
        'On efface au lieu d\'écrire « 1 » : deux représentations du même état finissent toujours '
        + 'par diverger.');
    assert.match(corps, /localStorage\.removeItem\(KEY\)/,
        "Le vestige de l'ancien stockage est nettoyé au premier changement d'état — pas à la "
        + 'lecture : un getter qui écrit est un piège pour la prochaine personne.');
});

test('la déconnexion oublie la révélation', () => {
    assert.match(SRC(), /export function clearMoneyReveal/);
    const ctx = lire('context/UserContext.jsx');
    assert.match(ctx, /clearMoneyReveal\(\)/,
        'Sans cet appel, la session suivante sur le MÊME onglet repartirait révélée — y compris '
        + 'après un changement de compte.');
    assert.match(ctx, /clearRevealConfirmSkip\(\)/, 'et le « ne plus demander » part avec.');
});

test('le masque couvre les pages où il y a de l\'argent', () => {
    const lay = lire('layouts/AppLayout.jsx');
    /* `/dashboard` a longtemps manqué à cette liste, et il affiche le chiffre d'affaires — le
       même que `/ventes`, qui le masque. C'est la page d'arrivée après connexion, donc celle qui
       reste ouverte quand quelqu'un passe derrière l'écran : exactement le cas que le masque
       existe pour couvrir. La classe `.tnum` était même déjà posée sur le montant ; seule
       l'entrée dans cette liste manquait, et rien ne le signalait. */
    for (const p of ['/ventes', '/inventaire', '/factures', '/comptabilite', '/partenaires', '/dashboard']) {
        assert.ok(lay.includes(`"${p}"`), `la page ${p} doit rester couverte par le masque`);
    }
    /* Et le masque tient TOUJOURS pour qui n'a pas la capacité : son état personnel ne doit pas
       pouvoir le lever. C'est la seule ligne qui rend `cap:reveal-money` contraignante. */
    assert.match(lay, /!canRevealMoney\(user\) \|\| moneyMasked/,
        'Sans droit de révélation, masqué quoi qu\'il arrive.');
});

/**
 * LE BOUTON ET LE MASQUE DOIVENT COUVRIR LES MÊMES PAGES.
 *
 * Les deux moitiés du dispositif vivent à des endroits différents — la liste dans `AppLayout`,
 * le bouton dans chaque page — et rien ne les tenait d'accord. Les deux façons de diverger sont
 * aussi silencieuses l'une que l'autre : une page dans la liste sans bouton masque des montants
 * que personne ne peut plus révéler ; une page avec bouton hors de la liste offre un « Afficher »
 * qui ne cache rien. Le tableau de bord était le second cas, en pire : ni l'un ni l'autre.
 *
 * CE QUE CE TEST NE VOIT PAS : une page qui affiche de l'argent sans bouton NI entrée dans la
 * liste reste invisible ici — c'est exactement ce qui est arrivé au tableau de bord, et aucun
 * test ne pouvait le rattraper, faute de savoir dire ce qu'est « de l'argent de l'école ». La
 * boutique du stagiaire affiche des prix et ne doit surtout pas être masquée. Ce test garde la
 * cohérence du dispositif, pas l'exhaustivité du jugement.
 */
test('chaque page couverte par le masque porte le bouton, et réciproquement', () => {
    const lay = lire('layouts/AppLayout.jsx');
    const liste = lay.match(/const FINANCE = \[([^\]]*)\]/);
    assert.ok(liste, 'La liste FINANCE doit rester lisible dans AppLayout.jsx.');
    const chemins = [...liste[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);

    const pages = fs.readdirSync(path.join(UI, 'pages'))
        .filter((f) => f.endsWith('.jsx') && lire(`pages/${f}`).includes('MoneyToggle'));

    assert.strictEqual(pages.length, chemins.length,
        `${pages.length} page(s) portent le bouton pour ${chemins.length} chemin(s) masqué(s) : `
        + `${pages.join(', ')} contre ${chemins.join(', ')}.`);
});

/**
 * LE CHIFFRE D'AFFAIRES NE SE REPLIE PAS SUR ZÉRO.
 *
 * La caisse est fermée au formateur (`sale.routes.js` n'ouvre qu'aux rôles du bureau). Son appel
 * partait donc en 403, et le repli d'`allSettled` — `val(v, { total: 0 })` — donnait un tableau
 * de bord annonçant « 0,00 € de ventes ». Un chiffre inventé, présenté comme un vrai, qui dit que
 * l'école n'a rien vendu. Le masque ne rattrape pas ça : il aurait affiché « ••••• », donc promis
 * un montant que le navigateur n'a jamais reçu.
 */
test('le tableau de bord n\'affiche le CA que s\'il l\'a reçu', () => {
    const dash = lire('pages/Dashboard.jsx');
    assert.match(dash, /setCaConnu\(v\.status === "fulfilled"\)/,
        'Le tableau de bord doit retenir si la caisse a répondu.');
    assert.match(dash, /\{caConnu && \(/,
        'Le CA ne doit s\'afficher que si la caisse a répondu — jamais replié sur zéro.');
});
