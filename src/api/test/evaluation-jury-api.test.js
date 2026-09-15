/**
 * L'API DE LA GRILLE DE JURY — ce que le serveur accepte, et ce qu'il refuse.
 *
 * TROIS RÈGLES Y SONT ÉPROUVÉES, toutes les trois invisibles à la lecture du code :
 *   · une évaluation CLÔTURÉE ne bouge plus — sans quoi un procès-verbal signé ne prouve rien ;
 *   · l'AVIS est prononcé, jamais déduit — le jury signe une décision, pas un calcul ;
 *   · un CRITÈRE vaut 1 point, quoi qu'en dise le client.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const cheminDb = require.resolve('../config/database.js');

const CRITERE = { id: 'cr-1', grille_id: 'g-1', label: 'Pâton bien rond', bareme: 'BINAIRE', max_points: 1, active: 1, obligatoire: 1 };

let ecrits = [];
let cloture = null;          // valeur de `cloture_le` rendue par la fausse base
let grilleConnue = { id: 'g-1', program_id: 'p-1', template_slug: null };
let dossierConnu = true;

const faux = {
    promise: () => ({
        query: async (sql, params) => {
            if (/information_schema/i.test(sql)) return [[{ 1: 1 }]];           // la 149 est jouée
            if (/FROM evaluation_exercice x\s+JOIN evaluation_grille g/i.test(sql)) return [[CRITERE]];
            if (/FROM enrollment WHERE id = \?/i.test(sql)) return [dossierConnu ? [{ id: 'enr-1' }] : []];
            if (/FROM evaluation_grille WHERE id = \?/i.test(sql)) return [grilleConnue ? [grilleConnue] : []];
            if (/SELECT cloture_le FROM evaluation_verdict/i.test(sql)) return [cloture ? [{ cloture_le: cloture }] : []];
            if (/^\s*INSERT INTO evaluation_verdict/i.test(sql)) { ecrits.push({ quoi: 'verdict', params }); return [{}]; }
            if (/^\s*INSERT INTO evaluation_note/i.test(sql)) { ecrits.push({ quoi: 'note', params }); return [{}]; }
            if (/^\s*DELETE FROM evaluation_note/i.test(sql)) { ecrits.push({ quoi: 'suppression', params }); return [{}]; }
            return [[]];
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
};
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const { saveNote, saveVerdict } = require('../controllers/evaluation.controller.js');

function reponse() {
    const r = { code: 200, corps: null };
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.corps = b; return r; };
    return r;
}
const appel = async (fn, body) => {
    ecrits = [];
    const res = reponse();
    await fn({ body, user: { organization_id: 'o1', id: 'u-jure' }, ip: '1.2.3.4', headers: {}, query: {} }, res);
    return res;
};

test('UNE ÉVALUATION CLÔTURÉE N\'ACCEPTE PLUS DE NOTE', async () => {
    /* LA RÈGLE QUI PROTÈGE LE DOCUMENT. Le jury a délibéré et le procès-verbal est signé : une
       note encore modifiable après coup viderait la signature de son sens. Le refus est
       EXPLICITE — laisser l'écriture passer en silence serait pire que l'interdire, car
       personne ne saurait que la grille et le document ne disent plus la même chose. */
    cloture = '2026-07-03 11:00';
    const res = await appel(saveNote, { enrollment_id: 'enr-1', exercice_id: 'cr-1', valeur: 'OUI' });
    assert.strictEqual(res.code, 409);
    assert.strictEqual(ecrits.length, 0, 'rien ne doit être écrit');
    cloture = null;
});

test('tant qu\'elle est ouverte, la note passe', async () => {
    const res = await appel(saveNote, { enrollment_id: 'enr-1', exercice_id: 'cr-1', valeur: 'OUI' });
    assert.strictEqual(res.code, 200, JSON.stringify(res.corps));
    assert.strictEqual(res.corps.data.points, 1, 'un critère acquis vaut 1 point');
});

test('un critère NON acquis vaut zéro, pas « non noté »', async () => {
    /* La distinction porte tout le calcul de validation : un critère raté COMPTE comme raté,
       alors qu'un critère pas encore vu laisse la compétence en cours. */
    const res = await appel(saveNote, { enrollment_id: 'enr-1', exercice_id: 'cr-1', valeur: 'NON' });
    assert.strictEqual(res.corps.data.points, 0);
});

