/**
 * COORDONNÉES DE L'ORGANISME POUR LE PIED DE PAGE DES E-MAILS — mises en cache.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN CACHE, ET POURQUOI LA LECTURE EST SYNCHRONE. Les gabarits d'e-mail (mailTemplates)
 * construisent une chaîne HTML de façon SYNCHRONE : `coquille()` ne peut pas attendre une requête.
 * Or le pied de page veut le nom, l'adresse, le téléphone de l'organisme — des données en base.
 * On les charge donc À PART (`charger()`, asynchrone, appelée au démarrage du serveur et toutes
 * les dix minutes) et les gabarits les LISENT en cache, sans I/O (`orgInfo()`).
 *
 * `orgInfo()` NE DÉCLENCHE JAMAIS DE REQUÊTE lui-même : c'est délibéré. Le pool de base est
 * paresseux exprès pour que `npm test` rende la main en 0,4 s (cf. config/database.js) ; si un
 * gabarit rendu dans un test ouvrait une connexion, il casserait cet invariant. Cache vide (test,
 * ou avant le premier chargement) → le pied de page retombe sur des valeurs par défaut.
 *
 * MONO-ORGANISME ASSUMÉ. Ce déploiement n'a qu'un organisme ; on met donc EN cache le premier. Si
 * un jour il y en avait plusieurs, le pied de page devrait dépendre de l'organisme du destinataire
 * — ce qui supposerait de le passer aux gabarits. Pas le cas aujourd'hui.
 */
const db = require('../config/database.js');

let cache = null;

/** Recharge les coordonnées depuis la base. À n'appeler qu'au runtime (jamais dans un test). */
async function charger() {
    try {
        const [rows] = await db.promise().query(
            `SELECT short_name, legal_name, manager, email, phone, address, zip_code, town
               FROM organization ORDER BY created_at LIMIT 1`);
        if (rows[0]) cache = rows[0];
    } catch (e) {
        // On garde l'ancien cache plutôt que de le vider : un pied de page daté vaut mieux qu'aucun.
        console.error('[orgContext] chargement:', e.message);
    }
}

/** Lecture SYNCHRONE pour les gabarits. Renvoie {} si rien n'est encore chargé (aucune I/O). */
function orgInfo() {
    return cache || {};
}

module.exports = { orgInfo, charger };
