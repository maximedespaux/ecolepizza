/**
 * PLUSIEURS GRILLES D'ÉVALUATION PRATIQUE POUR UNE MÊME FORMATION (demandé le 2026-09-23).
 *
 * « On ne note pas le travail de la pâte comme la conduite du four » : l'école voulait pouvoir
 * poser plusieurs intitulés de grille sur une formation, chacun avec ses exercices et son seuil.
 * La table le permettait DÉJÀ (aucune migration) — c'est le code qui n'en lisait qu'une.
 *
 * CE QUE CES TESTS GÈLENT :
 *   · on écrit LA grille visée, jamais « la première » quand un identifiant est donné ;
 *   · une grille demandée est vérifiée (organisme, formation, rôle) avant d'être servie ;
 *   · l'ancien écran, qui n'envoie pas d'identifiant, met toujours à jour au lieu de créer un
 *     doublon silencieux à chaque enregistrement ;
 *   · retirer une grille la DÉSACTIVE : les notes restent ;
 *   · le jury n'en a toujours qu'une ;
 *   · avec plusieurs grilles, rien ne se rattrape de l'une à l'autre, et la grille du JURY ne
 *     décide plus de « évaluation réussie » — elle le faisait une fois sur deux.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const cheminDb = require.resolve('../config/database.js');

/* ── BASE FACTICE ────────────────────────────────────────────────────────────────────────────
   Une formation, DEUX grilles de formateur et une de jury. */
const PATE = { id: 'g-pate', program_id: 'p-1', role: 'FORMATEUR', label: 'Évaluation pratique — pâte', pass_score: 70, template_slug: null, active: 1 };
const FOUR = { id: 'g-four', program_id: 'p-1', role: 'FORMATEUR', label: 'Évaluation pratique — four', pass_score: 60, template_slug: 'attestation-four', active: 1 };
const JURY = { id: 'g-jury', program_id: 'p-1', role: 'JURY', label: 'Grille du jury', pass_score: null, template_slug: 'grille-jury', active: 1 };
const GRILLES = [PATE, FOUR, JURY];

