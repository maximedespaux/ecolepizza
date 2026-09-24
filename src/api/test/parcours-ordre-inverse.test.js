/**
 * L'ESPACE STAGIAIRE AFFICHE SON PARCOURS À L'ENVERS (demandé le 2026-09-24) : dernière étape en
 * haut, première en bas.
 *
 * L'ORDRE LOGIQUE NE BOUGE PAS — c'est lui qui raconte le déroulé (pièces, puis documents, puis
 * remises) et qui désigne l'étape « en cours ». Seul l'AFFICHAGE est retourné. Un test le gèle
 * pour qu'un futur nettoyage ne réordonne pas la liste sans le vouloir.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const page = fs.readFileSync(
    path.join(__dirname, '..', '..', 'app', 'ui', 'pages', 'StudentFormationDetail.jsx'), 'utf8');

test('le parcours se rend en ordre inversé, l\'ordre logique restant le déroulé', () => {
    /* L'ordre logique est conservé pour le calcul de l'étape courante… */
    assert.match(page, /const etapes = \[\.\.\.etapesPieces, \.\.\.etapesDocs, \.\.\.etapesRemises\];/);
    assert.match(page, /const idxCourant = etapes\.findIndex/);
    /* …et l'affichage seul est retourné (on garde l'index LOGIQUE `i` pour « en cours »). */
    assert.match(page, /etapes\.map\(\(e, i\) => \(\{ e, i \}\)\)\.reverse\(\)\.map\(\(\{ e, i \}\) =>/);
    assert.match(page, /const etat = i === idxCourant \? "current" : e\.etat;/,
        'l’étape « en cours » se calcule sur l’index logique, pas sur la position affichée');
    /* Le trait de liaison ne pend pas sous le bas de la pile : le bas, c'est la PREMIÈRE étape
       logique (i === 0). */
    assert.match(page, /const dernier = i === 0;/);
});
