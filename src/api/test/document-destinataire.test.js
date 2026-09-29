/**
 * LE DESTINATAIRE D'UN JALON DE DOCUMENT (migration 190).
 *
 * Demandé le 2026-09-29 : un document remis (les CGV) peut être adressé à l'ENTREPRISE du stagiaire
 * OU au stagiaire, et ce choix se fait JALON PAR JALON dans le parcours — comme n'importe quel jalon.
 *
 * Ce fichier gèle ce qui rend le choix FIABLE :
 *   · adressé à l'entreprise qui a un ESPACE, le document sort du décompte du stagiaire (comme une
 *     étape facultative) mais reste visible, marqué « chez l'entreprise » ;
 *   · SANS espace entreprise, il revient au stagiaire — sinon personne ne pourrait le recevoir
 *     (même repli que les remises, `pourEntreprise`) ;
 *   · une REMISE garde son propre chemin (remiseEntreprise, 188) : le nouveau destinataire ne vise
 *     que les documents ;
 *   · le destinataire se lit dans CHAQUE forme de la cascade et par défaut vaut STAGIAIRE ;
 *   · le parcours de l'entreprise l'inclut même hors de sa section.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { computeDocParcours } = require('../lib/parcours.js');

const etape = (slug, extra = {}) => ({ slug, label: slug, doc_type: slug.toUpperCase(), ...extra });
const envoye = (slug) => ({ id: `d-${slug}`, type: slug.toUpperCase(), status: 'ENVOYE', template_slug: slug });

// ── Le décompte du stagiaire ─────────────────────────────────────────────────────────────────
test('un document adressé à l\'entreprise DOTÉE D\'UN ESPACE sort du décompte du stagiaire, et reste visible', () => {
    const steps = [etape('cgv', { destinataire: 'ENTREPRISE' }), etape('convention')];
    const p = computeDocParcours({ steps, docs: [envoye('convention')], entreprise: true });
    // La CGV ne compte pas : tout le dû (la convention) est fait, donc 100 %, mais les deux étapes restent affichées.
    assert.deepStrictEqual([p.done, p.total, p.percent], [1, 1, 100]);
    assert.strictEqual(p.steps.length, 2, 'la CGV reste visible dans le parcours');
    assert.strictEqual(p.steps[0].docEntreprise, true, 'marquée « chez l\'entreprise »');
    assert.strictEqual(p.currentKey, null, 'et jamais la prochaine étape');
});

test('SANS espace entreprise, le document revient au stagiaire (repli) et compte', () => {
    const steps = [etape('cgv', { destinataire: 'ENTREPRISE' }), etape('convention')];
    const p = computeDocParcours({ steps, docs: [envoye('convention')], entreprise: false });
    // La CGV redevient due côté stagiaire : 1 sur 2, et c'est elle la prochaine étape.
    assert.deepStrictEqual([p.done, p.total, p.percent], [1, 2, 50]);
    assert.strictEqual(p.steps[0].docEntreprise, false);
    assert.strictEqual(p.currentKey, p.steps[0].key, 'la CGV non reçue est la prochaine étape');
});

test('une REMISE à l\'entreprise garde SON chemin (remiseEntreprise), pas docEntreprise', () => {
    const steps = [{ slug: 'remise:r1', label: 'Attestation', doc_type: 'REMISE', remise_id: 'r1', destinataire: 'ENTREPRISE' }];
    const p = computeDocParcours({ steps, entreprise: true });
    assert.strictEqual(p.steps[0].remiseEntreprise, true, '188 : la remise garde son marqueur');
    assert.strictEqual(p.steps[0].docEntreprise, false, '190 ne double pas le chemin des remises');
});

test('facultatif ET entreprise s\'excluent tous les deux, sans se gêner', () => {
    const steps = [etape('a'), etape('cgv', { destinataire: 'ENTREPRISE' }), etape('b', { facultatif: true })];
    const p = computeDocParcours({ steps, docs: [envoye('a')], entreprise: true });
    assert.deepStrictEqual([p.done, p.total, p.percent], [1, 1, 100], 'seul « a » est dû');
});

// ── Le socle : lecture et écriture ───────────────────────────────────────────────────────────
const CTRL = fs.readFileSync(path.join(__dirname, '../controllers/formationProgram.controller.js'), 'utf8');

test('le destinataire est lu dans CHAQUE forme de la cascade, AVANT le facultatif, et vaut STAGIAIRE par défaut', () => {
    const corps = CTRL.slice(CTRL.indexOf('async function formationSteps'), CTRL.indexOf('async function enrollmentSteps'));
    // Les trois lectures de program_step le demandent (une cascade qui l'oublie perdrait le choix).
    assert.strictEqual((corps.match(/\$\{dest\}\$\{fac\} FROM program_step WHERE program_id = \?/g) || []).length, 3,
        '${dest} précède ${fac} pour ne pas casser le contrat de la 188');
    assert.match(corps, /, 'STAGIAIRE' AS destinataire/, 'sans la colonne, tout va au stagiaire');
    assert.strictEqual((corps.match(/destinataire: destinataire\(s\.slug\)/g) || []).length, 1, 'porté sur le jalon de document');
});

test('l\'enregistrement écrit le destinataire étape par étape, et DIT quand il ne le peut pas', () => {
    assert.match(CTRL, /UPDATE program_step SET destinataire = \?/);
    assert.match(CTRL, /aEcrire\[i\]\.destinataire === 'ENTREPRISE' \? 'ENTREPRISE' : 'STAGIAIRE'/);
    assert.match(CTRL, /migration 190 n'est pas jouée/, 'un « entreprise » non gardé est signalé, pas perdu');
    // Le message « facultatif » (188) reste EN TÊTE : un test de la 188 épingle ce début.
    assert.ok(CTRL.indexOf('migration 188') < CTRL.indexOf('migration 190'), '188 avant 190 dans les avertissements');
});

test('le parcours de l\'entreprise inclut un jalon adressé à l\'entreprise, même hors de sa section', () => {
    const co = fs.readFileSync(path.join(__dirname, '../controllers/company.controller.js'), 'utf8');
    const bloc = co.slice(co.indexOf('const getCompanyParcours = async'), co.indexOf('const getCompanyParcours = async') + 5000);
    assert.match(bloc, /s\.destinataire === 'ENTREPRISE' && !docSteps\.includes\(s\)/);
});

// ── L'écran ──────────────────────────────────────────────────────────────────────────────────
test('Formations : une case « Chez l\'entreprise » par jalon de document, envoyée dans le parcours', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../app/ui/pages/Formations.jsx'), 'utf8');
    assert.match(src, /function ChoixDestinataire\(/);
    // N'a de sens que sur un document (pas pièce, remise, QCM, émargement).
    assert.match(src, /function estDocumentAdressable\(s\)/);
    assert.match(src, /<ChoixDestinataire etapes=\{g\.steps\} onToggle=\{onToggleDestinataire\} \/>/);
    // Envoyé pour toutes les natures dans la charge utile du parcours.
    assert.strictEqual((src.match(/destinataire: s\.destinataire === "ENTREPRISE" \? "ENTREPRISE" : "STAGIAIRE"/g) || []).length, 2);
});

test('LA MIGRATION 190 et son revert', () => {
    const M = path.join(__dirname, '..', '..', '..', 'database', 'migrations');
    const lire = (f) => fs.readFileSync(path.join(M, f), 'utf8');
    const aller = lire('190_program_step_destinataire.sql');
    const retour = lire('190_revert_program_step_destinataire.sql');
    assert.match(aller, /ALTER TABLE program_step\s+ADD COLUMN IF NOT EXISTS destinataire varchar\(12\) NOT NULL DEFAULT 'STAGIAIRE';/);
    assert.match(retour, /ALTER TABLE program_step\s+DROP COLUMN IF EXISTS destinataire;/);
    for (const f of [aller, retour]) {
        // Le client SQL de l'organisme découpe sur « ; » (cf. la 146) : un seul, en fin d'instruction.
        assert.strictEqual((f.match(/;/g) || []).length, 1);
        assert.ok(!f.includes('\\'), 'aucune barre oblique inverse');
    }
});
