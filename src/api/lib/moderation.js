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
// La lecture du format `nav_access` vit dans `capacites.js` : elle servait déjà ici et côté
// écran, et une troisième copie naissait avec la suppression des notifications.
const { aLaCapacite } = require('./capacites.js');

const STAFF = ['SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT'];
const estStaff = (u) => STAFF.includes(u.role);

const CAP_MODERER = 'cap:moderate-community';

const peutModerer = async (user) => {
    if (estStaff(user)) return true;
    try {
        const [[row]] = await db.promise().query('SELECT nav_access FROM user WHERE id = ?', [user.id]);
        return aLaCapacite(row && row.nav_access, CAP_MODERER);
    } catch { return false; } // en cas de doute, on ne modère pas : refuser est réversible
};

/**
 * QUI PEUT ÉCRIRE UNE FICHE TECHNIQUE — son AUTEUR, ou un membre qui MODÈRE (dans SON organisme).
 *
 * Exactement la règle de la SUPPRESSION (deleteRecipe) : l'école corrige la fiche d'un stagiaire
 * comme elle en retire une du fil (demandé le 2026-10-15). Un point UNIQUE, pour que « modifier »,
 * « changer la photo » et « supprimer » ne divergent jamais sur qui a le droit. Bornée à
 * l'organisme : jamais la fiche d'une autre école (même si, de toute façon, on ne voit que les
 * fiches partagées de son organisme). `conn` est passé pour rester dans la transaction appelante.
 */
async function droitEcritureFiche(conn, recipeId, user) {
    const [[cur]] = await conn.query('SELECT author_user_id, organization_id FROM recipe WHERE id = ?', [recipeId]);
    if (!cur) return { trouvee: false };
    const estAuteur = cur.author_user_id === user.id;
    const moderation = !estAuteur && cur.organization_id === user.organization_id && await peutModerer(user);
    return { trouvee: true, cur, estAuteur, moderation, autorise: estAuteur || moderation };
}

module.exports = { STAFF, estStaff, peutModerer, CAP_MODERER, droitEcritureFiche };
