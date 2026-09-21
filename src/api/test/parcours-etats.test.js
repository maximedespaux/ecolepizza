/**
 * LE PARCOURS MONTRE L'ÉTAT RÉEL DE CHAQUE ÉTAPE, QUEL QUE SOIT SON RANG.
 *
 * Demandé le 2026-09-21 : « au lieu de la coche orange, distinguer pas fait, envoyé, reçu et
 * validé — et même si ce n'est pas fait dans l'ordre, ne pas griser : montrer l'état de l'étape ».
 *
 * LE DÉFAUT. Le parcours ne connaissait que le RANG : faite, en cours, à venir. Tout ce qui
 * précédait la première étape manquante portait la même coche orange ; tout ce qui la suivait
 * était grisé « à venir » — une pièce déposée ou une convention signée en avance s'affichaient
 * comme si rien n'avait eu lieu. Et l'AVANCEMENT comptait le même rang : une convention signée
 * derrière une carte d'identité manquante « n'était jamais comptée », et un dossier fait à 11
 * étapes sur 12 pouvait afficher 0 %.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { computeDocParcours, etatDeGroupe } = require('../lib/parcours.js');

const etatDe = (step, extra = {}) => computeDocParcours({ steps: [step], ...extra }).steps[0].etat;
const DOC = { slug: 'cgv', label: 'CGV', doc_type: 'CGV' };                                  // sans signature
const SIGNE = { slug: 'contrat', label: 'Contrat', doc_type: 'CONTRAT', stagiaire_sign: 1 };  // à signer
const QCM = { slug: 'q', label: 'Test', quiz_id: 'qz1' };
const PIECE = { slug: 'piece:1', label: 'Pièce d\'identité', piece_id: 'pt-1' };
const REMISE = { slug: 'remise:r1', label: 'OPCO', remise_id: 'r1' };
const doc = (type, status, extra = {}) => ({ docs: [{ id: 'd', template_slug: null, type, status, ...extra }] });

test('UN DOCUMENT : à faire, envoyé (s\'il attend une signature), validé', () => {
    assert.strictEqual(etatDe(DOC), 'A_FAIRE', 'rien de produit');
    assert.strictEqual(etatDe(DOC, doc('CGV', 'A_FAIRE')), 'A_FAIRE', 'préparé mais pas parti');
    /* Un document SANS signature est fait dès qu'il part : il n'attend personne. L'afficher
       « envoyé » le laisserait bleu pour toujours. */
    assert.strictEqual(etatDe(DOC, doc('CGV', 'ENVOYE')), 'VALIDE');
    assert.strictEqual(etatDe(SIGNE, doc('CONTRAT', 'ENVOYE')), 'ENVOYE', 'parti, la signature est attendue');
    assert.strictEqual(etatDe(SIGNE, doc('CONTRAT', 'CONSULTE')), 'ENVOYE', 'ouvert ne veut pas dire signé');
    assert.strictEqual(etatDe(SIGNE, doc('CONTRAT', 'SIGNE')), 'VALIDE');
});

test('UN QCM : envoyé tant que le stagiaire n\'a pas répondu', () => {
    const qcm = (status) => ({ docs: [{ id: 'q', quiz_id: 'qz1', status }] });
    assert.strictEqual(etatDe(QCM), 'A_FAIRE');
    assert.strictEqual(etatDe(QCM, qcm('ENVOYE')), 'ENVOYE');
    assert.strictEqual(etatDe(QCM, qcm('SIGNE')), 'VALIDE');
});

test('UNE PIÈCE : REÇUE quand le stagiaire l\'a déposée — c\'est à l\'école de la vérifier', () => {
    const piece = (st) => etatDe(PIECE, { pieces: st ? { 'pt-1': st } : {} });
    assert.strictEqual(piece(null), 'A_FAIRE');
    assert.strictEqual(piece('DEPOSEE'), 'RECU');
    assert.strictEqual(piece('VALIDEE'), 'VALIDE');
    assert.strictEqual(piece('REFUSEE'), 'A_FAIRE', 'refusée : elle est à renvoyer');
});

test('UNE REMISE : envoyée tant que le stagiaire n\'a pas accusé réception', () => {
    const remise = (r) => etatDe(REMISE, { remises: r ? { r1: r } : {} });
    assert.strictEqual(remise(null), 'A_FAIRE');
    assert.strictEqual(remise({ id: 'x', statut: 'REMISE' }), 'ENVOYE');
    assert.strictEqual(remise({ id: 'x', statut: 'RECUE' }), 'VALIDE');
    assert.strictEqual(remise({ id: 'x', statut: 'ATTENDUE', sans_objet: 1 }), 'SANS_OBJET');
});

