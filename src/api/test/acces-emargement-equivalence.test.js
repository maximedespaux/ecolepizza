/**
 * LE POINT D'ACCÈS HONORE LES ÉQUIVALENCES « OU » (constaté le 2026-10-12, W42 → NIV1H → Mickael).
 *
 * LE DÉFAUT. Le stagiaire avait signé la « Convention de formation AGEFICE », variante de la
 * « Convention de formation » (les deux déclarées équivalentes par l'organisme, un choix « OU »).
 * Le parcours de son dossier avait résolu le groupe vers la Convention « normale » ; le point
 * d'accès réclamait donc CELLE-LÀ, qu'il n'avait pas signée. Message « signe d'abord tes documents
 * jusqu'à Droit à l'image », 3/4 — alors que la pièce équivalente ÉTAIT signée, et qu'aucun geste
 * n'aurait pu satisfaire une variante que son financeur ne produit pas.
 *
 * LA CORRECTION. `signeeDossier` (et `signeeEntreprise`) consultent désormais la carte d'équivalences
 * de l'organisme : un document du MÊME groupe « OU » signé vaut pour la variante exigée. Le repli sur
 * le TYPE de document couvrait déjà deux conventions de MÊME type ; l'équivalence couvre le cas où
 * l'organisme a donné un type (ou un slug) distinct à sa variante AGEFICE.
 *
 * NB : ça ne marche QUE si l'organisme a bien rangé les deux documents dans un « OU »
 * (Modèles → Équivalences). Sans équivalence et sans type commun, rien ne les relie — c'est voulu :
 * la décision reste pilotée par la configuration de l'organisme, jamais codée en dur.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { statutsDocuments, signeeDossier, signeeEntreprise, exigencesDossier, bilan } = require('../lib/pointDeRupture.js');

// Le groupe « OU » de l'organisme : Convention OU Convention AGEFICE (slugs ET types distincts).
const EQ = new Map([['convention', { group: 'org-conv' }], ['convention-agefice', { group: 'org-conv' }]]);
const conventionRequise = { slug: 'convention', doc_type: 'CONVENTION', sort_order: 10, stagiaire_sign: 1 };
// Le dossier a signé la variante AGEFICE, à un slug ET un type que le repli par type ne rattrape pas.
const statuts = statutsDocuments([{ template_slug: 'convention-agefice', type: 'CONVENTION_AGEFICE', status: 'SIGNE' }]);

test('SANS équivalence (ancien appel) : la Convention AGEFICE ne compte pas — le point reste fermé (le défaut)', () => {
    assert.strictEqual(signeeDossier(conventionRequise, statuts), false);
});

test('AVEC l\'équivalence « OU » : signer la variante AGEFICE vaut pour la Convention exigée', () => {
    assert.strictEqual(signeeDossier(conventionRequise, statuts, EQ), true);
});

test('AUCUN faux positif : une pièce d\'un AUTRE groupe signée ne débloque pas la Convention', () => {
    const autre = statutsDocuments([{ template_slug: 'attestation-hygiene', type: 'ATTESTATION', status: 'SIGNE' }]);
    assert.strictEqual(signeeDossier(conventionRequise, autre, EQ), false);
});

test('le repli par TYPE marche toujours : deux conventions de MÊME type, sans équivalence', () => {
    // L'organisme qui a gardé le type CONVENTION pour sa variante AGEFICE n'a besoin de rien.
    const memeType = statutsDocuments([{ template_slug: 'convention-agefice', type: 'CONVENTION', status: 'SIGNE' }]);
    assert.strictEqual(signeeDossier(conventionRequise, memeType), true);
});

test('LE BILAN DU POINT D\'ACCÈS : 3/4 fermé sans équivalence, 4/4 ouvert avec', () => {
    const steps = [
        { slug: 'devis', doc_type: 'DEVIS', sort_order: 1, stagiaire_sign: 1 },
        { slug: 'contrat', doc_type: 'CONTRAT', sort_order: 2, stagiaire_sign: 1 },
        { slug: 'droit-image', doc_type: 'DROIT_IMAGE', sort_order: 3, stagiaire_sign: 1 },
        conventionRequise,
    ];
    const required = exigencesDossier(steps, 10);
    const signes = statutsDocuments([
        { template_slug: 'devis', type: 'DEVIS', status: 'SIGNE' },
        { template_slug: 'contrat', type: 'CONTRAT', status: 'SIGNE' },
        { template_slug: 'droit-image', type: 'DROIT_IMAGE', status: 'SIGNE' },
        { template_slug: 'convention-agefice', type: 'CONVENTION_AGEFICE', status: 'SIGNE' },
    ]);
    const sans = bilan(required, (s) => signeeDossier(s, signes));
    assert.deepStrictEqual([sans.done, sans.need, sans.locked], [3, 4, true], 'le défaut : 3/4, fermé');
    const avec = bilan(required, (s) => signeeDossier(s, signes, EQ));
    assert.deepStrictEqual([avec.done, avec.need, avec.locked], [4, 4, false], 'la correction : 4/4, ouvert');
});

test('VOLET ENTREPRISE : un document de GROUPE équivalent signé vaut aussi', () => {
    const conventionGroupe = { slug: 'convention', doc_type: 'CONVENTION', company_level: 1, sort_order: 10 };
    const groupeSigne = statutsDocuments([{ template_slug: 'convention-agefice', type: 'CONVENTION_AGEFICE', status: 'SIGNE' }]);
    assert.strictEqual(signeeEntreprise(conventionGroupe, { parSlug: {}, parType: {} }, groupeSigne, EQ), true);
    assert.strictEqual(signeeEntreprise(conventionGroupe, { parSlug: {}, parType: {} }, groupeSigne), false, 'sans équivalence : le défaut');
});

/* ─── Les DEUX lecteurs de la règle passent la carte d'équivalences (sinon ils divergent) ──────── */
test('le point d\'accès (espace) ET le suivi (avancement) honorent l\'équivalence', () => {
    const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    const espace = lire('controllers/espace.controller.js');
    assert.match(espace, /signeeDossier\(s, statuts, eqMap\)/, 'la garde du dossier consulte les équivalences');
    assert.match(espace, /signeeEntreprise\(s, propres, groupe, eqMap\)/, 'la garde entreprise aussi');
    assert.match(espace, /equivalenceMap\(await loadEquivalences\(conn, orgId\)\)/, 'la carte est chargée une fois');
    const avanc = lire('lib/avancement.js');
    assert.match(avanc, /signeeDossier\(s, propres, eqMap\)/, 'le suivi lit la MÊME règle (jamais deux copies qui divergent)');
    assert.match(avanc, /signeeEntreprise\(s, propres, groupe, eqMap\)/);
});
