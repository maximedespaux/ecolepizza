/**
 * RECHERCHE D'UN STAGIAIRE (2026-10-09) : par nom/prénom MULTI-MOTS, par e-mail, et par TÉLÉPHONE.
 *
 * DEUX DÉFAUTS gelés ici :
 *   · « abadie c » ne trouvait pas « Abadie Christelle » : les deux mots tombent dans des champs
 *     DIFFÉRENTS (nom, prénom), qu'un seul LIKE sur une colonne ne rapproche pas. On exige désormais
 *     que CHAQUE mot corresponde à l'un des champs — ET entre les mots, OU entre les champs. La
 *     construction `(… abadie …) AND (… c …)` est alors satisfaite par « Abadie Christelle »
 *     (« abadie » → nom, « c » → prénom) ;
 *   · on ne pouvait pas chercher par TÉLÉPHONE : un numéro (chiffres + séparateurs, SANS lettre) se
 *     cherche désormais sur les seuls chiffres (« 06 12 34 56 78 » se tape « 0612 » ou « 06 12 »).
 *
 * Si l'on revient à l'ancien « un OR par champ sur la saisie entière », la map par mots disparaît et
 * la première assertion rougit.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const CTRL = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'learner.controller.js'), 'utf8');
const corps = CTRL.slice(CTRL.indexOf('const getLearners ='), CTRL.indexOf('const getLearner ='));

test('MULTI-MOTS : chaque mot doit correspondre à un champ (ET entre les mots, OU entre les champs)', () => {
    assert.match(corps, /const termes = raw\.split\(\/\\s\+\/\)\.filter\(Boolean\)/, 'la saisie est découpée en mots');
    // Un groupe (prénom OU nom OU e-mail) par mot, les groupes joints par AND.
    assert.match(corps, /termes\.map\(\(\) => '\(l\.first_name LIKE \? OR l\.last_name LIKE \? OR l\.email LIKE \?\)'\)\.join\(' AND '\)/);
    // Trois valeurs LIKE par mot, dans l'ordre.
    assert.match(corps, /for \(const t of termes\)[\s\S]*filtres\.push\(like, like, like\)/);
});

test('TÉLÉPHONE : sur les seuls chiffres, et seulement quand la saisie ne porte aucune lettre', () => {
    assert.match(corps, /const chiffres = raw\.replace\(\/\\D\/g, ''\)/, 'on ne retient que les chiffres de la saisie');
    assert.match(corps, /if \(chiffres && !\/\[a-zA-Z\]\/\.test\(raw\)\) \{/, 'un numéro = chiffres et séparateurs, pas de lettre');
    assert.match(corps, /REPLACE\([\s\S]*IFNULL\(l\.phone, ''\), ' ', ''[\s\S]*LIKE \?/, 'téléphone normalisé (séparateurs retirés)');
});

test('les alternatives (téléphone OU mots) sont jointes par OR ; une saisie vide ne filtre rien', () => {
    assert.match(corps, /const filtreSql = ors\.length \?/, 'pas de filtre quand il n\'y a ni mot ni numéro');
    assert.match(corps, /ors\.join\(' OR '\)/, 'téléphone OU correspondance par mots');
    assert.match(corps, /\[organizationId, \.\.\.filtres\]/, 'les valeurs partent dans l\'ordre (organisme + filtres)');
});

test('l\'écran annonce la recherche par téléphone', () => {
    const page = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'pages', 'Stagiaires.jsx'), 'utf8');
    assert.match(page, /placeholder="Rechercher un stagiaire, nom, prénom, e-mail, téléphone…"/);
    assert.match(page, /aria-label="Rechercher un stagiaire par nom, prénom, e-mail ou téléphone"/);
});
