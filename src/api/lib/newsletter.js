/**
 * LA NEWSLETTER — envoyer une ANNONCE de la Communauté par e-mail aux stagiaires de l'école.
 *
 * Déclenchée par une case sur le formulaire d'annonce (bureau). Modèle « soft opt-in client
 * existant » : on écrit aux stagiaires de l'école SANS leur réclamer un second « oui », parce que
 * chaque e-mail porte un lien de DÉSINSCRIPTION en un clic (cf. `consentements.enregistrerNewsletter`
 * / `desinscritsNewsletter`). Qui s'est désinscrit ne reçoit plus rien.
 *
 * TOUT EST RÉUTILISÉ : l'envoyeur commun (`construireEnvoyeur`, même mise en page de marque que les
 * envois programmés), le registre des consentements (130) pour l'opt-out, la table `mail_envoi`
 * (178) pour la trace. Le seul ajout propre est le LIEN de désinscription, signé (JWT, rien à
 * stocker) : le jeton porte l'identifiant du stagiaire et de l'organisme, il ne permet QUE de se
 * désinscrire, et il n'expire pas (se désinscrire doit toujours marcher).
 */

const jwt = require('jsonwebtoken');
const { appUrl } = require('./mailer.js');
const { desinscritsNewsletter } = require('./consentements.js');

/* Le « but » gravé dans le jeton : un jeton de session (connexion) ne doit jamais pouvoir servir de
   jeton de désinscription, ni l'inverse. On refuse tout jeton dont le `p` n'est pas celui-ci. */
const BUT_DESINSCRIPTION = 'nl-unsub';

