/**
 * UNE PIÈCE ENREGISTRÉE PAR L'ÉCOLE NE FAISAIT AVANCER NI L'ÉTAPE NI LE POURCENTAGE.
 *
 * DEUX DÉFAUTS INDÉPENDANTS, qui se cumulaient sur le même écran.
 *
 * 1. LE SUIVI QUALIOPI NE VOYAIT AUCUNE PIÈCE. `getSuivi` appelait `computeDocParcours({ steps,
 *    docs })` — sans `pieces`. Toute étape « pièce » y était donc évaluée contre un objet vide,
 *    donc jamais validée. Or l'avancement s'arrête à la PREMIÈRE étape non faite : une carte
 *    d'identité en deuxième position figeait le dossier à 10 %, quoi que l'école fasse ensuite.
 *    La fiche du dossier, elle, passait bien `pieces` — les deux écrans se contredisaient, et
 *    c'est le tableau de conformité, celui qu'on montre en audit, qui avait tort.
 *
 * 2. UN DÉPÔT FAIT PAR L'ÉCOLE RESTAIT « À VÉRIFIER ». Le circuit normal est « le stagiaire
 *    dépose, l'école contrôle » : DEPOSEE veut dire « quelqu'un attend un contrôle ». Mais quand
 *    c'est l'école qui dépose — la pièce est arrivée par courriel, elle l'a ouverte pour la
 *    téléverser — ce contrôle a déjà eu lieu. La pièce restait pourtant en attente d'elle-même,
 *    et l'étape ne se terminait pas.
 *
 * La trace de vérification reste écrite (`verifie_par`, `verifie_le`) : c'est elle que lit un
 * contrôle Qualiopi, pas le fait qu'on ait cliqué deux fois.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const cheminDb = require.resolve('../config/database.js');
let insertDepot = null;
const faux = {
    promise: () => ({
        query: async (sql, params) => {
            if (/FROM piece_type LIMIT 1/i.test(sql)) return [[]];                       // limites présentes
            if (/SELECT label, fichiers_attendus/i.test(sql)) return [[{ label: 'Justificatif', fichiers_attendus: 6, max_octets: null, mimes: null }]];
            if (/FROM enrollment e JOIN learner l/i.test(sql)) return [[{ id: 'enr-1', organization_id: 'o1', user_id: 'u-stagiaire' }]];
            if (/INSERT INTO piece_depot/i.test(sql)) { insertDepot = { sql, params }; return [{}]; }
            if (/SELECT id FROM piece_depot/i.test(sql)) return [[{ id: 'dep-1' }]];
            if (/COUNT\(\*\) AS n FROM piece_fichier/i.test(sql)) return [[{ n: 0 }]];
            if (/MAX\(sort_order\)/i.test(sql)) return [[{ m: 0 }]];
            if (/INSERT INTO piece_fichier/i.test(sql)) return [{}];
            return [[]];
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
};
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const { deposer } = require('../controllers/piece.controller.js');
const { computeDocParcours } = require('../lib/parcours.js');

function requete(role, userId) {
    return {
        params: { enrollmentId: 'enr-1', pieceTypeId: 'pt-1' },
        file: { originalname: 'justif.pdf', buffer: Buffer.from('%PDF-1.7 x'), mimetype: 'application/pdf' },
        user: { organization_id: 'o1', id: userId, role },
        ip: '127.0.0.1', headers: {},
    };
}
function reponse() {
    const r = { code: 200, corps: null };
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.corps = b; return r; };
    return r;
}

test('déposée par l\'école, la pièce est validée du même geste', async () => {
    insertDepot = null;
    const res = reponse();
    await deposer(requete('SECRETARIAT', 'u-secretaire'), res);
    assert.strictEqual(res.code, 201, `le dépôt doit passer — reçu ${res.code} : ${JSON.stringify(res.corps)}`);
    assert.ok(insertDepot, 'le dépôt doit être écrit');
    assert.ok(insertDepot.params.includes('VALIDEE'),
        'un dépôt du personnel vaut vérification, sinon l\'étape ne se termine jamais');
    assert.ok(insertDepot.params.includes('u-secretaire'),
        '`verifie_par` doit nommer la personne : c\'est la trace que lit un contrôle Qualiopi');
});

test('déposée par le stagiaire, elle attend toujours un contrôle', async () => {
    /* L'autre moitié de la règle. Sans elle, la correction supprimerait la vérification pour
       tout le monde, et l'école validerait sans avoir rien regardé. */
    insertDepot = null;
    const res = reponse();
    await deposer(requete('STAGIAIRE', 'u-stagiaire'), res);
    assert.strictEqual(res.code, 201);
    assert.ok(insertDepot.params.includes('DEPOSEE'), 'un dépôt du stagiaire reste à vérifier');
    assert.ok(!insertDepot.params.includes('VALIDEE'));
});

