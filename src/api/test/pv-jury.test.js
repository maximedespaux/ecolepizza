/**
 * LE PROCÈS-VERBAL DE JURY — ce qu'il refuse d'écrire, et ce qu'il imprime.
 *
 * UN PV EST UN ACTE OPPOSABLE, conservé dix ans. Ce fichier gèle les règles qui font qu'il dit
 * vrai : la composition minimale du jury, la motivation d'une décision défavorable, et le
 * refus de compter comme « non admis » quelqu'un que la commission n'a pas examiné.
 *
 * LE CONTEXTE EST CELUI DU VRAI DOCUMENT de l'organisme, « PV Jury SEM 27 du vendredi 3 juillet
 * 2026 » : deux candidats, trois membres dont deux extérieurs, un représentant du certificateur.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const cheminDb = require.resolve('../config/database.js');

let commission = null;
let candidats = [];
let ecrits = [];
const faux = {
    promise: () => ({
        query: async (sql, params) => {
            if (/information_schema/i.test(sql)) return [[{ 1: 1 }]];
            if (/FROM exam_session/i.test(sql)) return [commission ? [commission] : []];
            if (/FROM exam_result/i.test(sql)) return [commission ? (commission.resultats || []) : []];
            if (/FROM training_session/i.test(sql)) return [[{ id: 's-1' }]];
            if (/FROM enrollment e\s+WHERE e\.session_id/i.test(sql)) return [[{ id: 'enr-1' }]];
            if (/FROM enrollment WHERE session_id/i.test(sql)) return [candidats.map((c) => ({ learner_id: c.learner_id }))];
            if (/^\s*INSERT INTO exam_result/i.test(sql)) { ecrits.push(params); return [{}]; }
            if (/^\s*UPDATE exam_session/i.test(sql)) { ecrits.push({ cloture: sql }); return [{}]; }
            return [[]];
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
};
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const { saveDecision, cloturerCommission } = require('../controllers/examen.controller.js');
const { resolveTokens, RAW_TOKENS } = require('../lib/tokens.js');

/* LES NOMS SONT SAISIS « NOM Prénom », comme sur le procès-verbal de l'organisme (« DESPAUX
   Marie-Christine ») et comme le dit le champ de saisie. L'annexe 1 sépare les deux colonnes
   sur le premier espace : c'est une CONVENTION, et ce test la fixe. */
const JURY3 = [
    { nom: 'Ferrand Hélène', qualite: 'présidente', externe: false, na_pas_forme: true },
    { nom: 'Rossi Paul', qualite: 'membre du jury', externe: true, na_pas_forme: true },
    { nom: 'Fabre Léa', qualite: 'membre du jury', externe: true, na_pas_forme: true },
];
const conn = faux.promise();
function reponse() {
    const r = { code: 200, corps: null };
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.corps = b; return r; };
    return r;
}
const appel = async (fn, body, params) => {
    ecrits = [];
    const res = reponse();
    await fn({ body, params: params || {}, query: {}, user: { organization_id: 'o1', id: 'u1' }, ip: '1.2.3.4', headers: {} }, res);
    return res;
};

test('UNE DÉCISION DÉFAVORABLE DOIT ÊTRE MOTIVÉE', async () => {
    /* Sans motif écrit, une décision défavorable n'est pas opposable au recours : le candidat
       apprend qu'il est ajourné et rien ne lui dit pourquoi. La règle vient du document de
       l'organisme, pas d'une préférence d'écran. */
    commission = { id: 'e-1', status: 'OUVERTE', jury: JSON.stringify(JURY3), resultats: [] };
    const sans = await appel(saveDecision, { session_id: 's-1', learner_id: 'l-1', decision: 'AJOURNE' });
    assert.strictEqual(sans.code, 422);
    assert.strictEqual(ecrits.length, 0);

    const avec = await appel(saveDecision, { session_id: 's-1', learner_id: 'l-1', decision: 'AJOURNE', observations: 'C5 non acquise.' });
    assert.strictEqual(avec.code, 200, JSON.stringify(avec.corps));
});

