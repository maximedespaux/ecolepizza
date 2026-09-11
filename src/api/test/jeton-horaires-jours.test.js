/**
 * {HorairesJours} — les journées de formation avec leurs plages, une par ligne.
 *
 * CE QUI MANQUAIT. {Lundi}…{Vendredi} donnent des DATES (02/06/2025) ;
 * {field:training_program.horaires} rend le texte libre tel qu'il a été saisi. Aucun jeton ne
 * rapprochait les deux, donc aucun modèle ne pouvait écrire « Lundi 8h45-12h00 & 13h00-17h15 »
 * sans que quelqu'un le retape à la main pour chaque session — et le retape faux dès qu'une date
 * bouge.
 *
 * LE PARSEUR EST CELUI DE LA FEUILLE D'ÉMARGEMENT, importé et non recopié. Il connaît les formes
 * réelles écrites par l'organisme, que ces tests énumèrent. Une seconde lecture aurait fini par
 * diverger — et le document aurait annoncé d'autres horaires que la feuille signée le même jour.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { horairesParJour, TOKEN_CATALOG } = require('../lib/tokens.js');

const LUNDI = '2026-06-01'; // un lundi

test('le cas demandé : un horaire par journée', () => {
    const r = horairesParJour(
        'Jour 1 : 8h45-12h00 / 13h00-17h15\nJour 2 : 8h00-12h00 / 13h00-17h00\nJour 3 : 8h00-12h00 / 13h00-14h30',
        3, LUNDI);
    assert.strictEqual(r, [
        'Lundi 8h45-12h00 & 13h00-17h15',
        'Mardi 8h00-12h00 & 13h00-17h00',
        'Mercredi 8h00-12h00 & 13h00-14h30',
    ].join('\n'));
});

test('une seule ligne vaut pour toutes les journées', () => {
    // La forme la plus courante : mêmes horaires tous les jours, écrits une fois.
    const r = horairesParJour('9h00 – 12h30 / 13h30 – 17h00', 3, LUNDI);
    assert.deepStrictEqual(r.split('\n'), [
        'Lundi 9h00-12h30 & 13h30-17h00',
        'Mardi 9h00-12h30 & 13h30-17h00',
        'Mercredi 9h00-12h30 & 13h30-17h00',
    ]);
});

test('une plage de jours, et son exception', () => {
    const r = horairesParJour('Jours 1 à 4 : 9h-12h / 13h-17h\nJour 5 : 9h-12h', 5, LUNDI);
    const l = r.split('\n');
    assert.strictEqual(l[3], 'Jeudi 9h00-12h00 & 13h00-17h00');
    assert.strictEqual(l[4], 'Vendredi 9h00-12h00', 'le dernier jour n\'a pas d\'après-midi');
});

test('une formation qui démarre en fin de semaine saute le week-end', () => {
    /* Même règle que `businessDay`, qui calcule {Lundi}…{Vendredi} : une session de trois jours
       commencée un jeudi se termine le lundi. Compter en jours calendaires nommerait « samedi »
       une journée où personne ne vient. */
    const r = horairesParJour('8h-12h / 13h-17h', 3, '2026-06-04'); // un jeudi
    assert.deepStrictEqual(r.split('\n').map((x) => x.split(' ')[0]), ['Jeudi', 'Vendredi', 'Lundi']);
});

test('sans horaires saisis, le jeton reste vide', () => {
    /* Comme tous les jetons de formation : un modèle qui le porte s'imprime sans trou ni
       « undefined ». On ne fabrique pas d'horaires par défaut — inventer une plage sur un
       document que le stagiaire signe serait pire que de n'en afficher aucune. */
    for (const vide of ['', null, undefined]) assert.strictEqual(horairesParJour(vide, 3, LUNDI), '');
    assert.strictEqual(horairesParJour('9h-12h', 0, LUNDI), '', 'ni durée, ni horaires');
    assert.strictEqual(horairesParJour('9h-12h', 3, null), '', 'sans date de début, rien à nommer');
});

test('le jeton est proposé dans la palette, avec un exemple parlant', () => {
    const t = TOKEN_CATALOG.flatMap((g) => g.tokens).find((x) => x.key === 'HorairesJours');
    assert.ok(t, 'le jeton doit être au catalogue, sinon il est introuvable dans l\'éditeur');
    assert.match(t.sample, /Lundi .*&.*\n.*Mardi/, 'l\'exemple montre DEUX lignes : c\'est la forme du rendu');
});

test('le parseur est PARTAGÉ avec la feuille d\'émargement', () => {
    /* S'il était recopié, le document et la feuille finiraient par annoncer des horaires
       différents pour la même journée — et rien ne dirait lequel croire. */
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib/tokens.js'), 'utf8');
    assert.match(src, /const \{ parseDaySchedules, fmtHM \} = require\('\.\/emargement\.js'\);/);
    assert.doesNotMatch(src, /function parseDaySchedules/, 'aucune seconde copie du parseur');
});
