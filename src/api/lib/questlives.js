/**
 * Cœurs de Pizza Quest : régénération dans le temps.
 *
 * Rien n'est planifié. On stocke un nombre de cœurs et la date de sa dernière modification,
 * et on rattrape le temps écoulé À LA LECTURE. Une tâche périodique qui recréditerait tous
 * les stagiaires toutes les minutes ferait le même travail, en tournant pour rien la nuit et
 * en tombant en panne sans que personne ne le voie.
 *
 * Subtilité qui justifie ces fonctions pures : quand on accorde des cœurs, le repère de
 * temps N'EST PAS remis à « maintenant » mais avancé du nombre de délais effectivement
 * consommés. Sinon la fraction en cours est perdue à chaque lecture — un stagiaire qui
 * consulte sa page toutes les minutes avec un délai de 5 minutes ne regagnerait JAMAIS de
 * cœur, puisque le compteur repartirait de zéro avant d'avoir atteint le seuil.
 */

const DEFAUT_MAX = 5;
const DEFAUT_DELAI_MIN = 5;

/** Réglages de l'organisme, bornés (une valeur aberrante en base ne casse pas le jeu). */
function reglages(org = {}) {
    const max = Math.max(1, Math.min(50, Number(org.quest_max_hearts) || DEFAUT_MAX));
    const raw = org.quest_regen_minutes;
    const delai = raw === 0 || raw === '0' ? 0 : Math.max(0, Math.min(1440, Number(raw) || DEFAUT_DELAI_MIN));
    return { max, delai };
}

/**
 * État des cœurs à l'instant `now`, à partir de la ligne stockée.
 *
 * Renvoie { hearts, max, delai, updatedAt, nextInMs, fullInMs } où :
 *   · `updatedAt` est le repère À RÉÉCRIRE en base si des cœurs ont été accordés ;
 *   · `nextInMs`  = attente avant le prochain cœur (0 si plein ou régénération immédiate) ;
 *   · `fullInMs`  = attente avant le capital complet.
 */
function etatCoeurs(row, org, now = Date.now()) {
    const { max, delai } = reglages(org);
    // Aucune ligne : le stagiaire n'a encore rien perdu, il est au maximum.
    if (!row) return { hearts: max, max, delai, updatedAt: new Date(now), nextInMs: 0, fullInMs: 0, changed: false };

    const stock = Math.max(0, Math.min(max, Number(row.hearts)));
    const depuis = new Date(row.updated_at).getTime();
    const base = Number.isFinite(depuis) ? depuis : now;

    // Délai nul = mécanique neutralisée : toujours au maximum.
    if (!delai) return { hearts: max, max, delai, updatedAt: new Date(now), nextInMs: 0, fullInMs: 0, changed: stock !== max };
    if (stock >= max) return { hearts: max, max, delai, updatedAt: new Date(now), nextInMs: 0, fullInMs: 0, changed: false };

    const pas = delai * 60_000;
    const ecoule = Math.max(0, now - base);
    const gagnes = Math.floor(ecoule / pas);
    const hearts = Math.min(max, stock + gagnes);

    // Repère AVANCÉ des délais consommés (et non remis à `now`) : la fraction en cours
    // continue de courir vers le cœur suivant.
    const updatedAt = new Date(base + gagnes * pas);
    const plein = hearts >= max;
    const reste = plein ? 0 : pas - ((now - updatedAt.getTime()) % pas);
    return {
        hearts, max, delai, updatedAt,
        nextInMs: plein ? 0 : reste,
        fullInMs: plein ? 0 : reste + (max - hearts - 1) * pas,
        changed: gagnes > 0,
    };
}

/**
 * Retire un cœur. `n` cœurs restants -> n-1, jamais en dessous de zéro.
 * Le repère de temps passe à `now` UNIQUEMENT si le stagiaire était au maximum : sinon une
 * perte relancerait l'attente en cours, et perdre un cœur juste avant d'en regagner un
 * repousserait les deux.
 */
function retirerCoeur(etat, now = Date.now()) {
    const hearts = Math.max(0, etat.hearts - 1);
    const etaitPlein = etat.hearts >= etat.max;
    return { hearts, updatedAt: etaitPlein ? new Date(now) : etat.updatedAt };
}

module.exports = { etatCoeurs, retirerCoeur, reglages, DEFAUT_MAX, DEFAUT_DELAI_MIN };