test('une décision FAVORABLE n\'a pas besoin de motif', async () => {
    commission = { id: 'e-1', status: 'OUVERTE', jury: JSON.stringify(JURY3), resultats: [] };
    const r = await appel(saveDecision, { session_id: 's-1', learner_id: 'l-1', decision: 'CERTIFIE' });
    assert.strictEqual(r.code, 200);
});

test('une décision inventée est refusée', async () => {
    commission = { id: 'e-1', status: 'OUVERTE', jury: JSON.stringify(JURY3), resultats: [] };
    assert.strictEqual((await appel(saveDecision, { session_id: 's-1', learner_id: 'l-1', decision: 'PEUT-ÊTRE' })).code, 422);
});

test('une commission CLÔTURÉE ne change plus de décision', async () => {
    commission = { id: 'e-1', status: 'CLOTUREE', jury: JSON.stringify(JURY3), resultats: [] };
    const r = await appel(saveDecision, { session_id: 's-1', learner_id: 'l-1', decision: 'CERTIFIE' });
    assert.strictEqual(r.code, 409);
    assert.strictEqual(ecrits.length, 0);
});

test('ON NE CLÔTURE PAS AVEC UN CANDIDAT SANS DÉCISION', async () => {
    /* Un PV qui annonce « 0 admis, 0 non admis » sur deux inscrits ne dit rien — et il est
       signé. */
    candidats = [{ learner_id: 'l-1' }, { learner_id: 'l-2' }];
    commission = { id: 'e-1', status: 'OUVERTE', jury: JSON.stringify(JURY3),
        resultats: [{ learner_id: 'l-1', decision: 'CERTIFIE' }] };
    const r = await appel(cloturerCommission, {}, { id: 's-1' });
    assert.strictEqual(r.code, 422);
    assert.match(r.corps.error, /1 candidat/);
});

test('ON NE CLÔTURE PAS UNE COMMISSION À DEUX MEMBRES', async () => {
    /* « En l'absence d'un membre, la session ne se tient pas » (règlement d'examen, article 6).
       Un PV signé par deux personnes là où trois sont exigées se retourne contre l'organisme —
       c'est la seule règle de ce fichier qui vienne d'un texte, pas d'un usage. */
    candidats = [{ learner_id: 'l-1' }];
    commission = { id: 'e-1', status: 'OUVERTE', jury: JSON.stringify(JURY3.slice(0, 2)),
        resultats: [{ learner_id: 'l-1', decision: 'CERTIFIE' }] };
    const r = await appel(cloturerCommission, {}, { id: 's-1' });
    assert.strictEqual(r.code, 422);
    assert.match(r.corps.error, /trois membres/);
});

test('tout est en règle : la commission se clôture', async () => {
    candidats = [{ learner_id: 'l-1' }];
    commission = { id: 'e-1', status: 'OUVERTE', jury: JSON.stringify(JURY3),
        resultats: [{ learner_id: 'l-1', decision: 'CERTIFIE' }] };
    const r = await appel(cloturerCommission, {}, { id: 's-1' });
    assert.strictEqual(r.code, 200, JSON.stringify(r.corps));
    assert.ok(ecrits.some((e) => e.cloture), 'le statut doit passer à CLOTUREE');
});

/* ---------------------------------------------------------------------------------------- */

const ctxPv = (decisions) => ({
    exam: {
        pv_ref: 'EPJJD-EX-2026-014', date_examen: '2026-07-03', heure: '9 h 30',
        lieu: '101 rue Alsace Lorraine, 65300 Lannemezan', centre: 'École Pizza',
        certification: 'Fabriquer des pizzas artisanales', rncp_code: 'RS7404',
        voie_acces: 'FORMATION_CONTINUE', jury: JURY3,
        representant: 'Ferrand Hélène', representant_fonction: 'Responsable administrative',
        aleas: 'Néant.',
    },
    pvCandidats: [
        { last_name: 'Cano Agaleano', first_name: 'Alvaro', birthday: '23/08/1993', decision: decisions[0] },
        { last_name: 'Quet', first_name: 'Vincent', birthday: '19/01/1973', decision: decisions[1] },
    ],
});

