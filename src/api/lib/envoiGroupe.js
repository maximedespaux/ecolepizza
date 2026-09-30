/**
 * L'ENVOYEUR DES E-MAILS AUTOMATIQUES DE L'ÉCOLE — une seule copie, pour les deux chemins qui en ont
 * besoin : le passage des envois programmés (server.js) et le crochet des règles de document
 * (crochetMailsDocument.js). server.js prévenait déjà que « deux copies finiraient par diverger, et
 * une règle enverrait des images que l'autre chemin attache » : il n'y en a plus qu'une.
 *
 * Il rend une fonction `envoyer({ to, objet, corps, orgId })` qui charge les images citées dans le
 * message (comme « Écrire à un groupe »), pose le Reply-To de l'école, met en page et envoie. PAS de
 * `kind` : une règle écrite par l'école est SON envoi, arrêté par son propre interrupteur « active »,
 * pas par les interrupteurs des cinq e-mails du code (138). `sendMail` ne rejette jamais.
 */
const { messageGroupeEmail } = require('./mailTemplates.js');
const { sendMail } = require('./mailer.js');
const org = require('./orgContext.js');

function construireEnvoyeur() {
    return async ({ to, objet, corps, orgId }) => {
        /* Requis À L'APPEL (comme dans server.js) : le contrôleur du mailing tire beaucoup de choses,
           et le charger au sommet d'une lib de bas niveau risquerait un cycle. */
        const { chargerImages, piecesImages } = require('../controllers/mailing.controller.js');
        const db = require('../config/database.js').promise();
        const images = await chargerImages(db, orgId, corps).catch(() => []);
        const repondreA = org.orgInfo().email || null;
        const { subject, html } = messageGroupeEmail({
            objet, corps, orgName: org.orgInfo().short_name || null, images, repondreA,
        });
        return sendMail({ to, replyTo: repondreA, subject, html, attachments: piecesImages(images) });
    };
}

module.exports = { construireEnvoyeur };
