/**
 * « ÉQUIPE & ACCÈS » SE DÉLÈGUE EN ÉCRITURE — ce qui déplace la sécurité dans le contrôleur.
 *
 * TANT QUE LA RUBRIQUE ÉTAIT FERMÉE, `equipe.controller.js` pouvait supposer que seul un
 * PROPRIÉTAIRE l'atteignait : la route entière était gardée par
 * `authorizeRoles('SUPER_ADMIN', 'ADMIN_ORGANISME')`. Plusieurs de ses contrôles reposaient sur
 * cette hypothèse sans la dire. L'ouvrir à la délégation la casse, et deux chemins d'escalade
 * apparaissaient :
 *
 *   1. PROMOUVOIR UN COLLÈGUE. `canAssignRole` autorisait « ADMIN_ORGANISME » à tout acteur,
 *      puisque seul un propriétaire était censé l'appeler. Un secrétariat délégué aurait pu
 *      promouvoir quelqu'un, puis lui demander le reste — l'escalade par personne interposée.
 *
 *   2. REPRENDRE LE COMPTE D'UN ADMINISTRATEUR. La réinitialisation de mot de passe ne
 *      vérifiait RIEN sur la cible : seuls les comptes SUPER_ADMIN étaient protégés. Donner un
 *      nouveau mot de passe à un ADMIN_ORGANISME, puis s'y connecter, était la plus courte des
 *      escalades — et la plus silencieuse.
 *
 * CE QUI TENAIT DÉJÀ, et qu'on vérifie pour que personne ne l'affaiblisse en passant :
 * `nav_access` est réservé au SUPER_ADMIN (un délégué n'ouvre aucune rubrique, ni pour lui ni
 * pour un autre), et nul ne change son propre rôle.
 *
 * ON NE MONTE JAMAIS AU-DESSUS DE SOI : c'est la règle unique dont tout le reste découle.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const CTRL = fs.readFileSync(path.join(__dirname, '..', 'controllers/equipe.controller.js'), 'utf8');

/* La règle d'attribution est une fonction pure, et c'est ce qui permet de l'éprouver seule.
   On la relit depuis le source plutôt que de la réécrire ici : une copie dériverait. */
function chargerCanAssignRole() {
    const OWNER_ROLES = ['SUPER_ADMIN', 'ADMIN_ORGANISME'];
    const ASSIGNABLE_BY_ADMIN = ['ADMIN_ORGANISME', 'SECRETARIAT', 'FORMATEUR', 'AUDITEUR', 'INTERVENANT'];
    const d = CTRL.indexOf('function canAssignRole');
    const corps = CTRL.slice(d, CTRL.indexOf('\n}', d) + 2);
    // eslint n'existe pas ici ; l'évaluation est bornée au corps d'une fonction du dépôt.
    return new Function('OWNER_ROLES', 'ASSIGNABLE_BY_ADMIN', `${corps}; return canAssignRole;`)(
        OWNER_ROLES, ASSIGNABLE_BY_ADMIN);
}
const canAssignRole = chargerCanAssignRole();

test('un délégué non propriétaire ne peut attribuer aucun rôle de propriétaire', () => {
    for (const acteur of ['SECRETARIAT', 'FORMATEUR', 'AUDITEUR']) {
        for (const cible of ['SUPER_ADMIN', 'ADMIN_ORGANISME']) {
            assert.strictEqual(canAssignRole(acteur, cible), false,
                `${acteur} promouvant en ${cible} : escalade par personne interposée`);
        }
    }
});

test('un délégué peut toujours attribuer les rôles ordinaires', () => {
    /* La délégation doit RESTER utile : gérer l'équipe, c'est créer un formateur, un auditeur,
       un intervenant. Tout fermer reviendrait à ne rien avoir ouvert. */
    for (const cible of ['SECRETARIAT', 'FORMATEUR', 'AUDITEUR', 'INTERVENANT']) {
        assert.strictEqual(canAssignRole('SECRETARIAT', cible), true);
    }
});

test('les propriétaires gardent leurs prérogatives', () => {
    assert.strictEqual(canAssignRole('ADMIN_ORGANISME', 'ADMIN_ORGANISME'), true);
    assert.strictEqual(canAssignRole('ADMIN_ORGANISME', 'SUPER_ADMIN'), false,
        'seul un super administrateur crée un super administrateur');
    assert.strictEqual(canAssignRole('SUPER_ADMIN', 'SUPER_ADMIN'), true);
});

test('un compte de propriétaire ne se modifie que par un propriétaire', () => {
    /* LA GARDE QUI MANQUAIT. Sans elle, la réinitialisation de mot de passe ne vérifiait rien
       sur la cible : un secrétariat délégué donnait un nouveau mot de passe à un administrateur
       et se connectait à sa place. Elle couvre TOUS les champs d'un coup — mot de passe,
       e-mail, activation — plutôt qu'un contrôle par champ qu'on oublierait d'étendre. */
    const bloc = CTRL.slice(CTRL.indexOf('const updateMember'));
    const corps = bloc.slice(0, bloc.indexOf('\n};'));
    assert.match(corps, /OWNER_ROLES\.includes\(target\.role\) && !OWNER_ROLES\.includes\(req\.user\.role\)/,
        'la garde doit porter sur le RÔLE DE LA CIBLE, pas sur un champ particulier');
    /* Et elle est posée AVANT toute écriture : placée après, elle laisserait passer ce qui
       précède. */
    assert.ok(corps.indexOf('OWNER_ROLES.includes(target.role)') < corps.indexOf('req.body.password'),
        'la garde doit précéder la réinitialisation de mot de passe');
});

test('`nav_access` reste réservé au super administrateur', () => {
    /* C'EST LA BORNE LA PLUS IMPORTANTE, et elle tenait déjà. Un délégué qui pourrait écrire
       `nav_access` s'ouvrirait toutes les rubriques d'un seul geste — il n'aurait même pas
       besoin de changer de rôle. */
    const bloc = CTRL.slice(CTRL.indexOf("if (req.body.nav_access !== undefined)"));
    const corps = bloc.slice(0, bloc.indexOf('\n        }'));
    assert.match(corps, /req\.user\.role !== 'SUPER_ADMIN'/);
    assert.match(corps, /403/);
});

test('nul ne change son propre rôle', () => {
    assert.match(CTRL, /if \(isSelf\) return res\.status\(400\)\.json\(\{ error: 'Vous ne pouvez pas modifier votre propre rôle\.' \}\);/);
});

test('la création applique la MÊME règle d\'attribution que la modification', () => {
    /* Deux chemins mènent à un rôle : créer un membre, ou en modifier un. Ne border que le
       second laisserait créer directement le compte qu'on ne peut pas promouvoir. */
    for (const fn of ['createMember', 'updateMember']) {
        const bloc = CTRL.slice(CTRL.indexOf(`const ${fn} = async`));
        const corps = bloc.slice(0, bloc.indexOf('\n};'));
        assert.match(corps, /canAssignRole\(req\.user\.role,/, `${fn} doit borner le rôle attribué`);
    }
});
