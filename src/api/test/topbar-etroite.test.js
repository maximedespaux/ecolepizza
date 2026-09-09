/**
 * LA BARRE SUPÉRIEURE SUR UN ÉCRAN ÉTROIT — les commandes ne sortent pas de l'écran.
 *
 * LE DÉFAUT, MESURÉ EN PRODUCTION À 375 px. Le fil d'Ariane n'avait ni `min-width:0` ni
 * `white-space` : un élément flex ne descend PAS sous la largeur de son contenu tant que son
 * `min-width` vaut `auto`. Le titre gardait donc sa place, le `.spacer` tombait à zéro, et ce
 * qui restait était pris sur les boutons — qui se laissent comprimer, eux.
 *
 * Relevé avant correction : les enfants totalisaient exactement 299 px pour 299 px disponibles ;
 * « Impastio / Tableau de bord » passait sur TROIS lignes (barre à 87 px) et le sélecteur
 * d'espace, réduit à 55 px, n'affichait plus que « Espace » — « stagiaire » coupé net. Or c'est
 * la SEULE porte vers l'autre espace pour un compte qui a les deux casquettes.
 *
 * Après correction, au même endroit : fil d'Ariane sur UNE ligne (17 px), barre à 59 px, dernier
 * bouton à 361 px pour 375 px de large. Vérifié aussi à 560 px (546/560) et 768 px (740/768).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..', '..', 'app/ui');
const CSS = fs.readFileSync(path.join(APP, 'styles/app.css'), 'utf8');
const TOPBAR = fs.readFileSync(path.join(APP, 'components/Topbar.jsx'), 'utf8');
const SWITCH = fs.readFileSync(path.join(APP, 'components/SpaceSwitcher.jsx'), 'utf8');

/** Le corps de la règle CSS visant ce sélecteur (hors media query). */
function regle(sel) {
    const m = new RegExp(`(^|[\\n}])\\s*${sel.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*\\{([^}]*)\\}`).exec(CSS);
    return m ? m[2].replace(/\/\*[\s\S]*?\*\//g, '') : null;
}

test('le fil d\'Ariane rétrécit et se termine en « … » plutôt que de passer à la ligne', () => {
    const r = regle('\\.crumbs');
    assert.ok(r, 'règle .crumbs introuvable');
    /* `min-width:0` est la clé de voûte : SANS lui, `overflow` et `text-overflow` ne servent à
       rien, l'élément refusant de descendre sous la largeur de son texte. C'est la ligne qu'on
       supprime « parce qu'elle ne fait rien de visible ». */
    assert.match(r, /min-width:\s*0/, 'sans min-width:0, les deux autres règles sont inertes');
    assert.match(r, /white-space:\s*nowrap/);
    assert.match(r, /text-overflow:\s*ellipsis/);
    assert.match(r, /overflow:\s*hidden/);
});

test('les commandes ne se laissent plus comprimer', () => {
    const bloc = /\.topbar > \.icon-btn,\s*\n\.topbar > \.theme-toggle,\s*\n\.topbar > \.btn \{([^}]*)\}/.exec(CSS);
    assert.ok(bloc, 'la règle doit viser les commandes UNE PAR UNE');
    assert.match(bloc[1], /flex-shrink:\s*0/);
    /* Ciblées nommément, et pas `.topbar > *` : `.stu-topbar` partage la classe `.topbar`, et sa
       navigation, elle, DOIT pouvoir se comprimer. Un sélecteur trop large aurait déplacé le
       problème dans l'espace stagiaire au lieu de le résoudre. */
    assert.doesNotMatch(CSS, /\.topbar > \*\s*\{[^}]*flex-shrink:\s*0/,
        'pas de règle attrape-tout sur les enfants de .topbar');
});

test('sous 560 px, seuls les textes qui n\'apprennent rien cèdent la place', () => {
    const petit = /@media \(max-width: 560px\) \{([\s\S]*?)\n\}/.exec(CSS);
    assert.ok(petit, 'bloc @media 560 du correctif introuvable');
    assert.match(petit[1], /\.crumbs-marque \{ display: none/, '« Impastio / » est constant');
    assert.match(petit[1], /\.ss-txt \{ display: none/, 'le libellé du sélecteur, pas le bouton');
    // Le TITRE de la page, lui, reste : c'est la seule information de la barre.
    assert.doesNotMatch(petit[1], /\.crumbs \{ display: none/, 'le fil d\'Ariane entier ne disparaît pas');
});

test('la marque et le libellé sont dans leur propre balise — sinon rien n\'est masquable', () => {
    assert.match(TOPBAR, /<span className="crumbs-marque">Impastio /);
    assert.match(TOPBAR, /<b>\{title\}<\/b>/, 'le titre reste hors de la balise masquable');
    assert.match(SWITCH, /<span className="ss-txt">/);
});

test('le sélecteur garde un nom quand son texte disparaît', () => {
    /* Réduit à son icône, un bouton sans nom accessible s'annonce « bouton » : la seule porte
       vers l'autre espace devient introuvable au lecteur d'écran. `title` ne suffit pas — il
       n'est pas lu de façon fiable, et jamais au toucher. */
    assert.match(SWITCH, /aria-label=\{versStagiaire \? "Passer à mon espace stagiaire" : "Revenir au backoffice"\}/);
});
