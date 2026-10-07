/**
 * LE « + OU » DU PARCOURS, LIMITÉ AUX ÉQUIVALENCES, ET SON COLLAPSE CÔTÉ ENTREPRISE.
 *
 * CE QU'ON GÈLE ICI, et pourquoi. Le « + OU » du parcours avait d'abord été RETIRÉ (PR #353) parce
 * qu'il créait une équivalence org-wide d'un simple clic dans UNE formation — une portée
 * surprenante. Mais le retirer entièrement a cassé le besoin réel : sur NIV1H, le devis
 * professionnel (document de GROUPE) devait pouvoir proposer sa variante AGEFICE en « OU ». La
 * demande, reformulée par l'école : « quand un document a une équivalence, proposer le + OU, et
 * ne pouvoir ajouter QUE les équivalences ».
 *
 * DEUX moitiés, gelées ici :
 *   1. AFFICHAGE / AJOUT (front, contrats de source) : le « + OU » revient mais BORNÉ — il
 *      n'apparaît que sur un document déjà déclaré interchangeable, ne propose QUE les autres
 *      membres du groupe, et n'écrit AUCUNE équivalence (il se borne à activer/ajouter au
 *      parcours). Dans la section ENTREPRISE comme dans le parcours du dossier.
 *   2. COLLAPSE (serveur, fonction pure) : le parcours entreprise est une liste EXPLICITE —
 *      `resoudreVariantesEntreprise` n'y collapse QUE les groupes « OU » (deux devis → un jalon,
 *      la variante applicable au financeur), sans jamais filtrer les étapes isolées par condition.
 *      C'est la différence avec `resoudreVariantes` (parcours du dossier), qui, lui, filtre.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { resoudreVariantes, resoudreVariantesEntreprise } = require('../controllers/formationProgram.controller.js');

const VIDE = new Map(); // ni conditions perso
// Les deux devis sont déclarés interchangeables (une équivalence d'organisme) sous le groupe « g ».
const EQ = new Map([
    ['devis-pro', { group: 'g' }],
    ['devis-agefice', { group: 'g' }],
]);
const devisPro = { slug: 'devis-pro', doc_type: 'DEVIS', company_level: true, applies_when: { financing: 'PROFESSIONNEL' } };
const devisAgefice = { slug: 'devis-agefice', doc_type: 'DEVIS', company_level: true, applies_when: { financing: 'PROFESSIONNEL', agefice: true } };
// Une étape ISOLÉE, dont la condition NE correspond PAS au dossier professionnel testé.
const conventionPart = { slug: 'convention', doc_type: 'CONVENTION', applies_when: { financing: 'PARTICULIER' } };
const slugs = (out) => out.map((s) => s.slug);

/* ─── Serveur : resoudreVariantesEntreprise (fonction pure) ──────────────────────────────────── */

test('un groupe « OU » du volet entreprise se réduit à la variante applicable au financeur', () => {
    const ctx = { financing: 'PROFESSIONNEL', agefice: true };
    const out = resoudreVariantesEntreprise([devisPro, devisAgefice], ctx, VIDE, EQ);
    assert.deepStrictEqual(slugs(out), ['devis-agefice'],
        'AGEFICE ⇒ la variante AGEFICE (la plus spécifique qui s\'applique), un seul jalon');

    const sansAgefice = resoudreVariantesEntreprise([devisPro, devisAgefice], { financing: 'PROFESSIONNEL', agefice: false }, VIDE, EQ);
    assert.deepStrictEqual(slugs(sansAgefice), ['devis-pro'], 'sans AGEFICE ⇒ le devis professionnel ordinaire');
});

test('aucune variante ne s\'applique ⇒ la première du groupe, marquée repli (jalon jamais perdu)', () => {
    const out = resoudreVariantesEntreprise([devisPro, devisAgefice], { financing: 'PARTICULIER' }, VIDE, EQ);
    assert.deepStrictEqual(slugs(out), ['devis-pro'], 'le jalon reste visible, sur sa première variante');
    assert.strictEqual(out[0].repli, true, 'mais marqué repli : visible, jamais exigé');
});

test('LA DIFFÉRENCE AVEC LE PARCOURS DU DOSSIER : une étape isolée n\'est JAMAIS filtrée par condition', () => {
    /* C'est le cœur du collapse entreprise. La section est une liste choisie à la main : un
       document qu'on y a mis doit y rester, même si sa condition ne colle pas au dossier. Le
       parcours du dossier, lui (resoudreVariantes), l'écarterait — on gèle les deux comportements
       côte à côte pour que la différence ne se perde pas en refactorant. */
    const ctx = { financing: 'PROFESSIONNEL' };
    const entreprise = resoudreVariantesEntreprise([conventionPart], ctx, VIDE, EQ);
    assert.deepStrictEqual(slugs(entreprise), ['convention'], 'volet entreprise : conservée telle quelle');

    const dossier = resoudreVariantes([{ ...conventionPart, active: true }], ctx, VIDE, EQ);
    assert.deepStrictEqual(slugs(dossier), [], 'parcours du dossier : filtrée, car sa condition ne matche pas');
});

test('un seul membre du groupe présent dans la section ⇒ pas de « OU », l\'étape reste', () => {
    const out = resoudreVariantesEntreprise([devisPro, conventionPart], { financing: 'PROFESSIONNEL', agefice: true }, VIDE, EQ);
    // devis-pro est seul membre présent de « g » (agefice absent) ⇒ gardé ; convention isolée ⇒ gardée.
    assert.deepStrictEqual(slugs(out), ['devis-pro', 'convention']);
});

