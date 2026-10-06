/**
 * BARRE DE NAVIGATION DU BAS SUR TÉLÉPHONE — demandé le 2026-10-06 (pass « téléphone »). Sur un
 * petit écran, le menu complet est un tiroir qu'il faut d'abord ouvrir ; une barre fixe en bas met
 * les rubriques fréquentes sous le pouce, plus un bouton « Menu » qui ouvre le tiroir.
 *
 * Tests de source (readFileSync) : le composant doit réutiliser la MÊME source de rubriques et le
 * MÊME filtre d'accès que la barre latérale (jamais une liste en dur qui montrerait une rubrique
 * interdite), être branché dans la coquille, et la CSS doit le cacher au-dessus de 640 px.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ui = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', rel), 'utf8');

test("le composant réutilise NAV + canOpen, et offre un bouton « Menu » qui ouvre le tiroir", () => {
    const bn = ui('components/BottomNav.jsx');
    // Rubriques et accès : la même source que la barre latérale, pas une liste figée.
    assert.match(bn, /import \{ NAV, canOpen \} from "\.\.\/lib\/nav\.js";/);
    assert.match(bn, /canOpen\(user, p\.item\)/, 'chaque entrée est filtrée par l\'accès du rôle');
    assert.match(bn, /\.slice\(0, 4\)/, 'au plus quatre rubriques, la place étant comptée');
    // Les icônes viennent de l'entrée NAV (une seule source), pas réécrites à la main.
    assert.match(bn, /name=\{p\.item\.ic\}/);
    // Le bouton « Menu » délègue l'ouverture du tiroir au parent (même geste que la barre du haut).
    assert.match(bn, /onClick=\{onMenu\}/);
    assert.match(bn, /<NavLink[\s\S]*?className=\{\(\{ isActive \}\) => "botnav-l" \+ \(isActive \? " on" : ""\)\}/, 'état actif via NavLink');
});

test('la coquille branche la barre et lui passe l\'ouverture du tiroir', () => {
    const al = ui('layouts/AppLayout.jsx');
    assert.match(al, /import BottomNav from "\.\.\/components\/BottomNav\.jsx";/);
    assert.match(al, /<BottomNav onMenu=\{\(\) => setOpen\(true\)\} \/>/, 'même ouverture que le bouton « menu » du haut');
});

test('la CSS cache la barre au-dessus de 640 px et l\'ancre en bas en dessous', () => {
    const css = ui('styles/app.css');
    assert.match(css, /\.botnav\{display:none\}/, 'masquée par défaut (desktop/tablette large)');
    assert.match(css, /@media \(max-width:640px\)\{[\s\S]*?\.botnav\{position:fixed;left:0;right:0;bottom:0;z-index:25;display:flex/, 'affichée et ancrée en bas sur téléphone');
    // Sous le voile (35) et la barre latérale (40) pour que l'ouverture du menu la recouvre.
    assert.match(css, /\.botnav\{[^}]*z-index:25/);
    // Le contenu réserve sa hauteur pour ne pas passer sous la barre (encoche comprise).
    assert.match(css, /\.content\{padding-bottom:calc\(66px \+ env\(safe-area-inset-bottom\)\)\}/);
});