test('une pièce validée fait avancer le parcours', () => {
    const steps = [
        { slug: 'devis', label: 'Devis' },
        { slug: 'piece:1', label: 'Pièce d\'identité', piece_id: 'pt-1' },
        { slug: 'convention', label: 'Convention' },
    ];
    const docs = [{ id: 'd1', template_slug: 'devis', status: 'SIGNE' }];
    const avec = computeDocParcours({ steps, docs, pieces: { 'pt-1': 'VALIDEE' } });
    assert.strictEqual(avec.steps[1].status, 'done');
    assert.ok(avec.currentIndex >= 2, 'le parcours doit dépasser la pièce une fois validée');
});

test('sans les statuts de pièces, le parcours se fige — le défaut du suivi', () => {
    /* Ce test EST le défaut : appelé sans `pieces`, le calcul bloque à l'étape de la pièce.
       Il documente pourquoi `getSuivi` doit les passer, et rougirait si quelqu'un rendait le
       paramètre optionnel « par commodité ». */
    const steps = [
        { slug: 'devis', label: 'Devis' },
        { slug: 'piece:1', label: 'Pièce d\'identité', piece_id: 'pt-1' },
        { slug: 'convention', label: 'Convention' },
    ];
    const docs = [{ id: 'd1', template_slug: 'devis', status: 'SIGNE' }];
    const sans = computeDocParcours({ steps, docs });
    assert.strictEqual(sans.currentIndex, 1, 'sans les pièces, tout s\'arrête à la première');
    assert.ok(sans.percent < 50);
});

/* ------------------------------------------------------------------ contrats lus au source */

/* LE CALCUL A DÉMÉNAGÉ dans `lib/avancement.js` : le tableau de bord et la page session en
   ont besoin aussi, et n'ont pas les mêmes droits que le suivi. Ces assertions suivent le
   code, elles ne le suivaient pas par hasard — c'est bien ce fichier qui porte la règle. */
const AVANCEMENT = fs.readFileSync(path.join(__dirname, '..', 'lib/avancement.js'), 'utf8');
const SUIVI = fs.readFileSync(path.join(__dirname, '..', 'controllers/suivi.controller.js'), 'utf8');
/* LA RÈGLE A DÉMÉNAGÉ, et ce test l'a signalé en virant au rouge — c'est son travail.
   Elle vivait dans `components/Roadmap.jsx` ; une COPIE divergente traînait dans
   `pages/Suivi.jsx`, et le suivi Qualiopi réclamait des pièces d'identité pourtant validées
   (production, 2026-09-15). Elle est désormais seule dans `lib/etapes.js`, où elle s'IMPORTE
   au lieu de se recopier — et où `etape-etat-unique.test.js` l'éprouve sur son comportement
   plutôt que sur un motif. Ce fichier-ci garde ce qu'il gelait : que le calcul REÇOIVE l'état
   de la pièce. Sans cette donnée, la meilleure règle du monde ne peut rien dire. */
const ETAPES = fs.readFileSync(
    path.join(__dirname, '..', '..', 'app/ui/lib/etapes.js'), 'utf8');

test('le suivi Qualiopi passe les statuts de pièces au calcul', () => {
    assert.match(AVANCEMENT, /computeDocParcours\(\{ steps, docs, pieces: piecesParDossier\.get\(e\.enrollment_id\) \|\| \{\} \}\)/,
        'sans `pieces`, le pourcentage de conformité plafonne à la première pièce du parcours');
    assert.match(AVANCEMENT, /FROM piece_depot WHERE organization_id = \?/,
        'les dépôts se lisent en UNE requête pour toute la série, pas une par dossier');
    assert.match(SUIVI, /avancementDossiers\(conn, req\.user\.organization_id, enrollments, \{ avecDocuments: true \}\)/,
        'le suivi doit passer par le calcul partagé');
});

test('la feuille de route lit l\'état d\'une pièce, pas un statut de document', () => {
    assert.match(ETAPES, /if \(doc\.piece\) \{/);
    assert.match(ETAPES, /doc\.pieceStatus === "VALIDEE"\) return "done"/);
    assert.match(AVANCEMENT, /pieceStatus: s\.pieceStatus \|\| null,/,
        'la feuille de route doit recevoir l\'état de la pièce');
});
