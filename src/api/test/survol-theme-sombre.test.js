/**
 * UN SURVOL QUI DISPARAISSAIT EN THÈME SOMBRE (2026-09-21).
 *
 * LE DÉFAUT. Deux survols passaient le texte en `--navy` (#2c3371). Or `--navy` n'est défini que
 * dans `:root` : le thème sombre ne le redéfinit pas, et un chiffre bleu marine sur un fond bleu
 * nuit ne se lit plus. Les compteurs du tableau de bord (« 2 stagiaires · 6 dossiers actifs · … »,
 * des liens) et la bande des étapes repliées du pipeline disparaissaient sous le pointeur.
 *
 * LE CORRECTIF. `--blue`, qui vaut exactement la même couleur en clair et s'éclaircit en sombre
 * (#8ea2e0). En thème clair, rien ne change à l'écran.
 *
 * La règle vaut pour tout survol à venir : un texte survolé ne passe pas en `--navy`. Les BORDURES
 * en `--navy` ne sont pas visées — le survol y change aussi le fond, qui suffit à se voir.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const CSS = fs.readFileSync(path.join(__dirname, '..', '..', 'app/ui/styles/app.css'), 'utf8');
const bloc = (entete) => {
    const i = CSS.indexOf(`${entete}{\n`);
    assert.ok(i >= 0, `bloc ${entete} introuvable`);
    return CSS.slice(i, CSS.indexOf('\n}', i));
};

test('--blue remplace --navy sans rien changer en clair, et existe en sombre', () => {
    assert.match(bloc(':root'), /--navy:#2c3371;/);
    assert.match(bloc('[data-theme="light"]'), /--blue:#2c3371;/, 'en clair, les deux jetons sont la même couleur');
    const sombre = bloc('[data-theme="dark"]');
    assert.match(sombre, /--blue:#[0-9a-f]{6}/, 'le thème sombre éclaircit --blue');
    assert.doesNotMatch(sombre, /--navy:/, 'et ne redéfinit pas --navy : c\'est tout le défaut');
});

test('aucun survol ne met du TEXTE en --navy', () => {
    const fautifs = [];
    for (const [, selecteur, decls] of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!/:hover/.test(selecteur)) continue;
        // `color:` seul — pas `border-color:` ni `background-color:`.
        if (/(^|[;\s])color:var\(--navy\)/.test(decls)) fautifs.push(selecteur.trim().split('\n').pop());
    }
    assert.deepStrictEqual(fautifs, [], `texte survolé en --navy, illisible en thème sombre : ${fautifs.join(' | ')}`);
    // Et les deux qui l'étaient passent bien en --blue.
    assert.match(CSS, /\.compteurs a:hover\{color:var\(--blue\)\}\n\.compteurs a:hover b\{color:var\(--blue\)\}/);
    assert.match(CSS, /\.pipe-plie:hover\{[^}]*color:var\(--blue\)\}\n[^\n]*\n\.pipe-plie:hover b\{color:var\(--blue\)\}/);
});
