/**
 * UN MODÈLE NEUF N'ENTRE PLUS DANS LES PARCOURS TOUT SEUL.
 *
 * SIGNALÉ PAR L'ORGANISME le 2026-09-16 : « quand je crée un nouveau modèle de document, il est
 * toujours ajouté au parcours documentaire des formations — si j'oublie de vérifier, il est
 * toujours ajouté ».
 *
 * POURQUOI ÇA ARRIVAIT, et ce n'était pas un bug mais un défaut de conception. Le parcours d'une
 * formation n'est pas une liste stockée : il se DÉDUIT. Tout modèle actif dont les conditions
 * correspondent à la formation en est candidat, et `program_step` ne sert que d'EXCEPTION —
 * réordonner, ou désactiver. Sans exception enregistrée, l'étape était active :
 *
 *     active: o ? !!o.active : true
 *
 * Or un modèle qu'on vient de créer n'a aucune condition, et `applies_when` vide correspond à
 * TOUTES les formations. Créer un modèle l'ajoutait donc, actif, partout à la fois.
 *
 * LE DÉFAUT S'INVERSE POUR LES SEULS NOUVEAUX. Rien de ce qui existe ne bouge : c'est la
 * propriété la plus importante de ce lot, et la première que ces tests vérifient.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const BASE = path.join(API, '..', '..', 'database');
const sansCommentaires = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
const TEMPLATE = sansCommentaires(fs.readFileSync(path.join(API, 'controllers/template.controller.js'), 'utf8'));
const PROGRAM = sansCommentaires(fs.readFileSync(path.join(API, 'controllers/formationProgram.controller.js'), 'utf8'));
const MIG = fs.readFileSync(path.join(BASE, 'migrations', '155_modele_hors_parcours.sql'), 'utf8');

const { mergeSteps } = require('../lib/documents.js');

test('RIEN DE CE QUI EXISTE NE BOUGE', () => {
    /* LA PROPRIÉTÉ CAPITALE. La colonne arrive avec DEFAULT 1 : tous les modèles déjà en base
       la reçoivent à 1, donc restent dans les parcours où ils sont. Un DEFAULT 0 aurait vidé
       d'un coup le parcours documentaire de toutes les formations — des dizaines de documents
       qui cessent d'être produits, sans que personne ne l'ait demandé. */
    assert.match(MIG, /ADD COLUMN IF NOT EXISTS parcours_defaut TINYINT\(1\) NOT NULL DEFAULT 1/);
    assert.ok(!/UPDATE document_template/i.test(MIG), 'la migration ne touche à aucune ligne existante');
    assert.ok(!/DELETE|DROP TABLE|TRUNCATE/i.test(MIG));
});

test('LE SOCLE ENTRE TOUJOURS DANS LES PARCOURS', () => {
    /* Les documents du socle — convention, attestation, émargement… — sont ceux que TOUTE
       formation doit produire. Les faire basculer en opt-in aurait été le même désastre que le
       DEFAULT 0, par un autre chemin. */
    const socle = mergeSteps([]).filter((s) => s.is_default);
    assert.ok(socle.length > 0, 'le socle doit exister');
    assert.ok(socle.every((s) => s.parcours_defaut === 1),
        'aucun document du socle ne doit devenir optionnel');
});

test('UN MODÈLE SANS LA COLONNE SE COMPORTE COMME AVANT', () => {
    /* Le code doit marcher AVANT la migration (CLAUDE.md § 2.1) : `parcours_defaut` absent de la
       ligne lue, l'étape reste candidate — sinon jouer le code sans la migration viderait les
       parcours, exactement ce qu'on cherche à éviter. */
    const [m] = mergeSteps([{ slug: 'mon-modele', label: 'Mon modèle', doc_type: 'AUTRE' }])
        .filter((s) => s.slug === 'mon-modele');
    assert.strictEqual(m.parcours_defaut, 1);
});

test('LE RÉGLAGE DU MODÈLE VOYAGE JUSQU\'À L\'ÉTAPE', () => {
    const [m] = mergeSteps([{ slug: 'neuf', label: 'Neuf', doc_type: 'AUTRE', parcours_defaut: 0 }])
        .filter((s) => s.slug === 'neuf');
    assert.strictEqual(m.parcours_defaut, 0, 'sans quoi le parcours ne pourrait pas en tenir compte');
});

test('LE PARCOURS SUIT LE MODÈLE, SAUF EXCEPTION ENREGISTRÉE', () => {
    /* L'ordre compte : une exception `program_step` l'emporte TOUJOURS. C'est elle qui permet
       d'activer un modèle opt-in sur la formation qu'on veut — sans elle, le nouveau défaut
       serait une interdiction, et non un défaut. */
    assert.match(PROGRAM, /active: o \? !!o\.active : s\.parcours_defaut !== 0/);
    assert.ok(!/active: o \? !!o\.active : true,\s*\n\s*\};\s*\n\s*\}\);\s*\n\s*\n\s*\/\* PIÈCES/.test(PROGRAM),
        'le « toujours actif » des documents est remplacé');
});