let ecrits = [];
const faux = {
    promise: () => ({
        query: async (sql, params) => {
            if (/information_schema/i.test(sql)) return [[{ n: 1 }]];              // la 149 est jouée
            if (/FROM training_program WHERE id = \?/i.test(sql)) return [[{ id: 'p-1' }]];
            /* Une grille par identifiant : la fausse base APPLIQUE les filtres de la requête,
               sans quoi un test resterait vert alors que le serveur ne vérifie plus rien. */
            if (/FROM evaluation_grille\s+WHERE id = \?/i.test(sql) || /SELECT id FROM evaluation_grille WHERE id = \?/i.test(sql)) {
                const [id, org, prog, role] = params;
                const g = GRILLES.find((x) => x.id === id);
                const ok = g && org === 'o1' && (prog === undefined || g.program_id === prog)
                    && (role === undefined || g.role === role) && g.active === 1;
                return [ok ? [g] : []];
            }
            if (/FROM evaluation_grille WHERE id = \? AND organization_id = \?/i.test(sql)) {
                const g = GRILLES.find((x) => x.id === params[0]);
                return [g && params[1] === 'o1' ? [g] : []];
            }
            if (/FROM evaluation_grille[\s\S]*ORDER BY created_at/i.test(sql)) {
                const role = params[2] || 'FORMATEUR';
                const liste = GRILLES.filter((g) => g.program_id === params[1] && g.role === role && g.active === 1);
                return [/LIMIT 1/i.test(sql) ? liste.slice(0, 1) : liste];
            }
            if (/FROM evaluation_exercice WHERE grille_id = \?/i.test(sql)) return [[]];
            if (/FROM evaluation_competence WHERE grille_id = \?/i.test(sql)) return [[]];
            if (/^\s*INSERT INTO evaluation_grille/i.test(sql)) { ecrits.push({ quoi: 'creation', params }); return [{}]; }
            if (/^\s*UPDATE evaluation_grille SET active = 0/i.test(sql)) { ecrits.push({ quoi: 'retrait', params }); return [{}]; }
            if (/^\s*UPDATE evaluation_grille/i.test(sql)) { ecrits.push({ quoi: 'maj', params }); return [{}]; }
            if (/^\s*(INSERT|UPDATE) INTO?\s*evaluation_exercice/i.test(sql)) { ecrits.push({ quoi: 'exercice', params }); return [{}]; }
            return [[]];
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
};
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const { getGrille, saveGrille, retirerGrille } = require('../controllers/evaluation.controller.js');
const { agreger } = require('../lib/evaluationDossiers.js');

function reponse() {
    const r = { code: 200, corps: null };
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.corps = b; return r; };
    return r;
}
const appel = async (fn, { body = {}, params = {}, query = {} } = {}) => {
    ecrits = [];
    const res = reponse();
    await fn({ body, params, query, user: { organization_id: 'o1', id: 'u-1' }, ip: '1.2.3.4', headers: {} }, res);
    return res;
};

test('la liste des grilles accompagne celle qu\'on lit', async () => {
    /* L'ÉCRAN DOIT POUVOIR PROPOSER LE CHOIX sans un second aller-retour : c'est le même appel
       qui charge une grille et dit s'il y en a d'autres. */
    const res = await appel(getGrille, { params: { programId: 'p-1' } });
    assert.strictEqual(res.code, 200);
    assert.deepStrictEqual((res.corps.grilles || []).map((g) => g.id), ['g-pate', 'g-four']);
    assert.strictEqual(res.corps.data.id, 'g-pate', 'sans précision, la PREMIÈRE — et c\'est un ordre écrit');

    const choisie = await appel(getGrille, { params: { programId: 'p-1' }, query: { grille: 'g-four' } });
    assert.strictEqual(choisie.corps.data.id, 'g-four');
});

test('une grille demandée est VÉRIFIÉE : organisme, formation, rôle', async () => {
    /* Un identifiant glissé dans l'URL ferait sinon noter sur la grille d'une autre formation,
       ou lire au formateur celle du jury — deux grilles qui n'ont ni les mêmes critères ni le
       même sens. Le serveur répond « aucune grille », jamais celle d'à côté. */
    const autreRole = await appel(getGrille, { params: { programId: 'p-1' }, query: { grille: 'g-jury' } });
    assert.strictEqual(autreRole.corps.data, null, 'la grille du jury ne se sert pas au formateur');

    const autreFormation = await appel(getGrille, { params: { programId: 'p-2' }, query: { grille: 'g-pate' } });
    assert.strictEqual(autreFormation.corps.data, null);
});

test('on écrit LA grille visée, on en crée une sur demande, et l\'ancien écran met à jour', async () => {
    /* 1. AVEC UN IDENTIFIANT : celle-là, et pas une autre. */
    const visee = await appel(saveGrille, { params: { programId: 'p-1' }, body: { id: 'g-four', label: 'Four à bois', exercices: [] } });
    assert.strictEqual(visee.code, 200, JSON.stringify(visee.corps));
    const maj = ecrits.find((e) => e.quoi === 'maj');
    assert.ok(maj, 'la grille visée est mise à jour');
    assert.strictEqual(maj.params[maj.params.length - 1], 'g-four');
    assert.ok(!ecrits.some((e) => e.quoi === 'creation'), 'et surtout pas une création de plus');

    /* 2. `nouvelle` : une grille de plus, avec son propre intitulé. */
    const neuve = await appel(saveGrille, { params: { programId: 'p-1' }, body: { nouvelle: true, label: 'Hygiène', exercices: [] } });
    assert.strictEqual(neuve.code, 200, JSON.stringify(neuve.corps));
    const creation = ecrits.find((e) => e.quoi === 'creation');
    assert.ok(creation, 'une grille est créée');
    assert.ok(creation.params.includes('Hygiène'));

    /* 3. NI L'UN NI L'AUTRE — c'est l'ancien écran, resté ouvert pendant un déploiement. Il doit
       METTRE À JOUR la première, pas créer une grille en double à chaque enregistrement : un
       doublon silencieux que personne ne relierait à la mise à jour. */
    const ancien = await appel(saveGrille, { params: { programId: 'p-1' }, body: { label: 'Évaluation pratique', exercices: [] } });
    assert.strictEqual(ancien.code, 200);
    assert.ok(ecrits.some((e) => e.quoi === 'maj'), 'mise à jour');
    assert.ok(!ecrits.some((e) => e.quoi === 'creation'), 'aucune création');

    /* 4. UN IDENTIFIANT QUI N'EST PAS À CETTE FORMATION est refusé, et rien n'est écrit. */
    const etrangere = await appel(saveGrille, { params: { programId: 'p-1' }, body: { id: 'g-jury', label: 'x', exercices: [] } });
    assert.strictEqual(etrangere.code, 404);
    assert.strictEqual(ecrits.filter((e) => e.quoi !== 'exercice').length, 0);
});

test('retirer une grille la DÉSACTIVE, et le jury garde la sienne', async () => {
    /* Supprimer entraînerait ses exercices en cascade, et les notes avec : un résultat annoncé
       à un stagiaire disparaîtrait de son dossier. Même règle que pour un exercice retiré. */
    const res = await appel(retirerGrille, { params: { id: 'g-four' } });
    assert.strictEqual(res.code, 200, JSON.stringify(res.corps));
    const retrait = ecrits.find((e) => e.quoi === 'retrait');
    assert.ok(retrait, 'la grille est désactivée');
    assert.ok(!ecrits.some((e) => /DELETE/i.test(e.quoi)), 'jamais supprimée');

    const jury = await appel(retirerGrille, { params: { id: 'g-jury' } });
    assert.strictEqual(jury.code, 422, 'le jury n\'a qu\'une grille : la retirer la recréerait vide');

    const inconnue = await appel(retirerGrille, { params: { id: 'g-ailleurs' } });
    assert.strictEqual(inconnue.code, 404);
});

test('plusieurs grilles : rien ne se rattrape de l\'une à l\'autre', () => {
    /* L'ÉCOLE A TRANCHÉ : un résultat par grille, aucune addition entre elles — elles n'ont ni
       le même maximum ni le même sens. Une condition de parcours ne connaît pourtant qu'un
       booléen : il vaut donc « toutes réussies », et le pourcentage retenu est LE PLUS FAIBLE,
       pour que « en dessous de 50 % » attrape la grille qui ne va pas au lieu de la moyenne qui
       la cache. */
    const ok = agreger([
        { points: 18, max: 20, percent: 90, notes: 3, pass_score: 70, reussi: true },
        { points: 13, max: 20, percent: 65, notes: 2, pass_score: 60, reussi: true },
    ]);
    assert.strictEqual(ok.reussi, true);
    assert.strictEqual(ok.percent, 65, 'la plus faible, pas la moyenne');

    const une_ratee = agreger([
        { points: 18, max: 20, percent: 90, notes: 3, pass_score: 70, reussi: true },
        { points: 8, max: 20, percent: 40, notes: 2, pass_score: 60, reussi: false },
    ]);
    assert.strictEqual(une_ratee.reussi, false, 'une grille ratée n\'est pas rattrapée par l\'autre');

    /* UNE GRILLE JAMAIS COMMENCÉE N'EST PAS UN ÉCHEC : la compter bloquerait à jamais les
       documents qui dépendent de la réussite. On ne regarde que les grilles notées. */
    const pas_finie = agreger([
        { points: 18, max: 20, percent: 90, notes: 3, pass_score: 70, reussi: true },
        { points: 0, max: 0, percent: 0, notes: 0, pass_score: 60, reussi: null },
    ]);
    assert.strictEqual(pas_finie.reussi, true);
    assert.strictEqual(pas_finie.percent, 90);

    /* Tant qu'une grille notée n'est pas tranchée, on ne tranche pas non plus. */
    assert.strictEqual(agreger([
        { points: 5, max: 20, percent: 25, notes: 1, pass_score: 70, reussi: null },
        { points: 18, max: 20, percent: 90, notes: 3, pass_score: 70, reussi: true },
    ]).reussi, null);

    /* Aucune note nulle part : `percent` est `null` et NON zéro — « 0 % » se compare comme une
       note et ferait passer « en dessous de 50 % » à un dossier qu'on n'évalue pas. */
    assert.strictEqual(agreger([{ points: 0, max: 0, percent: 0, notes: 0, pass_score: 70, reussi: null }]).percent, null);
});

test('la grille du JURY ne décide plus de « évaluation réussie »', () => {
    /* LE DÉFAUT QUE CE TEST GÈLE, trouvé en ajoutant les grilles multiples : la requête des
       liens ne filtrait pas le rôle. Une formation avec une grille de jury produisait DEUX
       lignes par dossier, et la boucle écrasait le résultat à chaque ligne — « évaluation
       réussie » se décidait donc sur celle lue en dernier, le jury une fois sur deux. Or le
       jury ne compte pas des points : il valide des compétences. */
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'evaluationDossiers.js'), 'utf8');
    assert.match(src, /AND g\.role = 'FORMATEUR'/, 'la requête des liens filtre le rôle');
    assert.match(src, /ER_BAD_FIELD_ERROR/, 'et retombe sur la forme d\'avant si la 149 n\'est pas jouée');
    assert.match(src, /parEleve/, 'les lignes d\'un même dossier sont rassemblées avant de conclure');
});

