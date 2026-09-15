/**
 * LA CARTE MONTRAIT UNE FORMATION SOUS LAQUELLE LE POINT ÉTAIT INTROUVABLE.
 *
 * SIGNALÉ PAR L'UTILISATEUR, puis mesuré sur la production le 2026-09-15 : filtrer la carte des
 * stagiaires sur une formation ne rendait JAMAIS rien — « Aucun stagiaire situé ne suit la
 * formation NIV1H », et la même phrase pour les huit autres.
 *
 * LA CAUSE, dans un seul fichier, à quarante lignes d'écart :
 *   · la COULEUR du point et son info-bulle lisent `program_code || level` ;
 *   · le FILTRE, lui, ne lisait que `formations`.
 * Or `formations` vient des INSCRIPTIONS. Un stagiaire importé — et ils sont 1068 sur 1073 —
 * porte sa formation dans son ÉTIQUETTE (`learner.levels`), jamais dans une inscription.
 * Relevé sur les 155 points géocodés de l'organisme : `formations` était vide sur les 155. Le
 * filtre ne pouvait donc rien afficher, quelle que soit la formation demandée, pendant que la
 * carte affichait fièrement « NIV1 » sous deux de ces points.
 *
 * LA RÈGLE RETENUE : on filtre sur CE QUE LA CARTE MONTRE. C'est la seule qui ne puisse pas
 * mentir — un point annoncé sous un nom doit se retrouver sous ce nom.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const CARTE = fs.readFileSync(path.join(UI, 'pages/Carte.jsx'), 'utf8');

test('UN POINT SE RETROUVE SOUS LE NOM QUE LA CARTE AFFICHE', async () => {
    const { codesDuPoint } = await import('../../app/ui/lib/levels.js');
    /* Les trois formes réelles, relevées sur la production. Le stagiaire importé est le cas
       majoritaire et c'était exactement celui que le filtre perdait. */
    const importe = { name: 'Loïc S.', formations: [], program_code: null, level: 'NIV1' };
    const inscrit = { name: 'Elodie J.', formations: ['RS7404'], program_code: 'RS7404', level: null };
    const lesDeux = { name: 'Caroline S.', formations: ['NIV1H', 'NIV1'], program_code: 'NIV1H', level: 'NIV1' };

    assert.deepStrictEqual(codesDuPoint(importe), ['NIV1'],
        'sans inscription, l\'étiquette EST la formation — c\'est elle que la carte affiche');
    assert.deepStrictEqual(codesDuPoint(inscrit), ['RS7404']);
    assert.deepStrictEqual(codesDuPoint(lesDeux).sort(), ['NIV1', 'NIV1H'],
        'toutes les formations suivies, sans doublon');
    assert.deepStrictEqual(codesDuPoint({ formations: [], program_code: null, level: null }), [],
        'un point sans aucune formation connue ne se réclame d\'aucune');
});

test('LE DÉFAUT D\'ORIGINE, REJOUÉ : filtrer sur `formations` seul perd le stagiaire importé', async () => {
    const { codesDuPoint } = await import('../../app/ui/lib/levels.js');
    const points = [
        { formations: [], program_code: null, level: 'NIV1' },   // importé : la carte l'affiche « NIV1 »
        { formations: [], program_code: null, level: 'NIV1' },
        { formations: [], program_code: null, level: null },     // aucune formation connue
    ];
    const avant = (p, forms) => (p.formations || []).some((c) => forms.includes(c));
    const apres = (p, forms) => codesDuPoint(p).some((c) => forms.includes(c));

    assert.strictEqual(points.filter((p) => avant(p, ['NIV1'])).length, 0,
        'l\'ancien filtre ne rendait rien — le symptôme signalé');
    assert.strictEqual(points.filter((p) => apres(p, ['NIV1'])).length, 2,
        'le nouveau retrouve les points que la carte colore déjà en NIV1');
});

test('LE FILTRE ET LA COULEUR LISENT LA MÊME CHOSE', () => {
    /* C'EST L'INVARIANT, pas le correctif. Tant que deux lignes du même fichier interrogent des
       champs différents pour désigner LA MÊME formation, l'une des deux finira par mentir. */
    assert.match(CARTE, /const pointMatch = \(p\) => !forms\.length \|\| codesDuPoint\(p\)\.some/,
        'le filtre passe par codesDuPoint');
    assert.ok(!/\(p\.formations \|\| \[\]\)\.some\(\(c\) => forms\.includes/.test(CARTE),
        'plus aucun filtre sur `formations` seul');
    assert.match(CARTE, /codesDuPoint\(p\)\.forEach\(\(c\) => s\.add\(c\)\)/,
        'la liste des formations proposées vient de la même source : on ne propose pas un filtre qui ne peut rien rendre');
});

test('QUAND LE FILTRE NE REND RIEN, L\'ÉCRAN DIT POURQUOI', () => {
    /* Un filtre qui répond « personne » sans expliquer passe pour cassé — c'est très exactement
       comme ça qu'il a été signalé. La page compte désormais les points qui portent une
       formation CONNUE : c'est ce nombre qui borne ce que le filtre peut montrer. */
    assert.match(CARTE, /const situesAvecFormation = useMemo\(\s*\(\) => \(data\?\.points \|\| \[\]\)\.filter\(\(p\) => codesDuPoint\(p\)\.length > 0\)\.length/);
    assert.match(CARTE, /Aucun<\/b> des \{geocoded\} stagiaires situés n'a de formation renseignée/);
    assert.match(CARTE, /Seuls <b>\{situesAvecFormation\}<\/b> des \{geocoded\}/);
});

test('LE COMPTEUR NE CONFOND PLUS DEUX POPULATIONS', () => {
    /* `pending` a un code postal : il EST compté dans son département, il lui manque la ville.
       `ungeo` n'en a pas : il n'est compté nulle part. Les annoncer ensemble comme « comptés
       dans leur département » faisait mentir le total affiché juste au-dessus. */
    assert.ok(!/stagiaire\(s\) sans point précis, comptés dans leur département/.test(CARTE),
        'la phrase qui confondait les deux populations est retirée');
    /* ON VÉRIFIE LA GARDE, PAS LA PHRASE. Écrite d'abord en cherchant le texte, l'assertion
       restait verte quand on remplaçait `pending > 0` par `false` : la phrase était toujours
       dans le fichier, simplement plus jamais affichée. Un test qui prouve qu'un mot existe ne
       prouve pas qu'on le lira. */
    assert.match(CARTE, /\{pending > 0 && <>[^<]*\{pending\} comptés dans leur département/,
        'la mention « comptés dans leur département » n\'apparaît QUE pour `pending`');
    assert.match(CARTE, /\{ungeo > 0 && <>[^]*?\{ungeo\} sans code postal exploitable/,
        'et celle des absents de la carte QUE pour `ungeo`');
});
