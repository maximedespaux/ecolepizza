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
    for (const p of ['/ventes', '/inventaire', '/factures', '/comptabilite', '/partenaires']) {
        assert.ok(lay.includes(`"${p}"`), `la page ${p} doit rester couverte par le masque`);
    }
    /* Et le masque tient TOUJOURS pour qui n'a pas la capacité : son état personnel ne doit pas
       pouvoir le lever. C'est la seule ligne qui rend `cap:reveal-money` contraignante. */
    assert.match(lay, /!canRevealMoney\(user\) \|\| moneyMasked/,
        'Sans droit de révélation, masqué quoi qu\'il arrive.');
});
