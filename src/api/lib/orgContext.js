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
let mailCache = null; // réglages « Mailing » de l'organisme (migration 138), en cache
let modelesCache = null; // textes d'e-mail réécrits par l'école (migration 178), en cache

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
    /* Réglages d'envoi d'e-mails — requête SÉPARÉE, exprès. Les colonnes mail_* (migration 138)
       peuvent ne pas exister encore ; si on les mettait dans le SELECT ci-dessus, un
       ER_BAD_FIELD_ERROR ferait échouer AUSSI le chargement du pied de page. Isolées, leur
       absence est sans conséquence : mailCache reste null → tout est autorisé par défaut. */
    try {
        const [rows] = await db.promise().query(
            `SELECT mail_credentials, mail_reset, mail_forgot, mail_security, mail_notifications
               FROM organization ORDER BY created_at LIMIT 1`);
        if (rows[0]) mailCache = rows[0];
    } catch (e) {
        if (e.code !== 'ER_BAD_FIELD_ERROR' && e.code !== 'ER_NO_SUCH_TABLE') console.error('[orgContext] mailing:', e.message);
        // colonnes absentes (migration non jouée) → on laisse mailCache tel quel : par défaut, tout part.
    }
    /* LES TEXTES RÉÉCRITS PAR L'ÉCOLE (migration 178) — troisième requête, isolée pour la même
       raison que la précédente : la table peut ne pas exister encore, et son absence ne doit pas
       emporter le pied de page. Absente ou vide → `modelesCache` reste vide, et les gabarits
       gardent le texte livré avec l'application. */
    try {
        const [rows] = await db.promise().query(
            `SELECT cle, objet, titre, intro, pied FROM mail_modele
              WHERE organization_id = (SELECT id FROM organization ORDER BY created_at LIMIT 1)`);
        modelesCache = Object.fromEntries(rows.map((r) => [r.cle, r]));
    } catch (e) {
        if (e.code !== 'ER_NO_SUCH_TABLE' && e.code !== 'ER_BAD_FIELD_ERROR') console.error('[orgContext] modèles mail:', e.message);
    }
}

/**
 * Le texte que l'école a écrit pour ce type d'e-mail, ou `null` — lecture SYNCHRONE, sans I/O,
 * comme `orgInfo` et pour la même raison : les gabarits construisent une chaîne, ils n'attendent
 * rien. Le cache est rafraîchi au démarrage, toutes les dix minutes, ET à chaque enregistrement
 * (cf. mailing.controller) : sans ce dernier rappel, l'école attendrait dix minutes pour voir sa
 * propre correction partir.
 */
function modeleMail(cle) {
    return (modelesCache && modelesCache[cle]) || null;
}

/**
 * Rend quelque chose EN FAISANT COMME SI ce texte était enregistré — pour l'aperçu.
 *
 * L'ÉCOLE REGARDE CE QU'ELLE VIENT DE TAPER, avant d'enregistrer : l'aperçu doit donc passer par
 * les VRAIS gabarits, avec un texte qui n'est pas encore en base. On pose le modèle, on rend, on
 * le retire — dans un `finally`, sans quoi un gabarit qui échoue laisserait ce texte servir aux
 * e-mails réels jusqu'au prochain chargement du cache.
 */
function avecModeleTemporaire(cle, valeurs, rendu) {
    const avant = modelesCache;
    modelesCache = { ...(modelesCache || {}), [cle]: valeurs };
    try { return rendu(); } finally { modelesCache = avant; }
}

/** Lecture SYNCHRONE pour les gabarits. Renvoie {} si rien n'est encore chargé (aucune I/O). */
function orgInfo() {
    return cache || {};
}

// Correspondance TYPE d'e-mail → colonne d'interrupteur. Les clés sont les `kind` passés à sendMail.
const COLONNE_MAIL = {
    credentials: 'mail_credentials',       // compte créé / identifiants
    reset: 'mail_reset',                   // réinitialisation par l'organisme
    forgot: 'mail_forgot',                 // lien « mot de passe oublié »
    security: 'mail_security',             // alerte changement e-mail / mot de passe
    notifications: 'mail_notifications',   // notifications doublées par e-mail
};

/** Ce TYPE d'e-mail est-il autorisé pour l'organisme ? Défaut : OUI. On n'ARRÊTE un envoi que si
 *  l'organisme a EXPLICITEMENT mis l'interrupteur à 0. Type inconnu, cache non chargé (test,
 *  démarrage), ou colonne absente (migration non jouée) → true, donc aucune régression. */
function mailActif(kind) {
    if (!kind || !mailCache) return true;
    const col = COLONNE_MAIL[kind];
    if (!col || mailCache[col] == null) return true;
    return Number(mailCache[col]) !== 0;
}

module.exports = { orgInfo, charger, mailActif, modeleMail, avecModeleTemporaire };