test('« EN COURS » N\'EST NI ADMIS NI NON ADMIS', () => {
    /* LE TEST QUI COMPTE pour les comptes du PV. Compter comme refusé quelqu'un que la
       commission n'a pas examiné serait faux, et le document est signé. Les deux nombres ne
       totalisent donc pas forcément les inscrits — et c'est exact. */
    const v = resolveTokens(ctxPv(['CERTIFIE', 'EN_COURS']));
    assert.strictEqual(v.PVInscrits, '2');
    assert.strictEqual(v.PVAdmis, '1');
    assert.strictEqual(v.PVNonAdmis, '0', 'un candidat non examiné n\'est pas un candidat refusé');
    assert.match(v.PVCandidats, /Vincent<\/td><td>Né\(e\) le 19\/01\/1973<\/td><td>&nbsp;<br>&nbsp;<\/td><td>—/);
});

test('INSCRIT N\'EST PAS PRÉSENTÉ : un absent compte dans l\'un, pas dans l\'autre', () => {
    /* Le procès-verbal distingue les deux en toutes lettres — « Sur les 2 candidats inscrits,
       1 se sont présentés ». Les confondre ferait ATTESTER une présence qui n'a pas eu lieu,
       sur un document signé par trois personnes. */
    const v = resolveTokens(ctxPv(['CERTIFIE', 'ABSENT']));
    assert.strictEqual(v.PVInscrits, '2');
    assert.strictEqual(v['PVPrésentés'], '1');
    assert.match(v.PVListeCandidats, /QUET/, 'l\'absent reste un inscrit');
    assert.doesNotMatch(v['PVListePrésentés'], /QUET/, 'mais il ne s\'est pas présenté');
    /* Un absent n'est pas admis : il tombe donc dans les non admis, comme sur le papier. */
    assert.strictEqual(v.PVNonAdmis, '1');
});

test('les comptes du PV suivent les décisions', () => {
    const v = resolveTokens(ctxPv(['CERTIFIE', 'AJOURNE']));
    assert.strictEqual(v.PVAdmis, '1');
    assert.strictEqual(v.PVNonAdmis, '1');
    assert.match(v.PVCandidats, /Admis/);
    assert.match(v.PVCandidats, /Non admis/);
});

test('la MENTION de composition s\'imprime : elle rend les règles opposables', () => {
    /* La majorité extérieure et l'absence de lien formateur-candidat sont des conditions de
       validité. Imprimées, elles sont opposables ; absentes, elles se supposent. */
    const v = resolveTokens(ctxPv(['CERTIFIE', 'CERTIFIE']));
    assert.match(v['Jury mention'], /2 membres sur 3 extérieurs/);
    assert.match(v.PVJury, /Ferrand Hélène/);
    assert.strictEqual(v['PVReprésentant'], 'Ferrand Hélène');
    assert.strictEqual(v.PVHeure, '9 h 30');
});

test('chaque membre a sa case d\'émargement, et le NOM est en capitales', () => {
    /* L'annexe 1 est une feuille d'émargement : sans une case par membre, elle ne prouve pas
       qui était présent. */
    const html = resolveTokens(ctxPv(['CERTIFIE', 'CERTIFIE'])).PVMembres;
    assert.match(html, /<td>FERRAND<\/td><td>Hélène<\/td>/);
    assert.match(html, /<th>Émargement<\/th>/);
});

test('les tableaux du PV sont injectés en HTML', () => {
    for (const k of ['PVCandidats', 'PVMembres']) assert.ok(RAW_TOKENS.has(k), k);
});

test('SANS COMMISSION, les jetons du PV sont vides', () => {
    /* « 0 inscrit, 0 admis » sur un document sans commission dirait le contraire du vrai. */
    const v = resolveTokens({});
    assert.strictEqual(v.PVInscrits, '');
    assert.strictEqual(v.PVAdmis, '');
    assert.strictEqual(v.PVCandidats, '');
});

/* ---------------------------------------------------------------------------------------- */

