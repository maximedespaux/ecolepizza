/**
 * SAISIE D'UNE NOTE — ce que le serveur accepte, et ce qu'il calcule lui-même.
 *
 * LA RÈGLE QUI PORTE TOUT : les points ne viennent JAMAIS du client. Le formateur envoie ce
 * qu'il a MESURÉ — un temps, une note, un geste acquis — et le serveur applique le barème.
 * Accepter des points tout calculés laisserait n'importe quel appel poser 100 sur un exercice
 * qui en vaut 20 : la grille cesserait d'être un barème pour devenir une suggestion.
 *
 * CE TEST APPELLE LE CONTRÔLEUR contre une fausse base, plutôt que de lire son source. Une
 * garde qui « existe » dans le fichier mais qu'une condition contourne ne protège rien — et
 * c'est précisément ce genre de défaut qui part en production sans qu'un test de source
 * s'en aperçoive.
 */
const test = require('node:test');
const assert = require('node:assert');

const cheminDb = require.resolve('../config/database.js');

const CHRONO = {
    id: 'ex-1', grille_id: 'g-1', label: 'Façonnage', bareme: 'TEMPS', max_points: 100, active: 1,
    paliers: JSON.stringify([
        { max_s: 60, points: 100 },
        { max_s: 120, points: 50 },
        { max_s: null, points: 0 },
    ]),
};