test('HORS DE L\'ORDRE : une étape faite en avance est VALIDÉE, et elle COMPTE', () => {
    /* La configuration exacte du défaut : la pièce d'identité manque, la convention derrière elle
       est déjà signée. */
    const steps = [
        { slug: 'devis', label: 'Devis', doc_type: 'DEVIS' },
        PIECE,
        { slug: 'convention', label: 'Convention', doc_type: 'CONVENTION', stagiaire_sign: 1 },
        { slug: 'attestation', label: 'Attestation', doc_type: 'ATTESTATION' },
    ];
    const docs = [{ id: 'd1', type: 'DEVIS', status: 'ENVOYE' }, { id: 'd2', type: 'CONVENTION', status: 'SIGNE' }];
    const p = computeDocParcours({ steps, docs, pieces: { 'pt-1': 'DEPOSEE' } });
    assert.deepStrictEqual(p.steps.map((s) => s.etat), ['VALIDE', 'RECU', 'VALIDE', 'A_FAIRE']);
    assert.strictEqual(p.steps[2].status, 'todo', 'son RANG reste « à venir » — c\'est lui qu\'on n\'affiche plus');
    assert.strictEqual(p.percent, 50, 'devis et convention : deux étapes faites sur quatre');
    assert.strictEqual(p.done, 2);
    assert.strictEqual(p.currentKey, 'piece:1', 'la PROCHAINE étape reste la première non faite (colonne du pipeline)');
});

test('LE PARCOURS D\'UNE ENTREPRISE suit la même règle, d\'après ses compteurs', () => {
    assert.strictEqual(etatDeGroupe({ done: true, gen: 2, total: 2 }), 'VALIDE');
    assert.strictEqual(etatDeGroupe({ done: false, gen: 1, total: 2 }), 'ENVOYE');
    assert.strictEqual(etatDeGroupe({ done: false, gen: 0, total: 2 }), 'A_FAIRE');
    assert.strictEqual(etatDeGroupe({ done: false, gen: 0, total: 0 }), 'SANS_OBJET', 'aucun stagiaire concerné');
    const CO = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'company.controller.js'), 'utf8');
    assert.match(CO, /s\.etat = etatDeGroupe\(\{ done: s\._done, gen: s\.gen, total: s\.total \}\);/);
    assert.match(CO, /percent: pourcentFait\(faites, steps\.length\),/, 'plus de pourcentage au rang');
});

test('DEUX NOMBRES, DEUX SENS : les étapes faites (Suivi) et le rang de la prochaine (pipeline)', () => {
    const lire = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
    const av = lire('lib/avancement.js');
    assert.match(av, /const done = parc\.done;\s+const etape = parc\.currentIndex;/);
    assert.match(lire('controllers/session.controller.js'), /done: a\.done, etape: a\.etape,/);
    assert.match(fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'pages', 'Pipeline.jsx'), 'utf8'),
        /Étape \{Math\.min\(\(r\.etape \?\? r\.done\) \+ 1, r\.total\)\}/, '« Étape 3/12 » est un RANG');
});

test('L\'ÉCRAN AFFICHE L\'ÉTAT, plus le rang : ni coche orange, ni gris « à venir »', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'components', 'EnrollmentParcours.jsx'), 'utf8');
    for (const [etat, mot] of [['A_FAIRE', 'À faire'], ['ENVOYE', 'Envoyé'], ['RECU', 'Reçu'], ['VALIDE', 'Validé']]) {
        assert.match(src, new RegExp(`${etat}: \\{ libelle: "${mot}"`), `${etat} a son mot — jamais la seule couleur`);
    }
    assert.doesNotMatch(src, /grayscale/, 'le gris « à venir » a disparu');
    assert.doesNotMatch(src, /linear-gradient\(135deg,#c0392b,#e0932e\)/, 'la tuile orange uniforme aussi');
    assert.match(src, /className=\{`parc-tuile \$\{e\.classe\}`\}/, 'la tuile prend la couleur de SON état');
    assert.doesNotMatch(src, /s\.status !== "current" && s\.status !== "todo"/, 'l\'action ne dépend plus du rang');
    assert.match(src, /if \(etat === "VALIDE" \|\| etat === "SANS_OBJET"\) return null;/);
    const css = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'styles', 'app.css'), 'utf8');
    assert.match(css, /\.parc-tuile\.valide\{background:var\(--green-bg\);color:var\(--green\)\}/, 'couleurs du thème, clair et sombre');
});
