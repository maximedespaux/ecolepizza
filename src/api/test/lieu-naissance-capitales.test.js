/**
 * LE LIEU DE NAISSANCE EN CAPITALES, COMME LA VILLE (demandé le 2026-09-22).
 *
 * La ville l'est depuis le 2026-09-17 (ville-capitales.test.js), par tous les chemins d'écriture.
 * Le lieu de naissance est une ville aussi, et s'imprime sur les mêmes documents ; il restait tel
 * que tapé — « Tarbes » sur une fiche, « TARBES » sur la suivante. Il suit désormais la même règle,
 * par les deux chemins qui l'écrivent : la fiche tenue par l'école, et l'espace du stagiaire.
 * Les fiches déjà en base passent par la migration 171 (octets comparés, cf. la 162).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { CAPITALES_STAGIAIRE } = require('../lib/saisie.js');
const { normaliserSaisie } = require('../controllers/learner.controller.js');

const RACINE = path.join(__dirname, '..', '..', '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');

test('le lieu de naissance rejoint la liste, à côté du nom et de la ville', () => {
    assert.ok(CAPITALES_STAGIAIRE.includes('birth_place'));
    assert.ok(CAPITALES_STAGIAIRE.includes('town') && CAPITALES_STAGIAIRE.includes('last_name'));
});

test('chemin 1 — la fiche tenue par l\'école : capitales, accents conservés', () => {
    assert.strictEqual(normaliserSaisie({ birth_place: '  béziers ' }).birth_place, 'BÉZIERS');
    assert.strictEqual(normaliserSaisie({ birth_place: null }).birth_place, null, 'vider le champ reste possible');
});

test('chemin 2 — l\'espace du stagiaire, qui modifie lui-même son lieu de naissance', () => {
    const ESPACE = lire('src/api/controllers/espace.controller.js');
    assert.match(ESPACE, /const INFO_FIELDS = \[[^\]]*'birth_place'/, 'le stagiaire l\'écrit par ce chemin');
    assert.match(ESPACE, /const b = capitaliser\(req\.body \|\| \{\}, CAPITALES_STAGIAIRE\);/, 'et ce chemin applique la liste');
});

test('les deux formulaires l\'écrivent en capitales dès la frappe', () => {
    const FICHE = lire('src/app/ui/components/EditStagiaireModal.jsx');
    assert.match(FICHE, /const setLieuNaissance = \(e\) => setForm\(\(p\) => \(\{ \.\.\.p, birth_place: e\.target\.value\.toLocaleUpperCase\("fr"\) \}\)\);/);
    assert.match(FICHE, /<Field label="Lieu de naissance" value=\{form\.birth_place\} onChange=\{setLieuNaissance\}/);
    const PROFIL = lire('src/app/ui/components/ProfileModal.jsx');
    assert.match(PROFIL, /k === "birth_place" \? e\.target\.value\.toLocaleUpperCase\("fr"\)/);
});

test('la reprise des fiches existantes : octets comparés, et un revert qui ne s\'invente rien', () => {
    const MIG = lire('database/migrations/171_lieu_naissance_capitales.sql');
    const code = MIG.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.match(code, /UPDATE learner\s+SET birth_place = UPPER\(TRIM\(birth_place\)\)/);
    /* utf8mb4_general_ci est insensible à la casse : sans CAST, « Tarbes » <> « TARBES » vaut FAUX,
       aucune ligne n'est choisie, et la migration passe sans rien faire. */
    assert.match(code, /CAST\(birth_place AS BINARY\) <> CAST\(UPPER\(TRIM\(birth_place\)\) AS BINARY\)/);
    const REVERT = lire('database/migrations/171_revert_lieu_naissance_capitales.sql');
    assert.match(REVERT.replace(/\/\*[\s\S]*?\*\//g, ''), /^\s*DO 0;\s*$/);
    // Le client SQL de l'organisme découpe sur le point-virgule (cf. la 146).
    for (const f of [MIG, REVERT]) {
        const commentaires = (f.match(/\/\*[\s\S]*?\*\//g) || []).join('');
        assert.ok(!commentaires.includes(';'), 'aucun point-virgule dans les commentaires');
        assert.ok(!f.includes('\\'), 'aucune barre oblique inverse');
    }
});