let ecrits = [];
let supprime = null;
let exerciceConnu = CHRONO;
let dossierConnu = true;
const faux = {
    promise: () => ({
        query: async (sql, params) => {
            /* LA REQUÊTE A CHANGÉ DE FORME, et le double avec : l'exercice est désormais JOINT
               au parcours du dossier et au rôle de sa grille, pour qu'on ne puisse plus apparier
               librement un exercice et un dossier du même organisme. Le double répond donc à la
               jointure — répondre encore à l'ancienne forme validerait du code disparu. */
            if (/FROM evaluation_exercice x\s+JOIN evaluation_grille g/i.test(sql)) {
                return [exerciceConnu ? [exerciceConnu] : []];
            }
            if (/FROM enrollment WHERE id = \?/i.test(sql)) return [dossierConnu ? [{ id: 'enr-1' }] : []];
            if (/^\s*INSERT INTO evaluation_note/i.test(sql)) { ecrits.push(params); return [{}]; }
            if (/^\s*DELETE FROM evaluation_note/i.test(sql)) { supprime = params; return [{}]; }
            return [[]];
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
};
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const { saveNote } = require('../controllers/evaluation.controller.js');

function reponse() {
    const r = { code: 200, corps: null };
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.corps = b; return r; };
    return r;
}
async function noter(body) {
    ecrits = []; supprime = null;
    const res = reponse();
    await saveNote({ body, user: { organization_id: 'o1', id: 'u-formateur' }, ip: '1.2.3.4', headers: {} }, res);
    return res;
}
/** Les points réellement écrits en base (6ᵉ paramètre de l'INSERT). */
const pointsEcrits = () => ecrits[ecrits.length - 1][5];

test('un temps est converti par le barème', async () => {
    const res = await noter({ enrollment_id: 'enr-1', exercice_id: 'ex-1', valeur: 45 });
    assert.strictEqual(res.code, 200, JSON.stringify(res.corps));
    assert.strictEqual(res.corps.data.points, 100);
    assert.strictEqual(pointsEcrits(), 100);
});

test('DES POINTS ENVOYÉS PAR LE CLIENT SONT IGNORÉS', async () => {
    /* LE TEST QUI COMPTE. On envoie une performance médiocre ET une prétention à 100 points :
       seule la performance est lue. Sans cela, la grille ne garantirait plus rien. */
    const res = await noter({ enrollment_id: 'enr-1', exercice_id: 'ex-1', valeur: 300, points: 100 });
    assert.strictEqual(res.corps.data.points, 0, 'le barème dit zéro, et c\'est le barème qui décide');
    assert.strictEqual(pointsEcrits(), 0);
});

test('le maximum du barème borne, même contre un exercice mal réglé', async () => {
    /* `max_points` déclaré à 999 sur un barème à paliers : le maximum réel reste le meilleur
       palier. Sinon la grille annoncerait un total que personne ne peut atteindre. */
    exerciceConnu = { ...CHRONO, max_points: 999 };
    const res = await noter({ enrollment_id: 'enr-1', exercice_id: 'ex-1', valeur: 30 });
    assert.strictEqual(res.corps.data.points, 100);
    exerciceConnu = CHRONO;
});

test('vider la valeur EFFACE la note', async () => {
    /* Se tromper de ligne arrive. Sans retour en arrière, il faudrait laisser une note fausse
       ou passer par la base. */
    for (const vide of ['', '   ', null]) {
        const res = await noter({ enrollment_id: 'enr-1', exercice_id: 'ex-1', valeur: vide });
        assert.strictEqual(res.code, 200);
        assert.strictEqual(res.corps.data.points, null);
        assert.ok(supprime, `la valeur ${JSON.stringify(vide)} doit supprimer la note`);
        assert.strictEqual(ecrits.length, 0, 'et ne rien écrire');
    }
});

test('un exercice d\'un AUTRE organisme est introuvable', async () => {
    /* Les deux appartenances sont vérifiées en base, pas déduites du corps de la requête :
       sans cela, un identifiant glissé dans l'appel ferait noter le dossier d'autrui. */
    exerciceConnu = null;
    const res = await noter({ enrollment_id: 'enr-1', exercice_id: 'ex-ailleurs', valeur: 30 });
    assert.strictEqual(res.code, 404);
    assert.strictEqual(ecrits.length, 0);
    exerciceConnu = CHRONO;
});

test('un dossier d\'un AUTRE organisme est introuvable', async () => {
    dossierConnu = false;
    const res = await noter({ enrollment_id: 'enr-ailleurs', exercice_id: 'ex-1', valeur: 30 });
    assert.strictEqual(res.code, 404);
    assert.strictEqual(ecrits.length, 0);
    dossierConnu = true;
});

test('dossier ou exercice manquant : refus explicite', async () => {
    assert.strictEqual((await noter({ exercice_id: 'ex-1', valeur: 1 })).code, 422);
    assert.strictEqual((await noter({ enrollment_id: 'enr-1', valeur: 1 })).code, 422);
});

test('la note est rattachée à SON auteur', async () => {
    /* Une note d'examen dit ce qu'on a obtenu et devant qui : sans l'auteur, on ne sait plus
       qui a chronométré, et une contestation n'a personne à qui s'adresser. */
    await noter({ enrollment_id: 'enr-1', exercice_id: 'ex-1', valeur: 30 });
    assert.ok(ecrits[0].includes('u-formateur'), 'l\'auteur de la note doit être enregistré');
});

test('une seconde saisie REMPLACE la première, elle ne s\'ajoute pas', async () => {
    /* La contrainte d'unicité (dossier, exercice) est en base ; l'écriture doit la respecter,
       sinon deux formateurs notant en même temps feraient compter la note deux fois. */
    await noter({ enrollment_id: 'enr-1', exercice_id: 'ex-1', valeur: 30 });
    assert.strictEqual(ecrits.length, 1, 'une saisie produit UNE écriture');
    /* Le remplacement tient à une clause de la requête, que la fausse base ne peut pas jouer :
       on la relit donc dans le source. C'est le seul endroit de ce fichier où l'on ne peut pas
       éprouver par l'exécution — la contrainte d'unicité vit en base. */
    const src = require('fs').readFileSync(
        require('path').join(__dirname, '..', 'controllers/evaluation.controller.js'), 'utf8');
    assert.match(src, /ON DUPLICATE KEY UPDATE valeur = VALUES\(valeur\), points = VALUES\(points\)/,
        'sans cette clause, deux formateurs notant en même temps feraient compter la note deux fois');
});
