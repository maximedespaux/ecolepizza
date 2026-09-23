const crypto = require('crypto');
const db = require('../config/database.js');
const { logAudit } = require('../lib/audit.js');
const { sendMail, envoiPossible, appUrl } = require('../lib/mailer.js');
const orgContext = require('../lib/orgContext.js');
const {
    MODELES_MAIL, CLES_MAIL, JETONS_GROUPE, lireModeleMail, lireEnvoiGroupe, rendre,
} = require('../lib/mailsPersonnalises.js');
const modeles = require('../lib/mailTemplates.js');

/**
 * MAILING — les e-mails de l'école : ceux qu'elle réécrit, et ceux qu'elle écrit (2026-09-23).
 *
 * DEUX CHOSES BIEN DISTINCTES, dans un seul contrôleur parce qu'elles partagent tout le reste
 * (les jetons, le rendu, la coquille) :
 *   · les e-mails AUTOMATIQUES, dont l'école peut changer l'objet, le titre et la prose ;
 *   · un e-mail ÉCRIT À UN GROUPE, envoyé une fois, à des stagiaires choisis.
 *
 * L'ENVOI À UN GROUPE EST UN MESSAGE DE SERVICE, et l'écran le dit : convocation, rappel, document
 * à signer. Pas de démarchage — celui-là relèverait du consentement, qui a son registre et ses
 * règles (cf. lib/consentements.js), et se ferait alors avec un lien de désinscription. L'école a
 * tranché le 2026-09-23 : ce Mailing ne sert qu'aux messages liés à la formation.
 *
 * TOLÈRE LA 178 NON JOUÉE : les modèles reviennent au texte livré, et l'envoi répond 503 avec la
 * phrase qui le dit, plutôt qu'une erreur 500 qu'il faudrait aller lire dans les journaux.
 */