test('L\'AVIS EST PRONONCÉ, et seuls deux avis existent', async () => {
    /* « Favorable » et « Rattrapage » sont des DÉCISIONS du jury, qui a vu le candidat — pas des
       déductions du nombre de compétences validées. Une valeur inventée devient `null` plutôt
       que d'être écrite telle quelle : un avis que personne n'a prononcé ne doit pas apparaître
       sur un document signé. */
    const ok = await appel(saveVerdict, { enrollment_id: 'enr-1', grille_id: 'g-1', avis: 'favorable', rattrapage: true });
    assert.strictEqual(ok.code, 200, JSON.stringify(ok.corps));
    assert.strictEqual(ok.corps.data.avis, 'FAVORABLE');
    assert.strictEqual(ok.corps.data.rattrapage, 1);

    const inventé = await appel(saveVerdict, { enrollment_id: 'enr-1', grille_id: 'g-1', avis: 'PEUT MIEUX FAIRE' });
    assert.strictEqual(inventé.corps.data.avis, null);
});

test('un verdict ne se change plus après clôture', async () => {
    cloture = '2026-07-03 11:00';
    const res = await appel(saveVerdict, { enrollment_id: 'enr-1', grille_id: 'g-1', avis: 'FAVORABLE' });
    assert.strictEqual(res.code, 409);
    assert.strictEqual(ecrits.length, 0);
    cloture = null;
});

test('une grille d\'un AUTRE organisme est introuvable', async () => {
    /* Même garde que la note : les deux appartenances se vérifient en base, jamais depuis le
       corps de la requête. */
    grilleConnue = null;
    const res = await appel(saveVerdict, { enrollment_id: 'enr-1', grille_id: 'g-ailleurs', avis: 'FAVORABLE' });
    assert.strictEqual(res.code, 404);
    assert.strictEqual(ecrits.length, 0);
    grilleConnue = { id: 'g-1', program_id: 'p-1', template_slug: null };
});

test('un dossier d\'un AUTRE organisme est introuvable', async () => {
    dossierConnu = false;
    const res = await appel(saveVerdict, { enrollment_id: 'enr-ailleurs', grille_id: 'g-1', avis: 'FAVORABLE' });
    assert.strictEqual(res.code, 404);
    dossierConnu = true;
});

test('dossier ou grille manquants : refus explicite', async () => {
    assert.strictEqual((await appel(saveVerdict, { grille_id: 'g-1' })).code, 422);
    assert.strictEqual((await appel(saveVerdict, { enrollment_id: 'enr-1' })).code, 422);
});

/* ---------------------------------------------------------------------------------------- */

const SRC = fs.readFileSync(path.join(__dirname, '..', 'controllers/evaluation.controller.js'), 'utf8');

test('UN CRITÈRE VAUT 1 POINT, quoi qu\'en dise le client', () => {
    /* Même principe que « les points ne viennent jamais du client » : un critère envoyé avec
       `bareme: POINTS, max_points: 50` deviendrait une compétence à cinquante points, et la
       règle « 5 critères sur 6 » ne voudrait plus rien dire. Le serveur impose la forme. */
    assert.match(SRC, /bareme: 'BINAIRE', max_points: 1,/,
        'le barème et le maximum d\'un critère sont posés par le serveur, pas reçus');
});

test('UNE COMPÉTENCE RETIRÉE EST DÉSACTIVÉE, jamais supprimée', () => {
    /* La supprimer entraînerait ses critères en cascade, et les notes avec — le défaut déjà
       payé sur les réponses de QCM. Une compétence désactivée garde ses notes lisibles sur les
       candidats déjà évalués et cesse simplement de compter. */
    assert.match(SRC, /UPDATE evaluation_competence SET active = 0 WHERE grille_id = \? AND id IN \(\?\)/);
    assert.ok(!/DELETE FROM evaluation_competence/.test(SRC), 'aucune suppression de compétence');
    assert.ok(!/DELETE FROM evaluation_exercice/.test(SRC), 'aucune suppression de critère');
});

test('la 149 non jouée ne casse rien : la grille de jury est simplement absente', () => {
    /* Les migrations sont jouées à la main. Entre la mise en ligne et ce moment-là, demander la
       grille du jury doit rendre « aucune grille », pas une erreur sur chaque écran. */
    assert.match(SRC, /if \(!avecRole && r === 'JURY'\) return null;/);
    assert.match(SRC, /Migration 149 non jouée/);
});