const estSchemaAbsent = (e) => e && (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE');

function secret() {
    const s = process.env.JWT_SECRET;
    if (!s) throw new Error('JWT_SECRET manquant : lien de désinscription non signable.');
    return s;
}

/** Le jeton de désinscription d'UN stagiaire (HS256, sans expiration). */
function signerLienDesinscription(learnerId, orgId) {
    return jwt.sign({ p: BUT_DESINSCRIPTION, l: learnerId, o: orgId }, secret(), { algorithm: 'HS256' });
}

/** Rend `{ learnerId, orgId }` si le jeton est valide et destiné à la désinscription, sinon `null`. */
function verifierLienDesinscription(token) {
    try {
        const d = jwt.verify(String(token || ''), secret(), { algorithms: ['HS256'] });
        if (!d || d.p !== BUT_DESINSCRIPTION || !d.l || !d.o) return null;
        return { learnerId: d.l, orgId: d.o };
    } catch {
        return null;
    }
}

/**
 * Le PUBLIC de la newsletter : les stagiaires de l'organisme qui ont un COMPTE actif, un e-mail, et
 * qui ne se sont pas désinscrits. Dédoublonné par adresse (deux fiches pour une même personne → un
 * seul envoi).
 *
 * RESTREINT AUX TITULAIRES D'UN COMPTE — décidé le 2026-10-05, pour tenir sous la limite d'envoi
 * d'OVH et ménager la réputation du domaine. Écrire à TOUS les stagiaires jamais connectés, c'est
 * un envoi de masse vers des adresses souvent anciennes (rebonds = pire signal de spam). On s'en
 * tient donc à ceux qui ont ouvert un compte (`learner.user_id` renseigné) et dont l'accès n'est pas
 * coupé (`user.active = 1`, désactivation manuelle ou purge migration 199). Élargir plus tard
 * demandera une FILE qui respecte la limite (cf. CHANTIERS), pas un simple relâchement de ce filtre.
 */
async function audienceNewsletter(conn, orgId) {
    const [rows] = await conn.query(
        `SELECT l.id, l.first_name, l.last_name, l.email
           FROM learner l
           JOIN user u ON u.id = l.user_id AND u.active = 1
          WHERE l.organization_id = ?
            AND l.email IS NOT NULL AND TRIM(l.email) <> ''
          ORDER BY l.last_name, l.first_name`,
        [orgId]);
    const vus = new Set();
    const uniques = [];
    for (const r of rows) {
        const cle = String(r.email).trim().toLowerCase();
        if (vus.has(cle)) continue;
        vus.add(cle);
        uniques.push(r);
    }
    const desinscrits = await desinscritsNewsletter(conn, orgId, uniques.map((r) => r.id));
    return uniques.filter((r) => !desinscrits.has(r.id));
}

/**
 * Le pied ajouté à CHAQUE e-mail : un lien vers l'espace (où vivent la photo et les réponses) et le
 * lien de désinscription OBLIGATOIRE. Markdown restreint (`[texte](url)`), rendu par `texteEnHtml`.
 */
function piedNewsletter(token) {
    const desinscription = `${appUrl()}/desinscription/${token}`;
    const espace = `${appUrl()}/communaute`;
    return `[Lire l'annonce dans mon espace](${espace})\n\n`
        + 'Vous recevez cet e-mail en tant que stagiaire de l’école. '
        + `Pour ne plus recevoir ces actualités : [Se désinscrire](${desinscription}).`;
}

/** Le corps complet d'un e-mail : l'annonce, puis le pied (lien espace + désinscription). */
function corpsNewsletter(corps, token) {
    const base = String(corps || '').trim();
    return (base ? `${base}\n\n` : '') + piedNewsletter(token);
}

/**
 * Envoie l'annonce à tout le public, UN e-mail par personne (chacun a son propre lien de
 * désinscription). `envoyer` est injecté — en production `construireEnvoyeur()`, en test un double.
 * Un envoi raté ne stoppe pas les autres. Rend le bilan (total, envoyés, échecs, identifiants).
 */
async function envoyerNewsletter(conn, { orgId, titre, corps, envoyer }) {
    const dest = await audienceNewsletter(conn, orgId);
    let envoyes = 0;
    let echecs = 0;
    for (const d of dest) {
        const token = signerLienDesinscription(d.id, orgId);
        let r;
        try {
            r = await envoyer({ to: d.email, objet: titre, corps: corpsNewsletter(corps, token), orgId });
        } catch {
            r = { sent: false };
        }
        if (r && r.sent === false) echecs += 1;
        else envoyes += 1;
    }
    return { total: dest.length, envoyes, echecs, learnerIds: dest.map((d) => d.id) };
}

/**
 * FIRE-AND-FORGET : rend la main tout de suite et fait l'envoi en tâche de fond — un e-mail raté (ou
 * tout le SMTP coupé) ne doit JAMAIS faire échouer la publication de l'annonce. Journalise dans
 * `mail_envoi` et marque la date sur l'annonce (migration 202, tolérée si absente).
 */
function declencherNewsletter(db, { orgId, postId, titre, corps, envoyePar }) {
    Promise.resolve().then(async () => {
        const conn = db.promise();
        const { construireEnvoyeur } = require('./envoiGroupe.js');
        const envoyer = construireEnvoyeur();
        const { total, envoyes, echecs, learnerIds } = await envoyerNewsletter(conn, { orgId, titre, corps, envoyer });
        try {
            await conn.query(
                `INSERT INTO mail_envoi
                   (id, organization_id, objet, corps, cible, destinataires, echecs, learner_ids, envoye_par)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [require('crypto').randomUUID(), orgId, String(titre).slice(0, 200),
                 String(corps || '').slice(0, 65000),
                 `Newsletter (${total} stagiaire${total > 1 ? 's' : ''})`.slice(0, 200),
                 envoyes, echecs, learnerIds.join(','), envoyePar || null]);
        } catch (e) {
            if (!estSchemaAbsent(e)) throw e;
        }
        try {
            await conn.query('UPDATE community_post SET newsletter_envoye_le = NOW() WHERE id = ?', [postId]);
        } catch (e) {
            if (!estSchemaAbsent(e)) throw e;
        }
    }).catch((e) => console.error('newsletter:', e.message));
}

module.exports = {
    signerLienDesinscription,
    verifierLienDesinscription,
    audienceNewsletter,
    corpsNewsletter,
    piedNewsletter,
    envoyerNewsletter,
    declencherNewsletter,
};
