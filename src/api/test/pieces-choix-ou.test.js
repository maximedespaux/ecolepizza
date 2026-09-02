/**
 * PIÈCES À FOURNIR EN « OU », CHOISIES PAR CONDITION DU DOSSIER.
 *
 * « Pièce d'identité OU justificatif » : le stagiaire ne fournit que la variante qui correspond
 * à son dossier. Contrairement au « OU » des documents (équivalences d'organisme, conditions
 * GLOBALES), une pièce n'a aucune définition globale : sa condition vit sur `program_step`, PAR
 * FORMATION (migration 140), et le regroupement sur `program_step.or_group` (migration 052).
 *
 * On gèle ici le CŒUR : `resoudreVariantes`, la résolution PURE des choix « OU ». Deux invariants
 * délicats et faciles à casser en retouchant la résolution :
 *   · une pièce est groupée par SON or_group (par formation), pas par les équivalences d'organisme ;
 *   · son espace de noms est DISJOINT de celui des documents (préfixe « piece: ») — sans quoi une
 *     pièce et un document au même identifiant de groupe fusionneraient en un seul jalon.
 */
const test = require('node:test');
const assert = require('node:assert');
const { resoudreVariantes } = require('../controllers/formationProgram.controller.js');

const VIDE = new Map(); // ni conditions perso, ni équivalences d'organisme
const slugs = (out) => out.map((s) => s.slug).sort();

test('un groupe « OU » de pièces garde la variante qui correspond au dossier', () => {
    // Deux pièces interchangeables (même or_group). L'identité est conditionnée « PROFESSIONNEL » ;
    // le justificatif n'a aucune condition → variante par défaut.
    const identite = { slug: 'piece:aaa', doc_type: 'PIECE', or_group: 'id-justif', applies_when: { financing: 'PROFESSIONNEL' }, active: true };
    const justif = { slug: 'piece:bbb', doc_type: 'PIECE', or_group: 'id-justif', applies_when: {}, active: true };

    const pro = resoudreVariantes([identite, justif], { financing: 'PROFESSIONNEL' }, VIDE, VIDE);
    assert.deepStrictEqual(pro.map((s) => s.slug), ['piece:aaa'], 'dossier PRO ⇒ pièce d\'identité');

    const part = resoudreVariantes([identite, justif], { financing: 'PARTICULIER' }, VIDE, VIDE);
    assert.deepStrictEqual(part.map((s) => s.slug), ['piece:bbb'], 'dossier PARTICULIER ⇒ justificatif (défaut)');
});

test('aucune variante ne s\'applique ⇒ la première du groupe (jalon jamais perdu)', () => {
    const a = { slug: 'piece:aaa', doc_type: 'PIECE', or_group: 'g', applies_when: { financing: 'PROFESSIONNEL' }, active: true };
    const b = { slug: 'piece:bbb', doc_type: 'PIECE', or_group: 'g', applies_when: { financing: 'CPF' }, active: true };
    const out = resoudreVariantes([a, b], { financing: 'PARTICULIER' }, VIDE, VIDE);
    assert.deepStrictEqual(out.map((s) => s.slug), ['piece:aaa'], 'aucune condition ne matche ⇒ défaut = première');
});

test('une pièce SANS or_group reste une étape autonome', () => {
    const seule = { slug: 'piece:x', doc_type: 'PIECE', or_group: null, applies_when: {}, active: true };
    assert.deepStrictEqual(resoudreVariantes([seule], {}, VIDE, VIDE).map((s) => s.slug), ['piece:x']);
});

test('deux pièces d\'or_group DIFFÉRENTS ne se regroupent pas', () => {
    const a = { slug: 'piece:a', doc_type: 'PIECE', or_group: 'g1', applies_when: {}, active: true };
    const b = { slug: 'piece:b', doc_type: 'PIECE', or_group: 'g2', applies_when: {}, active: true };
    assert.deepStrictEqual(slugs(resoudreVariantes([a, b], {}, VIDE, VIDE)), ['piece:a', 'piece:b']);
});

test('espaces DISJOINTS : une pièce n\'est jamais fusionnée avec un document de même identifiant de groupe', () => {
    // Le document « devis » est dans le groupe d'équivalence « g ». Une pièce a or_group « g ».
    // Le préfixe « piece: » garantit deux groupes distincts ⇒ deux jalons, pas un.
    const doc = { slug: 'devis', doc_type: 'DEVIS', applies_when: {}, active: true };
    const piece = { slug: 'piece:p', doc_type: 'PIECE', or_group: 'g', applies_when: {}, active: true };
    const eqDoc = new Map([['devis', { group: 'g' }]]);
    assert.deepStrictEqual(slugs(resoudreVariantes([doc, piece], {}, VIDE, eqDoc)), ['devis', 'piece:p']);
});