test('sans équivalence (eqMap vide), le collapse est l\'identité', () => {
    const steps = [devisPro, devisAgefice, conventionPart];
    assert.deepStrictEqual(resoudreVariantesEntreprise(steps, { financing: 'PROFESSIONNEL' }, VIDE, new Map()), steps,
        'rien à collapser ⇒ la liste revient telle quelle');
});

test('l\'ordre du jalon suit sa PREMIÈRE variante rencontrée', () => {
    // convention d'abord, puis les deux devis : le jalon « OU » se place à la position du 1er devis.
    const out = resoudreVariantesEntreprise([conventionPart, devisPro, devisAgefice], { financing: 'PROFESSIONNEL', agefice: true }, VIDE, EQ);
    assert.deepStrictEqual(slugs(out), ['convention', 'devis-agefice'], 'un jalon, à la place du premier membre');
});

/* ─── Serveur : les deux appelants passent bien par le collapse ──────────────────────────────── */

test('le collapse du volet entreprise est appelé des DEUX côtés, avec le contexte du dossier', () => {
    const avanc = fs.readFileSync(path.join(__dirname, '..', 'lib/avancement.js'), 'utf8');
    assert.match(avanc, /steps = resoudreVariantesEntreprise\(ent\.steps, ctx, condById, eqMap\)/,
        'avancementDossiers : collapse du volet entreprise (Suivi, tableau de bord, pipeline)');
    const enr = fs.readFileSync(path.join(__dirname, '..', 'controllers/enrollment.controller.js'), 'utf8');
    assert.match(enr, /resoudreVariantesEntreprise\(ent\.steps, ctx, condById, eqMap\)/,
        'fiche dossier : même collapse, même contexte');
});

/* ─── Écran : le « + OU » revient, BORNÉ aux équivalences, dans les deux parcours ───────────────── */

const PAGE = fs.readFileSync(path.join(__dirname, '..', '..', 'app/ui/pages/Formations.jsx'), 'utf8');

test('la fenêtre connaît les AUTRES membres d\'un groupe (membresDuGroupe lit la liste des équivalences)', () => {
    assert.match(PAGE, /setEqMap\(m\); setEquivs\(list\);/, 'reloadEq garde la liste des équivalences');
    assert.match(PAGE, /const membresDuGroupe = \(slug\) => \{/, 'le helper existe');
    assert.match(PAGE, /equivs\.find\(\(e\) => e\.key === g\.group\)/, 'il retrouve le groupe par sa clé');
});

test('le « + OU » ne propose QUE les membres de l\'équivalence, et n\'écrit aucune équivalence', () => {
    // Parcours du dossier : candidats = membres du groupe, inactifs, non document de groupe.
    assert.match(PAGE, /groupeMembres\(g\.steps\[0\]\.slug\)\s*\n?\s*\.map\(\(sl\) => steps\.find/, 'candidats « OU » = membres du groupe');
    assert.match(PAGE, /\.filter\(\(x\) => x && !x\.active && !x\.company_level\)/, 'parcours du dossier : hors docs de groupe');
    // Jamais d'écriture d'équivalence depuis le parcours (ça reste dans Modèles → Équivalences).
    assert.doesNotMatch(PAGE, /createEquivalence|updateEquivalence|deleteEquivalence/, 'aucune écriture d\'équivalence');
});

test('la section ENTREPRISE groupe ses jalons « OU » et porte le même « + OU » borné', () => {
    // CompanySection reçoit de quoi grouper et proposer les variantes.
    assert.match(PAGE, /<CompanySection[^>]*eqMap=\{eqMap\} groupeMembres=\{membresDuGroupe\}/s,
        'CompanySection reçoit eqMap + groupeMembres');
    assert.match(PAGE, /const groups = groupMilestones\(chosen, eqMap\);/, 'elle groupe les variantes en jalons « OU »');
    // Ses candidats « OU » : membres du groupe pas encore dans la section (value = company_steps).
    assert.match(PAGE, /const candidatsOu = \(lead\) =>/, 'la liste des candidats « OU » entreprise');
    assert.match(PAGE, /\.filter\(\(sl\) => !value\.includes\(sl\)\)/, 'déjà présents exclus');
    // L'ajout n'écrit rien d'org-wide : il ne touche que company_steps.
    assert.match(PAGE, /const addOu = \(slug\) => \{ onChange\(\[\.\.\.value\.filter\(\(x\) => x !== slug\), slug\]\); setOuFor\(null\); \};/,
        'le « + OU » entreprise n\'ajoute qu\'au parcours entreprise');
});

test('le « + OU » écarte QCM, émargement, pièces et remises (pas d\'équivalence pour eux)', () => {
    // Des deux côtés : la condition du bouton liste ces exclusions.
    assert.match(PAGE, /!g\.steps\[0\]\.quiz_id\s*\n?\s*&& g\.steps\[0\]\.doc_type !== "EMARGEMENT" && g\.steps\[0\]\.doc_type !== "PIECE"\s*\n?\s*&& g\.steps\[0\]\.doc_type !== "REMISE"/,
        'parcours du dossier : QCM / émargement / pièce / remise exclus');
    assert.ok((PAGE.match(/doc_type !== "REMISE"/g) || []).length >= 2, 'exclusion présente dans les deux parcours');
});
