/**
 * LA CARTE REGROUPE LES STAGIAIRES D'UNE MÊME VILLE — sauf ceux d'une entreprise (2026-09-22).
 *
 * LE DÉFAUT. Un particulier est situé à sa VILLE, jamais à son adresse : c'est une donnée
 * personnelle. Tous ceux d'une même ville partageaient donc exactement le même point — empilés, un
 * seul se voyait et se cliquait. À Lannemezan, la ville de l'école, un clic montrait un nom sur des
 * dizaines. Ils forment désormais un point qui porte leur nombre et, au clic, leur liste. Les
 * stagiaires d'une ENTREPRISE, situés à son adresse exacte, gardent chacun le leur — la règle qui en
 * décide est celle du géocodage, en un seul exemplaire (`aAdresseEntreprise`).
 *
 * ET UNE FAILLE AU PASSAGE. Leaflet pose le contenu d'une bulle en innerHTML, et la carte y écrivait
 * le nom tel quel. Or un stagiaire modifie lui-même son nom depuis son espace (PUT
 * /mon-espace/infos) : un nom piégé s'exécutait dans la session de l'administrateur qui survolait
 * son point, là où le jeton de connexion se lit. Tout ce qui vient de la base est désormais échappé.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const lireUi = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'app/ui', f), 'utf8');
const groupes = () => import('../../app/ui/lib/carteGroupes.js');
const niveaux = () => import('../../app/ui/lib/levels.js');

// ── Fausse base, pour éprouver le vrai contrôleur de la carte ─────────────────────────────────
let lignes = [];
const faux = {
    promise: () => ({ query: async () => [[]] }),
    query: (sql, params, cb) => cb(null, lignes.map((l) => ({ ...l }))),
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };
const { getCarte } = require('../controllers/carte.controller.js');
const carte = () => new Promise((ok) => {
    getCarte({ user: { organization_id: 'o1' } }, { status() { return this; }, json: (b) => ok(b.data) });
});
const pt = (id, town, lat, lng, extra = {}) => ({
    id, name: `Stagiaire ${id}`, town, dept: '65', lat, lng, level: null, program_code: 'NIV1H', formations: ['NIV1H'], entreprise: null, ...extra,
});

test('les stagiaires situés à leur ville forment UN point ; ceux d\'une entreprise, un chacun', async () => {
    const { grouperPoints } = await groupes();
    const g = grouperPoints([
        pt('a', 'LANNEMEZAN', 43.125, 0.384),
        pt('b', 'Lannemezan', 43.125, 0.384), // la casse n'y change rien
        pt('c', 'TARBES', 43.233, 0.078),
        pt('d', 'LANNEMEZAN', 43.126, 0.389, { entreprise: 'PIZZERIA DEL SOL' }), // à l'adresse de son entreprise
        pt('e', 'LANNEMEZAN', 43.125, 0.384),
        pt('f', 'LANNEMEZAN', 43.130, 0.390, { entreprise: 'PIZZERIA DEL SOL' }),
    ]);
    assert.deepStrictEqual(g.map((x) => [x.points.map((p) => p.id).join(''), x.groupe]),
        [['abe', true], ['c', false], ['d', false], ['f', false]]);
});

test('sans ville, le regroupement se fait sur la position même', async () => {
    const { grouperPoints } = await groupes();
    const g = grouperPoints([pt('a', '', 43.1, 0.3), pt('b', null, 43.1, 0.3), pt('c', '', 44.8, -0.5)]);
    assert.deepStrictEqual(g.map((x) => x.points.length), [2, 1]);
});

test('la couleur d\'un point de ville est celle de la formation la plus suivie', async () => {
    const { setBadgeColors } = await niveaux();
    setBadgeColors({ NIV1H: '#e0932e', RS7404: '#2f9e6f' });
    const { couleurDuGroupe } = await groupes();
    const g = { points: [pt('a', 'X', 0, 0), pt('b', 'X', 0, 0, { program_code: 'RS7404' }), pt('c', 'X', 0, 0)] };
    assert.strictEqual(couleurDuGroupe(g), '#e0932e');
});

test('un nom piégé ne s\'exécute plus dans une bulle', async () => {
    const { echapper, encartStagiaire, encartVille } = await groupes();
    const piege = '<img src=x onerror=alert(localStorage.token)>';
    assert.strictEqual(echapper(`a<b>&"'`), 'a&lt;b&gt;&amp;&quot;&#39;');
    for (const html of [
        encartStagiaire(pt('a', piege, 0, 0, { name: piege, entreprise: piege })),
        encartVille({ ville: piege, points: [pt('a', piege, 0, 0, { name: piege }), pt('b', 'X', 0, 0)] }),
    ]) {
        assert.doesNotMatch(html, /<img/i, 'aucune balise venue de la base');
        assert.match(html, /&lt;img src=x onerror=alert\(localStorage\.token\)&gt;/, 'le texte reste lisible, échappé');
    }
    // Et la page ne pose plus rien de brut : ni encart écrit à la main, ni info-bulle au nom nu.
    const CARTE = lireUi('pages/Carte.jsx');
    assert.doesNotMatch(CARTE, /bindPopup\(`/, 'plus d\'encart composé à la main dans la page');
    assert.doesNotMatch(CARTE, /bindTooltip\(p\.name\b/);
    assert.match(CARTE, /m\.bindTooltip\(echapper\(p\.name\), \{ direction: "top" \}\);/);
    assert.match(CARTE, /m\.bindTooltip\(`\$\{echapper\(g\.ville\)\} · \$\{g\.points\.length\} stagiaires`/);
});

test('la page dessine les groupes, et la liste d\'une grande ville défile', () => {
    const CARTE = lireUi('pages/Carte.jsx');
    assert.match(CARTE, /for \(const g of grouperPoints\(deptPoints\)\) \{/);
    assert.match(CARTE, /m\.bindPopup\(encartVille\(g\), \{ maxHeight: 260 \}\);/, 'Lannemezan compte des dizaines de noms');
    assert.match(CARTE, /m\.bindPopup\(encartStagiaire\(p\)\);/);
});

test('le serveur dit qui est à l\'adresse de son entreprise — la règle même du géocodage', async () => {
    const base = { first_name: 'A', last_name: 'B', zip_code: '65300', address: null, lat: 43.1, lng: 0.4, geo_precision: 'municipality',
        levels: '', level: null, program_code: 'NIV1H', formation_codes: 'NIV1H', company_name: 'PIZZERIA DEL SOL' };
    lignes = [
        { ...base, id: 'pro', town: 'LANNEMEZAN', financing: 'PROFESSIONNEL', company_id: 'c1', c_address: '1 rue du Four', c_zip: '65300', c_town: 'LANNEMEZAN' },
        { ...base, id: 'particulier', town: 'LANNEMEZAN', financing: 'PARTICULIER', company_id: 'c1', c_address: '1 rue du Four', c_zip: '65300', c_town: 'LANNEMEZAN' },
        { ...base, id: 'pro-sans-adresse', town: 'TARBES', financing: 'PROFESSIONNEL', company_id: 'c2', c_address: null, c_zip: null, c_town: null },
    ];
    const { points } = await carte();
    const par = Object.fromEntries(points.map((p) => [p.id, p.entreprise]));
    assert.strictEqual(par.pro, 'PIZZERIA DEL SOL', 'professionnel à l\'adresse de son entreprise : un point à lui');
    assert.strictEqual(par.particulier, null, 'rattaché à une entreprise, mais particulier : situé à sa ville');
    assert.strictEqual(par['pro-sans-adresse'], null, 'entreprise sans adresse : le géocodage l\'a situé à sa ville');
    const CTRL = fs.readFileSync(path.join(__dirname, '..', 'controllers/carte.controller.js'), 'utf8');
    assert.match(CTRL, /const pro = aAdresseEntreprise\(r\);/, 'le géocodage lit la même règle');
    assert.strictEqual((CTRL.match(/financing === 'PROFESSIONNEL'/g) || []).length, 1, 'une seule copie de la règle');
});
