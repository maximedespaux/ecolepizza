/**
 * LIMITES PAR TYPE DE PIÈCE — taille max et formats acceptés, propres à chaque pièce.
 *
 * Deux plafonds valaient pour tout l'organisme, codés en dur (3 Mo ; JPEG/PNG/WebP/PDF). On les
 * rend réglables PAR PIÈCE. Défauts gelés ici :
 *   · une taille dérisoire ou abusive doit être ramenée dans des bornes saines ;
 *   · « tout coché » ou « rien coché » = aucune restriction propre (null → on suit les défauts) ;
 *   · un format inconnu de l'app ne doit jamais entrer dans la liste (elle ne sait pas le resservir) ;
 *   · à l'upload, taille et formats sortent de LA pièce, avec repli sur les plafonds communs.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { champsType, parseMimes, MIMES_CONNUS, MAX_OCTETS } = require('../controllers/piece.controller.js');

const MO = 1024 * 1024;

test('champsType : taille max bornée [100 Ko, 25 Mo], null si absente', () => {
    assert.strictEqual(champsType({ label: 'X' }).max_octets, null, 'aucune taille ⇒ plafond commun (null)');
    assert.strictEqual(champsType({ label: 'X', max_octets: 2 * MO }).max_octets, 2 * MO, 'valeur valide conservée');
    assert.strictEqual(champsType({ label: 'X', max_octets: 999 }).max_octets, 100 * 1024, 'dérisoire ⇒ plancher 100 Ko');
    assert.strictEqual(champsType({ label: 'X', max_octets: 999 * MO }).max_octets, 25 * MO, 'abusive ⇒ plafond 25 Mo');
});

test('champsType : formats = sous-ensemble stocké, ou null (aucune restriction)', () => {
    assert.strictEqual(champsType({ label: 'X', mimes: MIMES_CONNUS }).mimes, null, 'tous cochés ⇒ pas de restriction propre');
    assert.strictEqual(champsType({ label: 'X', mimes: [] }).mimes, null, 'rien coché ⇒ pas de restriction propre');
    assert.strictEqual(champsType({ label: 'X', mimes: ['application/pdf'] }).mimes, JSON.stringify(['application/pdf']), 'PDF seul ⇒ stocké');
    assert.strictEqual(champsType({ label: 'X', mimes: ['application/pdf', 'image/gif'] }).mimes,
        JSON.stringify(['application/pdf']), 'un format inconnu (gif) est filtré');
});

test('parseMimes : texte JSON -> tableau, sinon null', () => {
    assert.deepStrictEqual(parseMimes(JSON.stringify(['application/pdf'])), ['application/pdf']);
    assert.deepStrictEqual(parseMimes(['image/jpeg']), ['image/jpeg'], 'déjà un tableau : renvoyé tel quel');
    assert.strictEqual(parseMimes(null), null);
    assert.strictEqual(parseMimes('[]'), null, 'liste vide ⇒ null (pas de restriction)');
    assert.strictEqual(parseMimes('pas du json'), null, 'texte illisible ⇒ null (tolérant)');
});

test('deposer applique les limites PROPRES à la pièce, avec repli sur les plafonds communs', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'piece.controller.js'), 'utf8');
    // La pièce est lue AVANT d'accepter le fichier ; taille et formats viennent d'ELLE, sinon des défauts.
    assert.match(src, /const maxOctets = \(pt && pt\.max_octets\) \|\| MAX_OCTETS/, 'taille max de la pièce, sinon le plafond commun');
    assert.match(src, /const mimesOk = \(pt && parseMimes\(pt\.mimes\)\) \|\| MIMES/, 'formats de la pièce, sinon les formats par défaut');
    assert.match(src, /f\.buffer\.length > maxOctets/, 'la taille est comparée au plafond DE LA PIÈCE');
    assert.match(src, /!mimesOk\.includes\(String\(f\.mimetype\)\)/, 'le format est vérifié contre les formats DE LA PIÈCE');
    assert.doesNotMatch(src, /f\.buffer\.length > MAX_OCTETS/, 'plus de comparaison à la constante globale');
});
