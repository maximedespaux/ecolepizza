/**
 * L'ICÔNE D'ONGLET (FAVICON) DOIT SE RÉSOUDRE SUR TOUTES LES ROUTES (relevé le 2026-10-19).
 *
 * LE DÉFAUT. index.html déclarait l'icône en chemin RELATIF (`./brand/logo.png`). Sur une route à
 * plusieurs segments (/stagiaires/<uuid>), le navigateur la résolvait sur
 * /stagiaires/<uuid>/brand/logo.png — que le repli SPA de nginx renvoie en HTML, donc une icône
 * invalide. Safari retombait alors sur /favicon.ico (lui AUSSI renvoyé en HTML, faute de fichier) et
 * gardait son favicon EN CACHE, celui d'avant le déploiement : l'ancienne icône OVH. Firefox, plus
 * tolérant, affichait la bonne. C'est EXACTEMENT le défaut déjà corrigé pour les assets JS/CSS
 * (cf. le commentaire de vite.config.js : `base: '/'`), que le favicon n'avait pas suivi.
 *
 * LA CORRECTION. Chemins ABSOLUS, et surtout un VRAI fichier /favicon.ico (le monogramme JD) servi par
 * nginx (try_files trouve le fichier, plus de repli HTML). Ce test gèle les deux : chemins absolus +
 * présence des fichiers. S'il repasse au vert avec `./…`, c'est que le défaut revient.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..', '..', 'app');
const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');

test('les liens d\'icône sont ABSOLUS (jamais relatifs ./…)', () => {
    const liens = html.match(/<link[^>]*rel="(?:icon|apple-touch-icon)"[^>]*>/g) || [];
    assert.ok(liens.length >= 2, 'au moins une icône et une apple-touch-icon');
    for (const l of liens) {
        const href = (l.match(/href="([^"]*)"/) || [])[1] || '';
        assert.ok(href.startsWith('/'), `href d'icône doit être absolu, pas « ${href} »`);
        assert.ok(!href.startsWith('./'), `href d'icône relatif interdit (casse sur /a/b) : « ${href} »`);
    }
});

test('un VRAI /favicon.ico est déclaré ET présent (ce que Safari réclame par défaut)', () => {
    assert.match(html, /<link[^>]*rel="icon"[^>]*href="\/favicon\.ico"/, '/favicon.ico déclaré en absolu');
    // Les fichiers vivent dans public/ → Vite les copie à la racine servie (comme brand/logo.png).
    for (const f of ['favicon.ico', 'favicon-32.png', 'favicon-16.png', 'apple-touch-icon.png']) {
        assert.ok(fs.existsSync(path.join(APP, 'public', f)), `public/${f} doit exister`);
    }
    // favicon.ico est un VRAI .ico (signature 00 00 01 00), pas un PNG renommé ni du HTML.
    const ico = fs.readFileSync(path.join(APP, 'public', 'favicon.ico'));
    assert.deepStrictEqual([...ico.slice(0, 4)], [0, 0, 1, 0], 'en-tête ICO attendu');
});
