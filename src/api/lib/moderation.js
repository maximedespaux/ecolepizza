/**
 * Qui peut faire le ménage dans la Communauté — publications, réponses ET commentaires.
 *
 * POURQUOI CE FICHIER. La règle est née dans `community.controller`, pour les publications
 * d'entraide. Le fil de COMMENTAIRES d'une fiche, servi par `recipe.controller`, en a eu besoin
 * ensuite : c'est le même fil public, avec les mêmes dérapages possibles, et l'école n'avait
 * aucun moyen d'y retirer quoi que ce soit — sinon supprimer la fiche entière, ce qui punit son
 * auteur pour le commentaire d'un tiers. Deux copies de cette règle auraient divergé, et une
 * divergence sur un droit de suppression ne se remarque qu'après coup.
 *
 * MODÉRER N'EST PAS PARLER AU NOM DE L'ÉCOLE. Publier une ANNONCE et épingler ENGAGENT
 * l'organisme : ils restent au bureau (`estStaff`, dans community.controller). Retirer ou
 * corriger le message d'un autre est de l'entretien, que quelqu'un doit pouvoir faire au
 * quotidien — d'où une capacité accordée nominativement dans Équipe & accès (bouton boussole),
 * même mécanique que `cap:reveal-money`.
 *
 * RELUE EN BASE À CHAQUE APPEL, jamais mise dans le jeton. C'est déjà le choix de
 * `sectionAccess.middleware`, et pour la même raison : le jeton vit jusqu'à sept jours, et
 * retirer une capacité doit prendre effet tout de suite.
 *
 * INTERVENANT en est exclu, comme du reste du bureau : il entre par l'espace stagiaire
 * (`isStudent || isIntervenant`) et participe au fil comme les autres.
 */
const db = require('../config/database.js');

const STAFF = ['SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT'];
const estStaff = (u) => STAFF.includes(u.role);

const CAP_MODERER = 'cap:moderate-community';

const aLaCapacite = (navAccess, cap) => {
    if (!navAccess) return false;
    let map = navAccess;
    if (typeof map === 'string') { try { map = JSON.parse(map); } catch { return false; } }
    if (Array.isArray(map)) return map.includes(cap);              // ancien format = tout accordé
    return !!map && typeof map === 'object' && Object.prototype.hasOwnProperty.call(map, cap);
};

const peutModerer = async (user) => {
    if (estStaff(user)) return true;
    try {
        const [[row]] = await db.promise().query('SELECT nav_access FROM user WHERE id = ?', [user.id]);
        return aLaCapacite(row && row.nav_access, CAP_MODERER);
    } catch { return false; } // en cas de doute, on ne modère pas : refuser est réversible
};

module.exports = { STAFF, estStaff, peutModerer, CAP_MODERER };
