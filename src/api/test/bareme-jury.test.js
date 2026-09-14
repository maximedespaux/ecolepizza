/**
 * LA RÈGLE DU JURY — « N critères sur M, dont certains obligatoires ».
 *
 * CE FICHIER EST BÂTI SUR LA VRAIE GRILLE de l'école, « Fabriquer des pizzas artisanales
 * RS7404 », pas sur des exemples inventés. Ses quatre formes de règle y figurent toutes :
 *   C1 « le candidat doit valider les 6 critères »
 *   C2 « au moins 5 critères sur 6. Le critère C2.3 est obligatoire »
 *   C5 « les 4 critères sur 5. Le critère C5.5 est obligatoire »
 *   C6 « les 4 critères sur 5 »   (seuil, sans obligatoire)
 *
 * POURQUOI UN TOTAL DE POINTS NE SUFFIT PAS, et c'est tout l'objet de ce calcul : cinq critères
 * sur six, et cinq sur six DONT LE BON, valent cinq points l'un comme l'autre — et pourtant
 * l'un valide la compétence et l'autre non. Aucun barème à points ne sait exprimer cela.
 */
const test = require('node:test');
const assert = require('node:assert');

const { validationCompetence, resultatJury, critereAcquis } = require('../lib/bareme.js');

/* Les compétences de la grille réelle, avec leur règle telle qu'imprimée. */
const crit = (id, obligatoire) => ({ id, obligatoire: obligatoire ? 1 : 0, active: 1 });
const C1 = { code: 'C1', label: 'Fabriquer une pâte à pizza artisanale', min_valides: null,
    criteres: ['c11', 'c12', 'c13', 'c14', 'c15', 'c16'].map((i) => crit(i)) };
const C2 = { code: 'C2', label: 'Bouler manuellement', min_valides: 5,
    criteres: [crit('c21'), crit('c22'), crit('c23', true), crit('c24'), crit('c25'), crit('c26')] };
const C5 = { code: 'C5', label: 'Cuire une pizza', min_valides: 4,
    criteres: [crit('c51'), crit('c52'), crit('c53'), crit('c54'), crit('c55', true)] };
const C6 = { code: 'C6', label: 'Présenter une pizza', min_valides: 4,
    criteres: ['c61', 'c62', 'c63', 'c64', 'c65'].map((i) => crit(i)) };

/** Coche des critères : `notes('c21 c22', 'c23')` = deux acquis, un raté. */
const notes = (acquis, rates) => {
    const o = {};
    for (const k of String(acquis || '').split(/\s+/).filter(Boolean)) o[k] = 1;
    for (const k of String(rates || '').split(/\s+/).filter(Boolean)) o[k] = 0;
    return o;
};

test('un critère vaut 1 point : acquis, ou pas', () => {
    assert.strictEqual(critereAcquis(1), true);
    assert.strictEqual(critereAcquis(0), false);
    /* `null` n'est pas zéro : un critère pas encore vu n'est pas un critère raté. */
    assert.strictEqual(critereAcquis(null), false);
});

test('« les 6 critères » : cinq ne suffisent pas', () => {
    const v = validationCompetence(C1, C1.criteres, notes('c11 c12 c13 c14 c15', 'c16'));
    assert.strictEqual(v.requis, 6, 'min_valides absent = TOUS les critères');
    assert.strictEqual(v.valides, 5);
    assert.strictEqual(v.validee, false);
});

test('« les 6 critères » : les six valident', () => {
    const v = validationCompetence(C1, C1.criteres, notes('c11 c12 c13 c14 c15 c16'));
    assert.strictEqual(v.validee, true);
    assert.strictEqual(v.manquants, 0);
});

test('LE CAS QU\'UN TOTAL DE POINTS NE SAIT PAS DIRE : 5 sur 6, mais pas le bon', () => {
    /* LE TEST QUI COMPTE. Même nombre de critères acquis, même « score », deux verdicts
       opposés — parce que C2.3 est obligatoire. C'est la raison d'être de tout ce calcul. */
    const sansObligatoire = validationCompetence(C2, C2.criteres, notes('c21 c22 c24 c25 c26', 'c23'));
    const avecObligatoire = validationCompetence(C2, C2.criteres, notes('c22 c23 c24 c25 c26', 'c21'));
    assert.strictEqual(sansObligatoire.valides, 5);
    assert.strictEqual(avecObligatoire.valides, 5, 'le même nombre de critères acquis');
    assert.strictEqual(sansObligatoire.validee, false, 'C2.3 manqué : la compétence tombe');
    assert.strictEqual(avecObligatoire.validee, true, 'un autre critère manqué : elle passe');
    assert.deepStrictEqual(sansObligatoire.obligatoiresManques, ['c23'],
        'et l\'on doit pouvoir DIRE lequel manque, pas seulement que ça ne passe pas');
});

