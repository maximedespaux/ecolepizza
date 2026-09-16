/**
 * L'E-MAIL DE LA FICHE EST L'IDENTIFIANT DE CONNEXION — il doit donc le suivre.
 *
 * DÉFAUT VÉCU EN PRODUCTION le 2026-09-16, et il a coûté une journée. Une adresse saisie avec
 * une coquille, corrigée ensuite sur la fiche : la fiche affiche la bonne, le COMPTE garde
 * l'ancienne. `updateLearner` n'écrivait que dans `learner`, jamais dans `user`.
 *
 * CE QUE ÇA DONNE À L'ÉCRAN : la connexion cherche dans `user` et ne trouve plus personne, donc
 * « Email ou mot de passe incorrect ». Ce message est volontairement AMBIGU — il ne dit jamais
 * lequel des deux est faux, pour ne pas révéler qu'un compte existe. Excellente propriété de
 * sécurité, et ici elle envoie droit dans le mur : on réinitialise le mot de passe encore et
 * encore, ce qui ne peut RIEN changer puisque c'est l'identifiant qui a bougé.
 *
 * ET PERSONNE NE POUVAIT LE VOIR : le contrôleur lisait déjà `u.email AS account_email` — pour
 * en tirer un booléen `has_account` — puis le JETAIT. L'information était là, à une ligne près.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const sansCommentaires = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
const LEARNER = sansCommentaires(fs.readFileSync(path.join(API, 'controllers/learner.controller.js'), 'utf8'));
const UI = sansCommentaires(fs.readFileSync(path.join(API, '..', 'app', 'ui/pages/Stagiaires.jsx'), 'utf8'));

test('LE COMPTE LIÉ ET L\'E-MAIL DE LA FICHE SONT LUS', () => {
    assert.match(LEARNER, /SELECT company_id, financing, user_id, email FROM learner/,
        'user_id ET email doivent être chargés pour pouvoir propager');
    /* L'e-mail de la FICHE sert de repli quand le formulaire n'en envoie pas : un
       réenregistrement partiel doit quand même pouvoir réparer. */
    assert.match(LEARNER, /body\.email !== undefined\s*\n?\s*\? String\(body\.email\)\.trim\(\)\s*\n?\s*: String\(rows\[0\]\.email \|\| ''\)\.trim\(\)/);
});

test('LE COMPTE SUIT LA FICHE — mais seulement un compte STAGIAIRE', () => {
    const zone = LEARNER.slice(LEARNER.indexOf('const nouvelEmail'));
    assert.match(zone, /compte\.role === 'STAGIAIRE'/,
        'une fiche peut pointer sur un compte du bureau : lui changer son identifiant depuis '
        + "l'écran stagiaire serait une prise de contrôle");
    assert.match(zone, /UPDATE user SET email = \? WHERE id = \? AND organization_id = \?/);
    assert.match(zone, /logAudit\(req, 'learner\.account_email', 'Learner', learnerId\)/,
        'changer la clé d\'entrée de quelqu\'un se journalise');
});

