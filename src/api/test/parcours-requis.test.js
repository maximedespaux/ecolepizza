/**
 * On n'inscrit pas dans une formation sans parcours documentaire.
 *
 * LE DÉFAUT GELÉ ICI, et il est silencieux. Une formation au parcours vide acceptait
 * l'inscription : le dossier se créait, le stagiaire apparaissait dans la session, et il n'y
 * avait RIEN à lui envoyer — ni devis, ni contrat, ni convention. Le pipeline l'affichait « à
 * 0 % » exactement comme n'importe quel début de parcours, donc personne ne le voyait.
 *
 * Pour un organisme certifié Qualiopi, c'est un stagiaire formé sans contrat de formation. Et le
 * défaut ne se répare pas après coup : les documents portent des dates, et une convention signée
 * après la fin de la session ne vaut rien.
 *
 * DEUX PARCOURS, DEUX GARDES, selon la voie d'arrivée :
 *   · le parcours DU DOSSIER vaut pour tout le monde — sans lui, aucun document n'est prévu pour
 *     le stagiaire ;
 *   · le parcours ENTREPRISE ne concerne que les inscriptions passant par une entreprise. Sans
 *     lui, c'est l'ENTREPRISE qui n'a ni convention ni devis — et c'est elle qui paie.
 *
 * La garde REFUSE plutôt qu'elle n'avertit : un avertissement à la création d'un dossier se
 * clique sans se lire, et le dossier existe quand même.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { parcoursManquant } = require('../lib/parcoursRequis.js');

const API = path.join(__dirname, '..');
const srcEnr = fs.readFileSync(path.join(API, 'controllers/enrollment.controller.js'), 'utf8');
const srcComp = fs.readFileSync(path.join(API, 'controllers/company.controller.js'), 'utf8');

/** Connexion simulée : un programme donné, et un nombre d'étapes actives. */
const faux = (prog, nEtapes) => ({
    query: async (sql) => {
        if (/FROM training_session s JOIN training_program p/.test(sql)) return [[prog]];
        if (/COUNT\(\*\) AS n FROM program_step/.test(sql)) return [[{ n: nEtapes }]];
        throw new Error('sql inattendu : ' + sql);
    },
});
const PROG = { id: '1', code: 'NIV1', title: 'Pizzaïolo Niveau I', company_steps: null };

test('un parcours de dossier vide interdit toute inscription', async () => {
    const r = await parcoursManquant(faux(PROG, 0), 'o', 's', false);
    assert.ok(r, 'le refus doit tomber');
    // Le message NOMME la formation et dit ce qui manquerait au dossier : « parcours vide » seul
    // laisse chercher lequel, et pourquoi c'est grave.
    assert.match(r, /« Pizzaïolo Niveau I »/, 'la formation est nommee');
    assert.match(r, /sans devis, sans contrat et sans convention/, 'la consequence, pas la cause');
    assert.match(r, /Formations → Modifier → « Parcours documentaire »/, 'et le chemin exact');
});

test('un parcours de dossier rempli laisse passer', async () => {
    assert.strictEqual(await parcoursManquant(faux(PROG, 7), 'o', 's', false), null);
});

test('une arrivée par entreprise exige AUSSI le parcours entreprise', async () => {
    /* C'est l'entreprise qui paie : sans ce parcours, elle n'a ni convention ni devis. Le
       parcours du dossier, lui, est bien rempli — d'où deux gardes et non une. */
    const r = await parcoursManquant(faux(PROG, 7), 'o', 's', true);
    assert.ok(r, 'le refus doit tomber malgre un parcours de dossier complet');
    assert.match(r, /« À l'arrivée via une entreprise »/, 'le bon onglet est nomme');
    assert.match(r, /c'est elle qui paie/, 'la raison, en clair');

    const avec = { ...PROG, company_steps: JSON.stringify(['convention', 'devis-entreprise']) };
    assert.strictEqual(await parcoursManquant(faux(avec, 7), 'o', 's', true), null, 'les deux remplis : ca passe');
});

test('la garde ne bloque pas sur ce qu\'elle ne sait pas juger', async () => {
    /* Session inconnue : c'est à l'appelant de le dire, et il le fait déjà. Refuser ici
       donnerait un message hors sujet à la place du bon. */
    assert.strictEqual(await parcoursManquant(faux(undefined, 0), 'o', 's', true), null);
    // Et un schéma inattendu ne doit pas empêcher d'inscrire : refuser sur une erreur technique
    // serait pire que le défaut qu'on prévient.
    const srcLib = fs.readFileSync(path.join(API, 'lib/parcoursRequis.js'), 'utf8');
    assert.match(srcLib, /if \(noSchema\(e\)\) return null;/, 'degradation silencieuse sur schema absent');
});

test('les DEUX voies d\'inscription sont gardées', () => {
    // Une garde posée sur un seul chemin ne garde rien : il suffit de passer par l'autre.
    assert.match(srcEnr, /const refus = await parcoursManquant\(conn, orgId, session_id, !!company_id\);/,
        'inscription directe — et le parcours entreprise si le dossier en a une');
    assert.match(srcComp, /const refus = await parcoursManquant\(conn, orgId, sessionId, true\);/,
        'inscription via entreprise — toujours les deux parcours');
});

test('le refus tombe AVANT la boucle d\'inscription groupée', () => {
    /* Côté entreprise on inscrit une LISTE. Refuser au dixième stagiaire de vingt laisserait neuf
       dossiers créés et onze non — un état que personne ne peut rattraper à la main. */
    const iRefus = srcComp.indexOf('const refus = await parcoursManquant');
    const iBoucle = srcComp.indexOf('async function enrollLearner');
    assert.ok(iRefus > 0 && iBoucle > 0 && iRefus < iBoucle,
        'le controle doit preceder la creation du premier dossier');
});
