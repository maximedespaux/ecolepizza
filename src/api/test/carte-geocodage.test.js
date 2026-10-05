/**
 * LA CARTE GÉOCODE TOUT LE MONDE, ET SANS L'ADRESSE PERSO (demandé le 2026-10-05).
 *
 * Deux contrats :
 *  · le bouton « Géolocaliser » enchaîne les lots JUSQU'À épuisement — plus de « relancez » à la
 *    main — en s'arrêtant quand il ne reste rien à faire, ou qu'un lot ne place plus personne
 *    (adresses non géocodables : inutile de boucler) ;
 *  · un stagiaire SANS entreprise est géocodé par son code postal + sa ville, JAMAIS par son adresse
 *    personnelle — qui n'est même pas lue par la requête de géocodage.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..', '..', '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');

test('le bouton géocode TOUT en bouclant, sans « relancez » à la main', () => {
    const c = lire('src/app/ui/pages/Carte.jsx');
    assert.match(c, /for \(let tour = 0; tour < \d+; tour\+\+\)/, 'les lots s\'enchaînent, avec un garde-fou de tours');
    assert.match(c, /if \(!r\.remaining \|\| !r\.done\) break;/, 'on s\'arrête quand il ne reste rien, ou qu\'un lot ne place plus personne');
    assert.doesNotMatch(c, /relancez/i, 'plus de « relancez » : la boucle le fait toute seule');
});

test('confidentialité : sans entreprise → code postal + ville, JAMAIS l\'adresse perso', () => {
    const c = lire('src/api/controllers/carte.controller.js');
    // Particulier (sans entreprise) : address null, zip + ville.
    assert.match(c, /: \{ id: r\.id, address: null, zip_code: r\.zip_code, town: r\.town \}/);
    // Professionnel (entreprise) : l'adresse d'établissement, publique.
    assert.match(c, /pro\s*\n?\s*\? \{ id: r\.id, address: r\.c_address, zip_code: r\.c_zip, town: r\.c_town \}/);
    // La requête de géocodage ne lit MÊME PAS learner.address : rien ne peut l'envoyer par mégarde.
    const geo = c.slice(c.indexOf('const geocodeLearners'), c.indexOf('geocodeBatch(inputs'));
    assert.ok(geo.length > 0, 'bloc geocodeLearners localisé');
    assert.doesNotMatch(geo, /\bl\.address\b/, 'geocodeLearners ne sélectionne pas learner.address');
});
