/**
 * ENVOI D'E-MAILS TRANSACTIONNELS — la plomberie, pas le contenu (cf. mailTemplates.js).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * INERTE TANT QUE LE SMTP N'EST PAS CONFIGURÉ. Si `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` manquent,
 * `sendMail` devient un no-op qui prévient une fois dans le journal. L'application se comporte
 * alors EXACTEMENT comme avant l'e-mail — on peut donc déployer ce code avant même d'avoir créé
 * la boîte OVH, sans rien casser.
 *
 * TRANSPORT PARESSEUX, comme le pool de base : rien ne se connecte au chargement du module. La
 * connexion SMTP ne s'ouvre qu'au premier envoi — sinon `require('./mailer')` ouvrirait un socket
 * réseau au démarrage et à chaque test.
 *
 * BEST-EFFORT, TOUJOURS. Un e-mail raté ne doit JAMAIS faire échouer l'action qu'il accompagne :
 * créer un stagiaire doit réussir même si l'e-mail de bienvenue ne part pas. `sendMail` ne rejette
 * donc jamais — il renvoie `{ sent, reason }` et journalise l'échec. Les appelants font
 * « fire-and-forget » pour ne pas ralentir la requête d'une seconde d'aller-retour SMTP.
 */
const nodemailer = require('nodemailer');

let transport;      // instance nodemailer, ou null si non configuré
let resolved = false;

function getTransport() {
    if (resolved) return transport;
    resolved = true;
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
        transport = null;
        console.warn('[mail] SMTP non configuré (SMTP_HOST/SMTP_USER/SMTP_PASS) — aucun e-mail ne sera envoyé.');
        return null;
    }
    const port = Number(SMTP_PORT) || 465;
    transport = nodemailer.createTransport({
        host: SMTP_HOST,
        port,
        // 465 = SSL implicite ; 587 = STARTTLS. OVH accepte les deux, on privilégie 465.
        secure: port === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    return transport;
}

/** L'adresse d'expéditeur affichée. OVH EXIGE que l'adresse corresponde à la boîte authentifiée. */
function from() {
    return process.env.MAIL_FROM || process.env.SMTP_USER;
}

/** L'URL publique de l'application, pour les liens des e-mails (connexion, etc.). */
function appUrl() {
    return (process.env.APP_URL || 'https://impastio.com').replace(/\/+$/, '');
}

/**
 * Envoie un e-mail. Ne rejette JAMAIS. Renvoie { sent: bool, reason?: string }.
 * `text` est optionnel : à défaut, une version texte est dérivée du HTML (les clients sans HTML,
 * et les filtres anti-spam, veulent une alternative texte).
 */
async function sendMail({ to, subject, html, text }) {
    if (!to) return { sent: false, reason: 'destinataire absent' };
    const t = getTransport();
    if (!t) return { sent: false, reason: 'SMTP non configuré' };
    try {
        await t.sendMail({
            from: from(),
            to,
            subject,
            html,
            text: text || htmlToText(html),
        });
        return { sent: true };
    } catch (e) {
        console.error(`[mail] échec vers ${to} « ${subject} » :`, e.message);
        return { sent: false, reason: e.message };
    }
}

/** Repli texte minimal : enlève les balises, garde les liens lisibles. Pas un moteur complet. */
function htmlToText(html) {
    return String(html || '')
        .replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, '$2 ($1)')
        .replace(/<\/(p|div|h[1-6]|tr|li)>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

module.exports = { sendMail, appUrl, htmlToText, _getTransport: getTransport };