test('le document dit QUELLE grille il imprime', () => {
    /* Deux grilles n'ont ni le même maximum ni le même sens : sans cette règle, l'attestation
       « four » imprimerait les points de la grille « pâte », et rien sur le papier ne le
       dirait. Chaque grille peut porter le modèle qui l'imprime ; les autres documents
       retombent sur la première. */
    const ctrl = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'evaluation.controller.js'), 'utf8');
    assert.match(ctrl, /liste\.find\(\(x\) => x\.template_slug === options\.slug\)/);
    const doc = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'document.controller.js'), 'utf8');
    assert.match(doc, /resultatDossier\(conn, organizationId, dfEval\.enrollment_id,\s*\n?\s*\{ slug: slugDuDocument \}\)/);
});

test('les écrans laissent choisir la grille', () => {
    const UI = path.join(__dirname, '..', '..', 'app', 'ui');
    const sansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    const formations = sansCommentaires(fs.readFileSync(path.join(UI, 'pages/Formations.jsx'), 'utf8'));
    const saisie = sansCommentaires(fs.readFileSync(path.join(UI, 'components/SessionEvaluation.jsx'), 'utf8'));

    /* CÔTÉ CONFIGURATION : on ajoute une grille, et on passe de l'une à l'autre. */
    assert.match(formations, /Ajouter une grille/);
    assert.match(formations, /setGrilleId\("nouvelle"\)/);
    /* LE CHOIX DE LA GRILLE SUR SA PROPRE LIGNE. `.seg` est en `inline-flex` : posé tel quel, il
       se collait au sélecteur de rôle juste au-dessus, et les quatre boutons se lisaient comme
       UN choix — « Notation du formateur | Grille du jury | — pâte | — four ». Ce sont deux
       questions : de QUI est la grille, puis LAQUELLE. Constaté au banc le 2026-09-23. */
    assert.match(formations, /className="seg" style=\{\{ display: "flex", width: "fit-content"/,
        'le choix de la grille ne partage pas la ligne du choix de rôle');
    /* CÔTÉ SAISIE : le choix s'affiche AUSSI quand la grille ouverte est vide, sinon on ne
       pourrait pas rejoindre l'autre sans quitter la page. */
    assert.match(saisie, /const choixGrille = \(data\.grilles \|\| \[\]\)\.length > 1/);
    assert.ok((saisie.match(/\{choixGrille\}/g) || []).length >= 3, 'y compris sur les cartes vides');
    /* LES SAISIES EN COURS NE SUIVENT PAS : un chrono tapé sur « pâte » et pas encore
       enregistré s'écrirait sur un exercice de « four ». */
    assert.match(saisie, /function changerDeGrille\(id\) \{\s*\n?\s*setBrouillon\(\{\}\);/);
});