test('UNE ADRESSE DÉJÀ PRISE FAIT ÉCHOUER BRUYAMMENT', () => {
    /* C'est LE point. Laisser diverger en silence est exactement ce qui a coûté la journée :
       la fiche aurait dit une chose, le compte une autre, et personne n'aurait rien su. Un 409
       qui NOMME l'adresse de connexion réelle vaut mieux qu'un enregistrement muet. */
    const zone = LEARNER.slice(LEARNER.indexOf('const nouvelEmail'));
    assert.match(zone, /SELECT id FROM user WHERE email = \? AND organization_id = \? AND id <> \?/,
        'on vérifie que l\'adresse est libre dans l\'organisme');
    /* LA GARDE, PAS LA PHRASE. Écrite d'abord en cherchant `res.status(409)`, l'assertion
       restait verte quand on remplaçait `if (pris.length)` par `if (false)` : le refus était
       toujours dans le fichier, simplement inatteignable. Même leçon que sur la carte, deux
       heures plus tôt — un motif présent ne prouve pas qu'on l'exécutera. */
    assert.match(zone, /if \(pris\.length\) \{[\s\S]{0,80}res\.status\(409\)/,
        'le 409 doit être commandé par « l\'adresse est prise »');
    assert.match(zone, /se connecte donc toujours avec/,
        'le message doit dire avec QUELLE adresse la personne se connecte encore');
});

test('RÉENREGISTRER UNE FICHE RÉPARE UNE DIVERGENCE DÉJÀ INSTALLÉE', () => {
    /* PREMIÈRE VERSION DU CORRECTIF, INSUFFISANTE : elle propageait « si l'e-mail CHANGE dans
       cet enregistrement ». Elle réglait donc l'avenir et laissait le passé cassé — or c'est le
       passé qui fait mal. Le cas signalé était exactement celui-là : la fiche portait déjà la
       bonne adresse, le compte l'ancienne, et réenregistrer sans rien modifier ne déclenchait
       rien. Il aurait fallu supprimer le compte et le recréer, ce que l'utilisateur a refusé à
       juste titre — un compte porte des choses qu'on ne veut pas perdre.

       LA COMPARAISON PORTE DONC SUR LE COMPTE. Le geste de réparation devient : ouvrir la
       fiche, enregistrer. */
    const zone = LEARNER.slice(LEARNER.indexOf('const nouvelEmail'));
    /* ON VÉRIFIE LA GARDE ENTIÈRE, pas une écriture particulière du défaut. Première version :
       elle cherchait littéralement `nouvelEmail !== ancienEmail`, et restait verte dès qu'on
       réintroduisait la même condition écrite autrement (`String(rows[0].email)…`). Un test qui
       nomme UNE forme du défaut ne gèle pas le contrat — il gèle une orthographe. */
    const garde = (zone.match(/if \(([\s\S]*?)\) \{/) || [])[1] || '';
    assert.match(garde, /^\s*nouvelEmail && rows\[0\]\.user_id\s*$/,
        `la propagation ne doit dépendre QUE d'un e-mail et d'un compte lié — vu : « ${garde.trim()} »`);
    assert.ok(!/rows\[0\]\.email/.test(garde),
        'aucune comparaison à l\'ancienne valeur de la fiche : elle empêcherait toute réparation');
    assert.match(zone, /String\(compte\.email \|\| ''\)\.trim\(\)\.toLowerCase\(\) !== nouvelEmail\.toLowerCase\(\)/,
        'on compare à l\'e-mail DU COMPTE — insensible à la casse : « Jean@X.fr » et '
        + '« jean@x.fr » sont la même adresse, et ne doivent rien déclencher');
    assert.match(zone, /nouvelEmail && rows\[0\]\.user_id/, 'pas de compte lié, rien à propager');
});

test('L\'ÉCART DÉJÀ INSTALLÉ SE VOIT SUR LA LISTE', () => {
    /* La propagation règle l'avenir. Les fiches DÉJÀ décrochées, elles, ne se répareront qu'au
       prochain enregistrement — d'ici là il faut pouvoir les repérer, sinon on les découvre une
       par une, le jour où quelqu'un n'arrive plus à se connecter. */
    assert.match(LEARNER, /compte_email_different: account_email && rest\.email/);
    assert.match(LEARNER, /account_email\.trim\(\)\.toLowerCase\(\) !== String\(rest\.email\)\.trim\(\)\.toLowerCase\(\)/);
    /* ET SEULEMENT EN CAS D'ÉCART : la liste n'a pas à publier l'adresse de connexion de 1073
       personnes pour le plaisir. */
    assert.match(LEARNER, /\? account_email : null/);
    assert.match(UI, /l\.compte_email_different &&/, 'et l\'écran l\'affiche');
    assert.match(UI, /identifiant ≠ fiche/);
});