test('LA COLONNE EST POSÉE À LA CRÉATION, JAMAIS À LA MISE À JOUR', () => {
    /* LE PIÈGE. La même fonction sert aux deux : poser `parcours_defaut = 0` dans la branche de
       mise à jour aurait retiré de TOUS les parcours un modèle qu'on vient simplement de
       réenregistrer — un document qui cesse d'être produit parce qu'on a corrigé une virgule. */
    const zone = TEMPLATE.slice(TEMPLATE.indexOf('const id = crypto.randomUUID()'),
        TEMPLATE.indexOf('return id;'));
    assert.match(zone, /\[\.\.\.keys, 'parcours_defaut'\]/, 'ajoutée aux colonnes de l\'INSERT');
    assert.match(zone, /\[\.\.\.keys\.map\(\(k\) => f\[k\]\), 0\]/, 'et à 0');
    const maj = TEMPLATE.slice(TEMPLATE.indexOf('if (ex.length)'), TEMPLATE.indexOf('const id = crypto.randomUUID()'));
    assert.ok(!/parcours_defaut/.test(maj),
        'la branche de mise à jour ne doit JAMAIS toucher à ce réglage');
});

test('L\'INSERT RETOMBE SUR SES PATTES SI LA MIGRATION N\'EST PAS JOUÉE', () => {
    const zone = TEMPLATE.slice(TEMPLATE.indexOf('const insere = async'));
    assert.match(zone, /e\.code !== 'ER_BAD_FIELD_ERROR'/);
    assert.match(zone, /await insere\(false\)/, 'on réinsère sans la colonne plutôt que d\'échouer');
});

test('LA COLONNE EST LUE, EN TÊTE DE CASCADE', () => {
    assert.match(TEMPLATE, /', company_level, company_sign, signers, buyer_audience, parcours_defaut'/);
    /* La combinaison SANS la colonne doit rester juste en dessous : c'est elle qui sauve une
       base où la 155 n'est pas jouée. */
    assert.match(TEMPLATE, /parcours_defaut',\s*\n\s*', company_level, company_sign, signers, buyer_audience',/);
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
   LES QCM SUIVENT LA MÊME RÈGLE (migration 156).

   LE CAS QUI POSAIT PROBLÈME était plus vicieux que pour les documents. Un QCM est candidat au
   parcours d'une formation s'il lui est rattaché OU s'il ne l'est à AUCUNE
   (`program_id = ? OR program_id IS NULL`). Le second cas le rendait candidat PARTOUT — et
   actif par défaut. Or la duplication crée volontairement un QCM non rattaché, « pour pouvoir
   l'ajouter partout » : dupliquer un QCM peuplait donc le parcours de chaque formation d'un
   seul coup.

   DEUX NOTIONS ÉTAIENT CONFONDUES : `program_id` dit QUI PEUT l'utiliser, `parcours_defaut` s'il
   y entre TOUT SEUL. L'éligibilité entraînait l'appartenance ; elle ne l'entraîne plus. */
const QUIZ = sansCommentaires(fs.readFileSync(path.join(API, 'controllers/quiz.controller.js'), 'utf8'));
const MIG156 = fs.readFileSync(path.join(BASE, 'migrations', '156_qcm_hors_parcours.sql'), 'utf8');

test('QCM : rien de ce qui existe ne bouge non plus', () => {
    assert.match(MIG156, /ADD COLUMN IF NOT EXISTS parcours_defaut TINYINT\(1\) NOT NULL DEFAULT 1/);
    assert.ok(!/UPDATE quiz|DELETE|DROP TABLE|TRUNCATE/i.test(MIG156),
        'aucune formation ne doit perdre son test de positionnement ni ses évaluations formatives');
});

test('QCM : le parcours suit le réglage du QCM, sauf exception enregistrée', () => {
    assert.match(PROGRAM, /active: o \? !!o\.active : q\.parcours_defaut !== 0/);
    assert.ok(!/active: o \? !!o\.active : true/.test(PROGRAM),
        'plus aucun « toujours actif » : documents ET QCM sont passés au réglage');
});

test('QCM : la colonne est lue, avec un repli si la 156 n\'est pas jouée', () => {
    const zone = PROGRAM.slice(PROGRAM.indexOf('const selQuiz'));
    assert.match(zone, /selQuiz\(', parcours_defaut'\)/);
    assert.match(zone, /e\.code !== 'ER_BAD_FIELD_ERROR'/);
    assert.match(zone, /selQuiz\(''\)/, 'sans la colonne, on relit sans — le parcours reste lisible');
});

test('QCM : création ET duplication naissent hors parcours', () => {
    /* LA DUPLICATION COMPTE AUTANT QUE LA CRÉATION, et c'est même elle qui faisait le plus de
       dégâts : elle crée un QCM NON RATTACHÉ, donc candidat dans toutes les formations. */
    for (const [quoi, fn] of [['création', 'insere'], ['duplication', 'dupliquer']]) {
        const zone = QUIZ.slice(QUIZ.indexOf(`const ${fn} = `));
        assert.match(zone, /avecDefaut \? ', parcours_defaut' : ''/, `${quoi} : la colonne est posée`);
        assert.match(zone, /avecDefaut \? ', 0' : ''/, `${quoi} : et à 0`);
        assert.match(zone, new RegExp(`await ${fn}\\(false\\)`), `${quoi} : repli sans la colonne`);
        assert.match(zone, new RegExp(`try \\{ await ${fn}\\(true\\); \\}`), `${quoi} : et la fonction est APPELÉE`);
    }
});

test('QCM : le rattachement reste ce qui dit QUI PEUT l\'utiliser', () => {
    /* La colonne ne remplace pas `program_id` : un QCM rattaché à une formation reste invisible
       des autres. On sépare éligibilité et appartenance, on ne fusionne pas les deux. */
    assert.match(PROGRAM, /\(program_id = \? OR program_id IS NULL\)/,
        'le filtre de rattachement est conservé tel quel');
});