const MIGRATION = 'Migration 178 non jouée : les e-mails personnalisés ne sont pas encore disponibles.';
const sansTable = (err) => err && (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_FIELD_ERROR');
/* Un envoi à un groupe reste un geste humain : au-delà, c'est une campagne, et ce n'est pas ce
   que cet écran promet (ni ce que le SMTP de l'école encaisse d'un coup). */
const MAX_DESTINATAIRES = 200;

/** GET /api/mailing/modeles — le catalogue, avec le texte de l'école là où elle en a écrit un. */
const getModeles = async (req, res) => {
    const orgId = req.user.organization_id;
    let ecrits = {};
    let disponible = true;
    try {
        const [rows] = await db.promise().query(
            'SELECT cle, objet, titre, intro, pied, updated_at FROM mail_modele WHERE organization_id = ?', [orgId]);
        ecrits = Object.fromEntries(rows.map((r) => [r.cle, r]));
    } catch (err) {
        if (!sansTable(err)) { console.error('Erreur lecture modèles mail :', err); return res.status(500).json({ error: 'Internal Server Error' }); }
        disponible = false;
    }
    res.json({
        data: CLES_MAIL.map((cle) => {
            const d = MODELES_MAIL[cle];
            const e = ecrits[cle] || null;
            return {
                cle, libelle: d.libelle, jetons: d.jetons, charpente: d.charpente,
                defauts: { objet: d.objet, titre: d.titre, intro: d.intro, pied: d.pied },
                /* `perso` DIT S'IL Y A UN TEXTE DE L'ÉCOLE, et l'écran s'en sert pour proposer
                   « revenir au texte d'origine » — sans quoi on ne saurait pas distinguer un
                   texte réécrit à l'identique d'un texte jamais touché. */
                perso: !!e,
                valeurs: e ? { objet: e.objet, titre: e.titre, intro: e.intro || '', pied: e.pied || '' }
                    : { objet: d.objet, titre: d.titre, intro: d.intro, pied: d.pied },
                modifie_le: e ? e.updated_at : null,
            };
        }),
        disponible,
        message: disponible ? null : MIGRATION,
    });
};

/** PUT /api/mailing/modeles/:cle — l'école réécrit un e-mail automatique. */
const saveModele = async (req, res) => {
    const orgId = req.user.organization_id;
    const cle = String(req.params.cle || '');
    const lu = lireModeleMail(cle, req.body || {});
    if (lu.erreur) return res.status(422).json({ message: lu.erreur });
    try {
        await db.promise().query(
            `INSERT INTO mail_modele (id, organization_id, cle, objet, titre, intro, pied, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE objet = VALUES(objet), titre = VALUES(titre),
                    intro = VALUES(intro), pied = VALUES(pied), updated_by = VALUES(updated_by)`,
            [crypto.randomUUID(), orgId, cle, lu.valeurs.objet, lu.valeurs.titre,
                lu.valeurs.intro, lu.valeurs.pied, req.user.id]);
        /* LE CACHE EST RAFRAÎCHI TOUT DE SUITE : il l'est aussi toutes les dix minutes, mais
           attendre dix minutes pour voir sa propre correction partir donnerait l'impression que
           l'enregistrement n'a pas pris. */
        await orgContext.charger();
        logAudit(req, 'mail.modele', 'MailModele', cle);
        res.json({ data: { cle, ...lu.valeurs } });
    } catch (err) {
        if (sansTable(err)) return res.status(503).json({ message: MIGRATION });
        console.error('Erreur enregistrement modèle mail :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** DELETE /api/mailing/modeles/:cle — revenir au texte livré avec l'application. */
const resetModele = async (req, res) => {
    const cle = String(req.params.cle || '');
    if (!MODELES_MAIL[cle]) return res.status(422).json({ message: 'Type d’e-mail inconnu.' });
    try {
        await db.promise().query('DELETE FROM mail_modele WHERE organization_id = ? AND cle = ?',
            [req.user.organization_id, cle]);
        await orgContext.charger();
        logAudit(req, 'mail.modele.defaut', 'MailModele', cle);
        res.json({ data: { cle } });
    } catch (err) {
        if (sansTable(err)) return res.status(503).json({ message: MIGRATION });
        console.error('Erreur retour au modèle par défaut :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/mailing/apercu — l'e-mail tel qu'il partira, avec des valeurs d'exemple.
 *
 * L'APERÇU PASSE PAR LES MÊMES GABARITS que l'envoi réel : c'est tout l'intérêt. Un aperçu
 * reconstruit à côté montrerait un e-mail que personne ne recevra jamais.
 */
const apercu = async (req, res) => {
    const b = req.body || {};
    const orgName = orgContext.orgInfo().short_name || orgContext.orgInfo().legal_name || null;
    if (b.cle) {
        const lu = lireModeleMail(String(b.cle), b);
        if (lu.erreur) return res.status(422).json({ message: lu.erreur });
        /* ON REND AVEC LE TEXTE ENVOYÉ, pas avec celui en base : l'école regarde ce qu'elle vient
           de taper, avant d'enregistrer. D'où le passage par un cache temporaire. */
        return res.json({ data: rendreApercu(String(b.cle), lu.valeurs, orgName) });
    }
    const lu = lireEnvoiGroupe(b);
    if (lu.erreur) return res.status(422).json({ message: lu.erreur });
    const valeurs = { 'Prénom': 'Camille', Nom: 'BERGER', Organisme: orgName || 'École Pizza' };
    res.json({ data: modeles.messageGroupeEmail({
        objet: rendre(lu.valeurs.objet, valeurs),
        corps: rendre(lu.valeurs.corps, valeurs),
        orgName,
    }) });
};

/* Les valeurs d'exemple d'un aperçu, par type : celles que le code passe en vrai. */
const EXEMPLES = {
    credentials: { firstName: 'Camille', email: 'camille.berger@exemple.fr', password: 'Aq7-42xb', loginUrl: '' },
    reset: { firstName: 'Camille', password: 'Aq7-42xb', loginUrl: '' },
    forgot: { firstName: 'Camille', resetUrl: '' },
    security: { firstName: 'Camille', kind: 'email', detail: '', cancelUrl: '' },
    notifications: { firstName: 'Camille', title: 'Émargement à signer', body: 'La feuille du 5 octobre attend votre signature.', link: '' },
};
const GABARIT = {
    credentials: 'credentialsEmail', reset: 'resetEmail', forgot: 'resetLinkEmail',
    security: 'securityAlertEmail', notifications: 'notificationEmail',
};

function rendreApercu(cle, valeurs, orgName) {
    const url = appUrl();
    const args = { ...EXEMPLES[cle], orgName };
    for (const k of ['loginUrl', 'resetUrl', 'cancelUrl', 'link']) if (k in args) args[k] = url;
    /* LE TEXTE EN COURS DE FRAPPE PREND LE PAS, le temps de l'aperçu : on pose un modèle
       temporaire que `modeleMail` renverra, puis on le retire — même si le rendu échoue. */
    const rendu = orgContext.avecModeleTemporaire(cle, valeurs, () => modeles[GABARIT[cle]](args));
    return { subject: rendu.subject, html: rendu.html };
}

/**
 * LES DESTINATAIRES D'UN ENVOI — une session, une formation, ou des stagiaires choisis.
 *
 * SANS ADRESSE, PAS DE DESTINATAIRE, et l'écran le dit plutôt que de les compter : une session de
 * douze où trois fiches n'ont pas d'e-mail enverrait neuf messages en annonçant douze.
 * LES DOUBLONS SONT ÉCARTÉS : une même personne inscrite à deux sessions d'une formation ne doit
 * pas recevoir deux fois le même message.
 */
async function resoudreCibles(conn, orgId, b) {
    const type = String(b.type || '');
    const ids = Array.isArray(b.ids) ? b.ids.filter((x) => typeof x === 'string') : [];
    if (type === 'session' && b.id) {
        const [rows] = await conn.query(
            `SELECT DISTINCT l.id, l.first_name, l.last_name, l.email
               FROM enrollment e JOIN learner l ON l.id = e.learner_id
              WHERE e.session_id = ? AND e.organization_id = ?
              ORDER BY l.last_name, l.first_name`, [b.id, orgId]);
        const [[s]] = await conn.query(
            `SELECT p.title, p.code, DATE_FORMAT(s.start_date, '%d/%m/%Y') AS debut
               FROM training_session s LEFT JOIN training_program p ON p.id = s.program_id
              WHERE s.id = ? AND s.organization_id = ?`, [b.id, orgId]);
        return { liste: rows, cible: s ? `Session ${s.code || s.title || ''} du ${s.debut || '?'}`.trim() : 'Session' };
    }
    if (type === 'formation' && b.id) {
        const [rows] = await conn.query(
            `SELECT DISTINCT l.id, l.first_name, l.last_name, l.email
               FROM enrollment e
               JOIN training_session s ON s.id = e.session_id
               JOIN learner l ON l.id = e.learner_id
              WHERE s.program_id = ? AND e.organization_id = ?
              ORDER BY l.last_name, l.first_name`, [b.id, orgId]);
        const [[p]] = await conn.query('SELECT code, title FROM training_program WHERE id = ? AND organization_id = ?',
            [b.id, orgId]);
        return { liste: rows, cible: p ? `Formation ${p.code || p.title}` : 'Formation' };
    }
    if (type === 'stagiaires' && ids.length) {
        const [rows] = await conn.query(
            `SELECT id, first_name, last_name, email FROM learner
              WHERE organization_id = ? AND id IN (?) ORDER BY last_name, first_name`, [orgId, ids]);
        return { liste: rows, cible: `${rows.length} stagiaire${rows.length > 1 ? 's' : ''} choisi${rows.length > 1 ? 's' : ''}` };
    }
    return { liste: [], cible: '' };
}

/** POST /api/mailing/destinataires — qui recevrait ce message, avant de l'envoyer. */
const getDestinataires = async (req, res) => {
    try {
        const conn = db.promise();
        const { liste, cible } = await resoudreCibles(conn, req.user.organization_id, req.body || {});
        const avec = liste.filter((l) => l.email);
        res.json({ data: {
            cible,
            destinataires: avec.map((l) => ({ id: l.id, nom: [l.last_name, l.first_name].filter(Boolean).join(' '), email: l.email })),
            /* CEUX QU'ON NE PEUT PAS JOINDRE SE DISENT AUSSI : ils sont l'information utile, pas
               un détail à masquer — c'est une fiche à compléter. */
            sans_email: liste.filter((l) => !l.email).map((l) => [l.last_name, l.first_name].filter(Boolean).join(' ')),
            envoi_possible: envoiPossible(),
        } });
    } catch (err) {
        console.error('Erreur destinataires mailing :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/mailing/envoi — écrire à un groupe, une fois.
 *
 * ENVOI SÉQUENTIEL, ET ASSUMÉ. Trente e-mails partent en quelques secondes ; le parallélisme
 * ferait gagner peu et mettrait le SMTP de l'école en face d'une rafale, ce que les fournisseurs
 * traitent comme du spam. `sendMail` ne rejette jamais : chaque échec est COMPTÉ, l'envoi
 * continue, et le journal garde le nombre — un envoi à moitié parti doit se voir.
 */
const envoyerGroupe = async (req, res) => {
    const orgId = req.user.organization_id;
    const b = req.body || {};
    const lu = lireEnvoiGroupe(b);
    if (lu.erreur) return res.status(422).json({ message: lu.erreur });
    if (!envoiPossible()) return res.status(409).json({ message: 'Aucun SMTP configuré : rien ne peut partir.' });
    try {
        const conn = db.promise();
        const { liste, cible } = await resoudreCibles(conn, orgId, b);
        const avec = liste.filter((l) => l.email);
        if (!avec.length) return res.status(422).json({ message: 'Aucun destinataire avec une adresse e-mail.' });
        if (avec.length > MAX_DESTINATAIRES) {
            return res.status(422).json({ message: `Un envoi porte ${MAX_DESTINATAIRES} destinataires au plus.` });
        }

        const o = orgContext.orgInfo();
        const orgName = o.short_name || o.legal_name || null;
        let envoyes = 0;
        let echecs = 0;
        for (const l of avec) {
            const valeurs = {
                'Prénom': l.first_name || '', Nom: l.last_name || '', Organisme: orgName || 'École Pizza',
            };
            const { subject, html } = modeles.messageGroupeEmail({
                objet: rendre(lu.valeurs.objet, valeurs),
                corps: rendre(lu.valeurs.corps, valeurs),
                orgName,
            });
            /* PAS DE `kind` : les cinq interrupteurs coupent des e-mails AUTOMATIQUES. Celui-ci
               est un geste délibéré, déclenché à l'instant — le couper au nom d'un réglage fait
               pour les envois automatiques rendrait le bouton muet sans rien expliquer. */
            const r = await sendMail({ to: l.email, subject, html });
            if (r.sent) envoyes += 1; else echecs += 1;
        }

        /* LA TRACE, MÊME PARTIELLE : ce qui est parti est parti. Une table absente ne doit pas
           faire croire à un échec d'envoi — on le dit, sans perdre le compte. */
        let journalise = true;
        try {
            await conn.query(
                `INSERT INTO mail_envoi (id, organization_id, objet, corps, cible, destinataires, echecs,
                        learner_ids, envoye_par)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [crypto.randomUUID(), orgId, lu.valeurs.objet, lu.valeurs.corps, cible,
                    envoyes, echecs, avec.map((l) => l.id).join(','), req.user.id]);
        } catch (err) {
            if (!sansTable(err)) throw err;
            journalise = false;
        }
        logAudit(req, 'mail.envoi', 'MailEnvoi', null);
        res.json({ data: { envoyes, echecs, cible, journalise } });
    } catch (err) {
        console.error('Erreur envoi groupe :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** GET /api/mailing/envois — l'historique, pour savoir ce qui est déjà parti. */
const getEnvois = async (req, res) => {
    try {
        const [rows] = await db.promise().query(
            `SELECT e.id, e.objet, e.cible, e.destinataires, e.echecs,
                    DATE_FORMAT(e.created_at, '%Y-%m-%d %H:%i') AS quand,
                    TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS par
               FROM mail_envoi e LEFT JOIN user u ON u.id = e.envoye_par
              WHERE e.organization_id = ? ORDER BY e.created_at DESC LIMIT 30`,
            [req.user.organization_id]);
        res.json({ data: rows });
    } catch (err) {
        if (sansTable(err)) return res.json({ data: [], message: MIGRATION });
        console.error('Erreur historique mailing :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { getModeles, saveModele, resetModele, apercu, getDestinataires, envoyerGroupe, getEnvois,
    MAX_DESTINATAIRES, MIGRATION, JETONS_GROUPE };