test('C5 : quatre sur cinq passent, sauf si le manqué est C5.5', () => {
    assert.strictEqual(validationCompetence(C5, C5.criteres, notes('c51 c52 c53 c55', 'c54')).validee, true);
    assert.strictEqual(validationCompetence(C5, C5.criteres, notes('c51 c52 c53 c54', 'c55')).validee, false);
});

test('C6 : un seuil sans critère obligatoire', () => {
    /* Toutes les compétences n'ont pas d'obligatoire : la règle doit tenir sans. */
    const v = validationCompetence(C6, C6.criteres, notes('c61 c62 c63 c64', 'c65'));
    assert.strictEqual(v.validee, true);
    assert.deepStrictEqual(v.obligatoiresManques, []);
});

test('TANT QUE TOUT N\'EST PAS COCHÉ, la compétence n\'est pas refusée', () => {
    /* Le jury remplit sa grille geste après geste. Annoncer « non validée » au premier critère
       coché rendrait l'écran illisible pendant toute l'épreuve — et ferait croire à un échec. */
    const v = validationCompetence(C1, C1.criteres, notes('c11 c12'));
    assert.strictEqual(v.validee, null);
    assert.strictEqual(v.complet, false);
    assert.strictEqual(v.notes, 2);
});

test('MAIS L\'ÉCHEC DÉJÀ JOUÉ SE DIT, sans attendre la fin', () => {
    /* Deux cas où le résultat est arithmétiquement acquis avant la fin. Les taire obligerait le
       jury à cocher des cases qui ne changent plus rien, et laisserait croire que ça peut encore
       passer. */
    const obligatoireRate = validationCompetence(C2, C2.criteres, notes('c21', 'c23'));
    assert.strictEqual(obligatoireRate.validee, false, 'un obligatoire manqué décide seul');

    const troisRates = validationCompetence(C1, C1.criteres, notes('c11', 'c12 c13'));
    assert.strictEqual(troisRates.validee, false, 'six requis, deux déjà ratés : le seuil est hors d\'atteinte');

    const encorePossible = validationCompetence(C2, C2.criteres, notes('c21', 'c22'));
    assert.strictEqual(encorePossible.validee, null, 'un raté sur six, avec un seuil à cinq : rien n\'est joué');
});

test('un seuil plus grand que le nombre de critères est ramené au réel', () => {
    /* Une compétence à qui l'on a retiré un critère sans toucher au seuil deviendrait
       IMPOSSIBLE à valider, sans qu'aucune erreur ne le signale. */
    const comp = { min_valides: 9, criteres: C6.criteres };
    const v = validationCompetence(comp, C6.criteres, notes('c61 c62 c63 c64 c65'));
    assert.strictEqual(v.requis, 5);
    assert.strictEqual(v.validee, true);
});

test('un critère DÉSACTIVÉ ne compte plus, ni au seuil ni au total', () => {
    /* Retirer un critère d'une grille le désactive (il garde ses notes). Il ne doit pas
       continuer à peser, sinon la compétence resterait incomplète pour toujours. */
    const criteres = [...C6.criteres.slice(0, 4), { ...crit('c65'), active: 0 }];
    const v = validationCompetence({ min_valides: null }, criteres, notes('c61 c62 c63 c64'));
    assert.strictEqual(v.total, 4);
    assert.strictEqual(v.validee, true);
});

test('LE PIED DE GRILLE COMPTE LES COMPÉTENCES, pas les critères', () => {
    /* « Nombre de compétences validées : /7 ». C'est sur ce compte que le jury donne son avis —
       additionner les critères mêlerait une compétence à six critères et une à quatre. */
    const grille = [C1, C2, C5, C6];
    const toutes = { ...notes('c11 c12 c13 c14 c15 c16'), ...notes('c21 c22 c23 c24 c25 c26'),
        ...notes('c51 c52 c53 c54 c55'), ...notes('c61 c62 c63 c64 c65') };
    const r = resultatJury(grille, toutes);
    assert.strictEqual(r.validees, 4);
    assert.strictEqual(r.total, 4);
    assert.strictEqual(r.complet, true);

    /* Une seule compétence perdue, sur un seul critère obligatoire. */
    const presque = { ...toutes, c23: 0 };
    const r2 = resultatJury(grille, presque);
    assert.strictEqual(r2.validees, 3, 'C2 tombe sur son critère obligatoire');
    assert.strictEqual(r2.details.find((d) => d.code === 'C2').validee, false);
    assert.strictEqual(r2.complet, true, 'tout est coché : le verdict est prononçable');
});

test('la grille est INCOMPLÈTE tant qu\'une compétence ne s\'est pas prononcée', () => {
    const r = resultatJury([C1, C2], { ...notes('c11 c12 c13 c14 c15 c16'), ...notes('c21 c22') });
    assert.strictEqual(r.validees, 1);
    assert.strictEqual(r.complet, false, 'C2 n\'a pas fini : le jury ne peut pas encore conclure');
});