test('le modèle de PV porte les jetons, et ne se signe pas électroniquement', () => {
    /* Le PV se signe à la main, en séance, par les membres présents — c'est ce que fait le
       document papier actuel avec ses cases vides. Le déclarer « à signer par le stagiaire »
       le ferait apparaître dans le parcours de chacun, alors qu'il n'appartient à personne. */
    const { PV_JURY } = require('../lib/modelesJury.js');
    for (const k of ['PV', 'PVHeure', 'PVJuryListe', 'PVReprésentant', 'PVInscrits', 'PVPrésentés',
        'PVListePrésentés', 'PVListeCandidats', 'PVAdmis', 'PVListeAdmis', 'PVNonAdmis',
        'PVListeNonAdmis', 'PVAléas', 'Jury mention', 'PVSignatures', 'PVMembres', 'PVCandidats']) {
        assert.ok(PV_JURY.body.includes(`data-token="${k}"`), `le modèle doit porter {${k}}`);
    }
    assert.deepStrictEqual(PV_JURY.signers, []);
});

test('LE MODÈLE REPREND LES FORMULES DU DOCUMENT, pas une paraphrase', () => {
    /* Ces phrases ne sont pas du remplissage : ce sont elles qui attestent que la séance s'est
       tenue régulièrement, et un instructeur les cherche à leur place habituelle. Les réécrire
       « en mieux » obligerait à comparer ligne à ligne avec le papier pour vérifier que rien
       n'a changé — ce que l'organisme a justement demandé d'éviter. */
    const { PV_JURY } = require('../lib/modelesJury.js');
    const texte = PV_JURY.body.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
    for (const phrase of [
        'PROCÈS-VERBAL DE JURY DE CERTIFICATION',
        'les membres du jury se sont réunis en commission de délibération',
        'Un représentant de l’organisme de certification était présent',
        'Il a été établi et signé une feuille d’émargement des membres présents, annexée au présent procès-verbal.',
        'le président déclare que la commission peut valablement délibérer, et que l’ordre du jour est le suivant',
        '1. Candidats',
        '2. Délibération des résultats',
        '3. Aléas et dysfonctionnements',
        'Signatures de la commission de délibération',
        'Annexe 1 : Feuille d’émargement des membres présents de la commission de délibération',
        'Annexe 2 : Liste des candidats et décision de certification',
    ]) {
        assert.ok(texte.includes(phrase), `phrase absente du modèle : « ${phrase} »`);
    }
    /* Les annexes forment une pièce à part, qu'on détache et qu'on fait émarger. Le saut de page
       ne vit que sur un `<p>` NON VIDE (cf. CLAUDE.md § 3) — d'où l'espace insécable. */
    assert.match(PV_JURY.body, /<p class="doc-pagebreak">&nbsp;<\/p>/);
});

test('LA GRILLE REPREND LES INTITULÉS DU DOCUMENT', () => {
    const { GRILLE_JURY } = require('../lib/modelesJury.js');
    const texte = GRILLE_JURY.body.replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
    for (const phrase of ['Grille d’évaluation', 'Nom / Prénom du Candidat :', 'En date du',
        'Nombre de compétences validées :', 'Avis', 'Rattrapage', 'Noms & Prénoms du Jury']) {
        assert.ok(texte.includes(phrase), `phrase absente de la grille : « ${phrase} »`);
    }
    /* Les quatre colonnes du papier, au mot près : c'est le tableau que le jury relit. */
    const { resolveTokens } = require('../lib/tokens.js');
    const html = resolveTokens({ jury: { grille: { label: 'g' }, competences: [
        { id: 'k', code: 'C1', label: 'Pâte', criteres: [{ id: 'x', label: 'C1.1 - Farine', active: 1 }] }],
        resultat: { validees: 0, total: 1, details: [] }, notes: [], verdict: {} } })['JuryCritères'];
    assert.match(html, /<th>Compétence<\/th><th>Mise en situation professionnelle<\/th>/);
    assert.match(html, /<th>Remarque\/recommandation\/axe de progression éventuel<\/th>/);
});

test('le groupe Examen est ENFIN dans la palette', () => {
    /* Il existait au catalogue depuis la migration 100 et n'y avait jamais été poussé : ses
       jetons se résolvaient si on les tapait, et n'apparaissaient nulle part. Deux ans
       d'invisibilité, faute d'écran qui s'en serve. */
    const PALETTE = fs.readFileSync(path.join(__dirname, '..', 'controllers/template.controller.js'), 'utf8');
    assert.ok(PALETTE.includes("groups.push(catalogGroup('Examen'))"));
});
