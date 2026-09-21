/**
 * LA CARTE DES STAGIAIRES : UN FOND SANS CLÉ, ET DES BULLES QUI RESTENT (2026-09-21).
 *
 * DEUX DÉFAUTS SIGNALÉS ENSEMBLE.
 *
 * 1. « API KEY REQUIRED ». Le fond de carte venait de CARTO (basemaps.cartocdn.com), sans clé. CARTO
 *    en exige une désormais : relevé le jour même, chaque tuile revenait barrée « API KEY REQUIRED ·
 *    carto.com/basemaps/apikey », et la carte entière en était couverte. Le fond passe au Plan IGN de
 *    la Géoplateforme (data.geopf.fr), service public SANS CLÉ, qui couvre la France et l'outre-mer —
 *    vérifié tuile par tuile, du zoom 5 au 19, Réunion et Guyane comprises (le zoom 20 n'existe pas).
 *
 * 2. LES AUTRES BULLES DISPARAISSAIENT. Filtre posé, on cliquait la bulle d'un département pour voir
 *    qui y suit la formation : la carte zoomait sur lui et EFFAÇAIT toutes les autres bulles. Plus
 *    moyen de passer au département voisin sans revenir d'abord à « Tous les départements ». Elles
 *    restent désormais, estompées et cliquables ; et le zoom s'arrête à 9 (il allait jusqu'à 12),
 *    pour que les voisines restent dans le cadre — mesuré au banc : deux bulles voisines visibles
 *    autour des Pyrénées-Atlantiques, et un clic sur l'une passe directement aux Hautes-Pyrénées.
 *
 * Leaflet ne tourne pas sous Node : ces tests lisent la page. Le comportement, lui, a été éprouvé au
 * banc par de vrais clics.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const lireUi = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'app/ui', f), 'utf8');
const CARTE = lireUi('pages/Carte.jsx');
const CSS = lireUi('styles/app.css');

test('le fond de carte ne demande plus de clé : Plan IGN, plus CARTO', () => {
    // Sur le CODE, pas les commentaires — qui racontent justement pourquoi CARTO est parti.
    const code = CARTE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /cartocdn\.com/, 'les tuiles CARTO exigent une clé');
    const fond = CARTE.match(/const FOND_DE_CARTE = ("[^"]*"(?:\s*\+\s*"[^"]*")*);/);
    assert.ok(fond, 'l\'adresse du fond est nommée');
    const url = fond[1].split(/"\s*\+\s*"/).join('').replace(/^"|"$/g, '');
    assert.match(url, /^https:\/\/data\.geopf\.fr\/wmts\?/);
    assert.match(url, /LAYER=GEOGRAPHICALGRIDSYSTEMS\.PLANIGNV2/);
    assert.match(url, /TILEMATRIXSET=PM/, 'la projection de Leaflet (Web Mercator)');
    assert.match(url, /TILEMATRIX=\{z\}&TILEROW=\{y\}&TILECOL=\{x\}/, 'rangée = y, colonne = x : les inverser brouillerait la carte');
    assert.doesNotMatch(url, /apikey|api_key|key=/i);
    // Le zoom 20 n'existe pas au Plan IGN : au-delà de 19, des tuiles vides.
    assert.match(CARTE, /L\.tileLayer\(FOND_DE_CARTE, \{\s*maxZoom: 19,/);
    assert.match(CARTE, /attribution: '©[^']*IGN[^']*Géoplateforme'/, 'la source est citée');
    // Désaturé : les bulles et les points de couleur restent ce qu'on voit d'abord.
    assert.match(CSS, /\.carte-map \.fond-carte\{filter:saturate\(/);
});

test('un département ouvert laisse les autres bulles sur la carte, cliquables', () => {
    const debut = CARTE.indexOf('if (dept) {', CARTE.indexOf('const bulle = (d, estompee) =>'));
    const brancheDept = CARTE.slice(debut, CARTE.indexOf('} else {', debut));
    assert.match(brancheDept, /for \(const d of filtered\) if \(d\.dept !== dept\) bulle\(d, true\);/,
        'les autres départements — ceux du filtre — restent dessinés, estompés');
    const fonction = CARTE.slice(CARTE.indexOf('const bulle = (d, estompee) =>'), debut);
    // Sans condition : une bulle estompée qu'on ne pourrait pas cliquer ne servirait qu'à regarder.
    assert.match(fonction, /^\s*m\.on\("click", \(\) => setDept\(d\.dept\)\);$/m, 'une bulle estompée mène à son département');
    assert.match(fonction, /fillOpacity: estompee \? 0\.35 : 0\.78/);
});

test('le zoom sur un département garde les voisines dans le cadre', () => {
    const zoom = Number(CARTE.match(/map\.fitBounds\(pts, \{ padding: \[40, 40\], maxZoom: (\d+) \}\)/)[1]);
    assert.ok(zoom <= 9, `zoom ${zoom} : à 12, les bulles voisines étaient là, mais hors de vue`);
});

test('le bandeau ne détache plus sa virgule du nom du département', () => {
    assert.match(CARTE, /<span><b>\{deptName\(dept\)\} \(\{dept\}\)<\/b>, \{deptPoints\.length\} stagiaire\(s\) géolocalisé\(s\)<\/span>/);
});
