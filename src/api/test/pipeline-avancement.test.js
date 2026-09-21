/**
 * LE PIPELINE LAISSAIT LES CARTES DANS LA PREMIÈRE COLONNE.
 *
 * LE DÉFAUT, mesuré en production sur la session RS7404 : les QUATRE stagiaires étaient
 * affichés « 0 % (0/16) » et empilés dans la toute première colonne, alors que le suivi
 * Qualiopi les donnait à « 50 % (8/16) ». Le tableau était inutilisable pour cette formation.
 * Sur NIV1H, dont le parcours ne bute sur aucune pièce, les deux écrans concordaient — ce qui
 * rendait le défaut d'autant plus difficile à croire.
 *
 * LA CAUSE. `getSessionBoard` gardait sa PROPRE COPIE du calcul de parcours, et cette copie
 * appelait `computeDocParcours({ steps, docs })` — sans les statuts de pièces. Une étape
 * « pièce » y était donc évaluée contre un objet vide, donc jamais franchie ; et comme
 * l'avancement s'arrête à la première étape non faite, tout se figeait à cette étape.
 *
 * CE N'ÉTAIT PAS QU'UN POURCENTAGE FAUX. `currentKey` désigne la COLONNE où tombe la carte :
 * bloquée sur la pièce, la carte n'en bougeait plus. Un pourcentage erroné se lit de travers ;
 * une carte mal rangée fait travailler sur la mauvaise étape.
 *
 * LE FICHIER AVAIT DÉJÀ DÉRIVÉ UNE FOIS : un commentaire qu'il porte encore raconte qu'il était
 * « le SEUL des trois écrans » à ignorer le parcours entreprise, et montrait « les mêmes
 * dossiers à 1/14 quand le Suivi disait 1/2 ». Une copie finit toujours par diverger. Celle-ci
 * n'existe plus : le pipeline appelle `lib/avancement.js` comme les trois autres écrans.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { computeDocParcours } = require('../lib/parcours.js');
const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const SESSION = lire('controllers/session.controller.js');
const AVANCEMENT = lire('lib/avancement.js');

/* Un parcours où une pièce se glisse en deuxième position — la configuration exacte de RS7404. */
const ETAPES = [
    { slug: 'devis', label: 'Devis', doc_type: 'DEVIS' },
    { slug: 'piece:1', label: 'Pièce d\'identité', piece_id: 'pt-1' },
    { slug: 'convention', label: 'Convention', doc_type: 'CONVENTION' },
    { slug: 'attestation', label: 'Attestation', doc_type: 'ATTESTATION' },
];
/* CHAQUE DOCUMENT PORTE SON TYPE, et chaque étape le sien. Sans eux, `matchDoc` retombe sur
   `d.type === step.doc_type` — soit `undefined === undefined`, qui est VRAI : n'importe quel
   document satisfaisait alors n'importe quelle étape, et le parcours d'essai se déclarait
   terminé d'un bloc. Un jeu d'essai trop pauvre ne rend pas le test indulgent, il le rend
   faux. */
const DOCS = [
    { id: 'd1', template_slug: 'devis', type: 'DEVIS', status: 'SIGNE' },
    { id: 'd2', template_slug: 'convention', type: 'CONVENTION', status: 'SIGNE' },
];

test('sans les statuts de pièces, la carte reste collée à la pièce', () => {
    /* CE TEST EST LE DÉFAUT. Il documente ce que produisait la copie du pipeline, et rougira
       si quelqu'un rend `pieces` optionnel « parce que ça marche sans ». */
    const parc = computeDocParcours({ steps: ETAPES, docs: DOCS });
    assert.strictEqual(parc.currentKey, 'piece:1', 'l\'étape courante se fige sur la pièce');
    assert.strictEqual(parc.currentIndex, 1);
    /* L'AVANCEMENT, lui, ne se fige plus (2026-09-21) : il compte TOUTES les étapes faites, dans
       n'importe quel ordre. La convention signée derrière la pièce compte — elle « n'était jamais
       comptée », et un dossier fait à 11 étapes sur 12 pouvait afficher 0 %. La pièce, elle, ne
       compte pas tant qu'on ne passe pas son statut : c'est ce qui reste du défaut. */
    assert.strictEqual(parc.percent, 50, 'devis et convention signés, sur quatre étapes');
});

test('avec les statuts, la carte dépasse la pièce validée', () => {
    const parc = computeDocParcours({ steps: ETAPES, docs: DOCS, pieces: { 'pt-1': 'VALIDEE' } });
    assert.strictEqual(parc.currentKey, 'attestation', 'la carte avance jusqu\'à la vraie étape restante');
    assert.strictEqual(parc.currentIndex, 3);
    assert.strictEqual(parc.percent, 75);
});

test('une pièce seulement déposée ne fait pas avancer', () => {
    /* Déposée ≠ vérifiée : tant que l'école n'a pas contrôlé, l'étape n'est pas franchie. */
    const parc = computeDocParcours({ steps: ETAPES, docs: DOCS, pieces: { 'pt-1': 'DEPOSEE' } });
    assert.strictEqual(parc.currentKey, 'piece:1');
});

test('le pipeline ne calcule plus le parcours dans son coin', () => {
    const bloc = SESSION.slice(SESSION.indexOf('const getSessionBoard = async'));
    const corps = bloc.slice(0, bloc.indexOf('\n};'));
    assert.ok(corps.length > 500, 'corps de getSessionBoard introuvable');
    assert.match(corps, /avancementDossiers\(conn, req\.user\.organization_id,/,
        'le tableau doit passer par le calcul partagé');
    /* ON RETIRE LES COMMENTAIRES AVANT DE CHERCHER : celui qui explique la correction cite
       forcément l'appel supprimé, et l'assertion s'accuserait elle-même. */
    const code = corps.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    assert.doesNotMatch(code, /computeDocParcours\(/,
        'aucune copie locale : c\'est elle qui oubliait les pièces');
});

test('la colonne vient de l\'étape courante rendue par le calcul partagé', () => {
    assert.match(AVANCEMENT, /currentKey: parc\.currentKey,/,
        'sans `currentKey`, le pipeline ne saurait pas où poser la carte');
    const bloc = SESSION.slice(SESSION.indexOf('const getSessionBoard = async'));
    assert.match(bloc, /a\.currentKey == null \|\| !keyIndex\.has\(a\.currentKey\)/,
        'étape inconnue ⇒ colonne finale, jamais une colonne au hasard');
});

test('les imports devenus inutiles ont été retirés', () => {
    /* `esbuild` ne signale pas une variable importée et jamais lue, et le projet n'a pas
       d'ESLint : un import mort survit indéfiniment et laisse croire que le fichier fait
       encore ce qu'il ne fait plus. */
    for (const mort of ['computeDocParcours', 'enrollmentSteps', 'loadConditionMap',
        'getEnabledFields', 'loadDossierFactsMap', 'companyParcours']) {
        const lignesImport = SESSION.split('\n').filter((l) => /^const \{.*require\(/.test(l));
        assert.ok(!lignesImport.some((l) => new RegExp(`\\b${mort}\\b`).test(l)),
            `${mort} n'est plus utilisé : son import doit disparaître`);
    }
});
