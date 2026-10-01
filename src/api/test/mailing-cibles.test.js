/**
 * LES CIBLES D'UN ENVOI À UN GROUPE — viser une personne ou une entreprise (demandé le 2026-10-01).
 *
 * « Écrire à un groupe » ne savait viser qu'une session, une semaine ou une formation. On ajoute :
 *   · DES STAGIAIRES choisis un à un (type « stagiaires ») ;
 *   · UNE ENTREPRISE (type « entreprise ») : SES stagiaires (lien `learner.company_id`, celui de la
 *     fiche entreprise) ET son représentant, pour que l'école coche à la case qui reçoit ;
 *   · une SÉLECTION mixte (type « choisis ») : ce que l'envoi porte dès qu'on décoche une case d'un
 *     envoi « entreprise » — un représentant s'y redésigne par l'id de SON entreprise, pas par un id
 *     de stagiaire (il n'est pas un `learner`).
 *
 * CE QUE CES TESTS GÈLENT : l'adresse du représentant est celle de son espace (user.email) sinon
 * celle de la fiche (company.email) ; sans adresse, pas de représentant (on ne coche pas un vide) ;
 * et le mode « choisis » rouvre stagiaires et représentants CHACUN par la bonne requête.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ctrl = require('../controllers/mailing.controller.js');

/* Un `conn` de mysql2 rend `[rows]` pour un SELECT : on sert les lignes selon la requête reconnue. */
function connFactice(plan) {
    return { query: async (sql) => {
        for (const [re, rows] of plan) if (re.test(sql)) return [rows];
        return [[]];
    } };
}

test('une entreprise : ses stagiaires PUIS son représentant, l’adresse de l’espace d’abord', async () => {
    const conn = connFactice([
        [/FROM learner\s+WHERE company_id/i, [
            { id: 'l2', first_name: 'Ana', last_name: 'Zed', email: 'ana@x.fr' },
            { id: 'l1', first_name: 'Bo', last_name: 'Art', email: 'bo@x.fr' },
        ]],
        [/FROM company c LEFT JOIN user u/i, [
            { name: 'Pizza SARL', cemail: 'contact@pizza.fr', uemail: 'rep@pizza.fr', rfirst: 'Léo', rlast: 'Roi' },
        ]],
    ]);
    const { liste, cible } = await ctrl.resoudreCibles(conn, 'org1', { type: 'entreprise', id: 'c1' });
    assert.strictEqual(cible, 'Entreprise Pizza SARL');
    assert.strictEqual(liste.length, 3, 'deux stagiaires + le représentant');
    assert.deepStrictEqual(liste[0], { id: 'l2', first_name: 'Ana', last_name: 'Zed', email: 'ana@x.fr', kind: 'stagiaire' });
    const rep = liste[liste.length - 1];
    assert.strictEqual(rep.kind, 'representant');
    assert.strictEqual(rep.email, 'rep@pizza.fr', 'user.email prioritaire sur company.email');
    assert.strictEqual(rep.id, 'rep:c1', 'le représentant se redésigne par l’id de son entreprise');
    assert.strictEqual(rep.company_id, 'c1');
    assert.strictEqual(rep.last_name, 'Roi');
});

test('représentant : l’adresse de la fiche à défaut, et ABSENT sans aucune adresse', async () => {
    const fiche = connFactice([
        [/FROM learner\s+WHERE company_id/i, []],
        [/FROM company c LEFT JOIN user u/i, [{ name: 'X', cemail: 'c@x.fr', uemail: null, rfirst: '', rlast: '' }]],
    ]);
    const r1 = await ctrl.resoudreCibles(fiche, 'o', { type: 'entreprise', id: 'c2' });
    assert.strictEqual(r1.liste.length, 1);
    assert.strictEqual(r1.liste[0].email, 'c@x.fr', 'repli sur company.email');
    assert.strictEqual(r1.liste[0].last_name, 'X', 'un nom de représentant vide retombe sur le nom de l’entreprise');

    const sansAdresse = connFactice([
        [/FROM learner\s+WHERE company_id/i, [{ id: 'l9', first_name: 'A', last_name: 'B', email: 'a@b.fr' }]],
        [/FROM company c LEFT JOIN user u/i, [{ name: 'Y', cemail: null, uemail: null }]],
    ]);
    const r2 = await ctrl.resoudreCibles(sansAdresse, 'o', { type: 'entreprise', id: 'c3' });
    assert.strictEqual(r2.liste.length, 1, 'pas de représentant sans adresse — on ne coche pas un vide');
    assert.strictEqual(r2.liste[0].kind, 'stagiaire');
});

test('une sélection mixte « choisis » : stagiaires et représentants, chacun par sa requête', async () => {
    const conn = connFactice([
        [/FROM learner\s+WHERE organization_id = \? AND id IN/i, [{ id: 'l1', first_name: 'A', last_name: 'B', email: 'a@b.fr' }]],
        [/FROM company c LEFT JOIN user u/i, [{ name: 'Z', cemail: 'z@z.fr', uemail: null, rfirst: 'R', rlast: 'Rr' }]],
    ]);
    const { liste, cible } = await ctrl.resoudreCibles(conn, 'o', { type: 'choisis', stagiaires: ['l1'], representants: ['c7'] });
    assert.strictEqual(liste.length, 2);
    assert.strictEqual(liste.find((x) => x.kind === 'representant').email, 'z@z.fr');
    assert.strictEqual(liste.find((x) => x.kind === 'representant').company_id, 'c7');
    assert.strictEqual(cible, '2 destinataires choisis');
});

test('l’écran « Écrire à un groupe » propose les deux cibles et envoie la sélection mixte', () => {
    const page = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'pages', 'Mailing.jsx'), 'utf8');
    assert.match(page, /<option value="stagiaires">/, 'cible « Des stagiaires »');
    assert.match(page, /<option value="entreprise">/, 'cible « Une entreprise »');
    /* Dès qu'on décoche, l'envoi porte la liste — et un représentant va dans `representants`, pas
       dans `stagiaires`, sinon le serveur le chercherait dans la table learner et ne le trouverait pas. */
    assert.match(page, /type:\s*"choisis",\s*stagiaires,\s*representants/, 'la désélection part en « choisis »');
    assert.match(page, /\.filter\(\(d\)\s*=>\s*d\.kind\s*===\s*"representant"\)\.map\(\(d\)\s*=>\s*d\.company_id\)/);
});
