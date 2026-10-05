/**
 * LA CARTE GÉOCODE TOUT LE MONDE, ET SANS L'ADRESSE PERSO (demandé le 2026-10-05).
 *
 * Deux contrats :
 *  · le bouton « Géolocaliser » PARCOURT tout le monde par id (curseur keyset `depuis`) et ne s'arrête
 *    qu'en FIN DE LISTE — surtout PAS quand un lot ne place personne : une grappe d'adresses que la BAN
 *    ne résout pas laissait sinon des stagiaires parfaitement géocodables hors de la carte (relevé le
 *    2026-10-05 : 8 sur 10 d'une formation, re-sélectionnés en boucle puis abandonnés) ;
 *  · un stagiaire SANS entreprise est géocodé par son code postal + sa ville, JAMAIS par son adresse
 *    personnelle — qui n'est même pas lue par la requête de géocodage.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..', '..', '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');

test('le bouton géocode TOUT en parcourant par curseur, sans abandonner sur un lot sans succès', () => {
    const c = lire('src/app/ui/pages/Carte.jsx');
    assert.match(c, /for \(let tour = 0; tour < \d+; tour\+\+\)/, 'les lots s\'enchaînent, avec un garde-fou de tours');
    assert.match(c, /geocodeCarte\(\d+, depuis\)/, 'chaque lot repart du curseur keyset `depuis`');
    assert.match(c, /if \(!r\.examined \|\| !r\.lastId\) break;/, 'on s\'arrête en FIN DE LISTE (plus rien à examiner)');
    assert.doesNotMatch(c, /!r\.done\) break/, 'on NE s\'arrête PAS sur un lot qui ne place personne : ça strandait les géocodables suivants');
    assert.doesNotMatch(c, /relancez/i, 'plus de « relancez » : la boucle le fait toute seule');

    // Serveur : keyset par id — on avance au-delà du dernier examiné, un échec n'est jamais re-sélectionné.
    const s = lire('src/api/controllers/carte.controller.js');
    assert.match(s, /AND l\.id > \?/, 'le lot repart APRÈS le dernier id (keyset)');
    assert.match(s, /ORDER BY l\.id/, 'ordre stable pour le curseur');
    assert.match(s, /lastId: rows\[rows\.length - 1\]\.id/, 'renvoie le curseur pour le lot suivant');
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
