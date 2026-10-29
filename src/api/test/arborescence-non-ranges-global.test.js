/**
 * LE RÉCAPITULATIF « NON RANGÉS, TOUTES FORMATIONS » DE L'ÉDITEUR D'ARBORESCENCE (2026-10-29).
 *
 * LE PIÈGE. Une pièce du volet entreprise d'UNE seule formation (« Attestation contribution au faf »,
 * sur NIV1PRO/NIV2) n'apparaissait dans l'éditeur qu'en choisissant cette formation dans « Aperçu pour ».
 * L'éditeur s'ouvrant sur la première formation (RS7404), qui ne l'a pas, la pièce semblait absente — et
 * n'était donc rangée nulle part, sans qu'on le voie : pas dans l'archive, en silence.
 *
 * LA CORRECTION. Un récapitulatif EN TÊTE liste, toutes formations confondues, ce qui n'est rangé nulle
 * part (donc ne sera pas archivé), avec de quoi le placer sans changer de formation. Même règle que
 * l'aperçu par formation : seul l'« à ranger » compte (aCopier — les copies facultatives de l'entreprise
 * — n'y est PAS, il ne se perd pas, il vit dans l'arbre stagiaire).
 *
 * Le cœur est une fonction pure (lib/arborescence.js, front) ; le câblage de l'écran se lit au source.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const APP = path.join(__dirname, '..', '..', 'app', 'ui');
const lireUi = (p) => fs.readFileSync(path.join(APP, p), 'utf8');

/* Palette minimale : une PIÈCE du volet entreprise de NIV1PRO/NIV2 (le cas réel), un document de
   parcours de RS7404, et une CGV de GROUPE (company_level) de NIV1PRO. */
const documents = [
  { cle: 'ref:piece:faf', slug: 'piece:faf', label: 'Attestation contribution au faf', company_level: false, formations: [], formations_entreprise: ['NIV1PRO', 'NIV2'] },
  { cle: 'ref:contrat', slug: 'contrat', label: 'Contrat', company_level: false, formations: ['RS7404'], formations_entreprise: [] },
  { cle: 'ref:cgv', slug: 'cgv', label: 'CGV', company_level: true, formations: [], formations_entreprise: ['NIV1PRO'] },
];
const formations = [
  { code: 'RS7404', documents: ['ref:contrat'], documents_entreprise: [], documents_session: [] },
  { code: 'NIV1PRO', documents: [], documents_entreprise: ['ref:piece:faf', 'ref:cgv'], documents_session: [] },
  { code: 'NIV2', documents: [], documents_entreprise: ['ref:piece:faf'], documents_session: [] },
];
const VIDE = { folders: [] };

test('nonRangesToutesFormations (stagiaire) : la pièce du volet entreprise est listée, avec ses formations', async () => {
  const { nonRangesToutesFormations } = await import('../../app/ui/lib/arborescence.js');
  const stag = nonRangesToutesFormations(documents, formations, 'stagiaire', VIDE, new Map());
  const parCle = new Map(stag.map((d) => [d.cle, d]));
  // La pièce (volet entreprise, PAS un document de groupe) est « à ranger » côté stagiaire, toutes ses formations réunies.
  assert.ok(parCle.has('ref:piece:faf'), 'la pièce du volet entreprise apparaît sans choisir NIV1PRO');
  assert.deepEqual(parCle.get('ref:piece:faf').formations, ['NIV1PRO', 'NIV2']);
  assert.equal(parCle.get('ref:piece:faf').label, 'Attestation contribution au faf');
  // Le document de parcours de RS7404 aussi ; la CGV (groupe) NON — elle se range côté entreprise.
  assert.ok(parCle.has('ref:contrat'));
  assert.ok(!parCle.has('ref:cgv'), 'un document de groupe ne se perd pas côté stagiaire');
  // Trié par libellé.
  assert.deepEqual(stag.map((d) => d.cle), ['ref:piece:faf', 'ref:contrat']);
});

test('nonRangesToutesFormations (entreprise) : seuls les documents de groupe se perdent, pas les copies', async () => {
  const { nonRangesToutesFormations } = await import('../../app/ui/lib/arborescence.js');
  const ent = nonRangesToutesFormations(documents, formations, 'entreprise', VIDE, new Map());
  const cles = ent.map((d) => d.cle);
  assert.ok(cles.includes('ref:cgv'), 'la CGV (groupe) non rangée se perdrait : elle est listée');
  // La pièce est une COPIE facultative côté entreprise (aCopier) : elle n'est pas « perdue », elle vit côté stagiaire.
  assert.ok(!cles.includes('ref:piece:faf'), 'une copie facultative n\'entre pas dans « non rangé »');
});

test('nonRangesToutesFormations : un document rangé sort aussitôt du récapitulatif', async () => {
  const { nonRangesToutesFormations } = await import('../../app/ui/lib/arborescence.js');
  const arbre = { folders: [{ name: '{Stagiaire}', per_learner: true, items: [{ type: 'model', ref: 'piece:faf', label: 'x' }], children: [] }] };
  const apres = nonRangesToutesFormations(documents, formations, 'stagiaire', arbre, new Map());
  assert.ok(!apres.some((d) => d.cle === 'ref:piece:faf'), 'rangée = retirée du récapitulatif');
  assert.ok(apres.some((d) => d.cle === 'ref:contrat'), 'ce qui reste non rangé y demeure');
});

test('l\'éditeur calcule le récapitulatif global et le rend EN TÊTE, avec « Placer dans… »', () => {
  const ac = lireUi('components/ArborescenceCommune.jsx');
  // Calculé pour l'arbre du bon onglet (stagiaire ou entreprise) et passé à l'éditeur.
  assert.match(ac, /nonRangesToutesFormations\(documents, formations, kind, isEnt \? companyTree : tree, groupes\)/);
  assert.match(ac, /nonRangesGlobal=\{nonRangesGlobal\}/);

  const ed = lireUi('components/ArchiveTreeEditor.jsx');
  // Rendu en tête (avant l'arbre), chaque ligne réutilise « Placer dans… » (ligneAPlacer) + le repère des formations.
  assert.match(ed, /nonRangesGlobal = \[\]/);
  assert.match(ed, /nonRangesGlobal\.length > 0 &&/);
  assert.match(ed, /arbo-non-places global/);
  assert.match(ed, /nonRangesGlobal\.map\(\(d\) => ligneAPlacer\(d\.cle, d\.formations\.length \? <span className="arbo-doc-qui">\{d\.formations\.join\(", "\)\}<\/span> : null\)\)/);
  // Le bloc est AVANT l'arbre (en tête de l'éditeur), pas après les listes par formation.
  assert.ok(ed.indexOf('arbo-non-places global') < ed.indexOf('{folders.length === 0 ?'),
    'le récapitulatif global se rend avant l\'arbre');
});
