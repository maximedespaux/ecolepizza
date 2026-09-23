const crypto = require('crypto');
const db = require('../config/database.js');
const { logAudit } = require('../lib/audit.js');
const { sendMail, envoiPossible, appUrl } = require('../lib/mailer.js');
const orgContext = require('../lib/orgContext.js');
const {
    MODELES_MAIL, CLES_MAIL, JETONS_GROUPE, lireModeleMail, lireEnvoiGroupe, rendre,
} = require('../lib/mailsPersonnalises.js');
const { DECLENCHEURS, UNITES, SENS, phraseRegle, lireRegle } = require('../lib/mailsProgrammes.js');
const { JETONS_REGLE } = require('../lib/passageMailsProgrammes.js');
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

/* ── LES IMAGES D'UN MESSAGE (migration 180) ────────────────────────────────────────────────
   Le texte porte des marqueurs `![légende](image:<id>)` ; on charge les images citées, et elles
   partent EN PIÈCE JOINTE avec le message (cid:), jamais par une URL que le client mail irait
   chercher — il les bloquerait, et une image distante trace qui ouvre le courrier. */
const MAX_IMAGES = 5;
const idsImages = (texte) => [...new Set(
    [...String(texte || '').matchAll(/!\[[^\]]*\]\(image:([\w-]{4,60})\)/gi)].map((m) => m[1].toLowerCase()),
)].slice(0, MAX_IMAGES);

/** Les images citées par ce texte, pour cet organisme. Table absente → aucune, sans erreur. */
async function chargerImages(conn, orgId, texte) {
    const ids = idsImages(texte);
    if (!ids.length) return [];
    try {
        const [rows] = await conn.query(
            'SELECT id, nom, mime, octets FROM mail_image WHERE organization_id = ? AND id IN (?)',
            [orgId, ids]);
        return rows;
    } catch (err) {
        if (sansTable(err)) return [];
        throw err;
    }
}

/** Les mêmes images, en pièces jointes « inline » pour nodemailer. */
const piecesImages = (images) => images.map((i) => ({
    filename: i.nom || 'image', content: i.octets, cid: `img-${i.id}`, contentDisposition: 'inline',
}));

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
    /* `pourApercu` : les images entrent dans le HTML en `data:`. L'aperçu vit dans une iframe en
       bac à sable — sans origine ni cookie, elle ne peut rien aller chercher à l'API. */
    const images = await chargerImages(db.promise(), req.user.organization_id, lu.valeurs.corps);
    res.json({ data: modeles.messageGroupeEmail({
        objet: rendre(lu.valeurs.objet, valeurs),
        corps: rendre(lu.valeurs.corps, valeurs),
        /* L'ADRESSE DE RÉPONSE AUSSI DANS L'APERÇU : elle décide du pied de page, et une école qui
           relit son message doit voir la phrase que le stagiaire lira. */
        orgName, images, pourApercu: true, repondreA: orgContext.orgInfo().email || null,
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
    /* UNE SEMAINE, ET NON UNE SESSION : l'école écrit aux gens QU'ELLE A CETTE SEMAINE-LÀ
       (demandé le 2026-09-23). La semaine 38 porte deux sessions et cinq personnes ; en visant
       les sessions une par une, on écrivait deux fois — et le deuxième message, écrit dix
       minutes plus tard, ne disait jamais tout à fait la même chose que le premier.
       LE DÉDOUBLONNAGE EST DANS LE `DISTINCT` : quelqu'un d'inscrit aux deux sessions de la
       semaine ne reçoit qu'un message. */
    if (type === 'semaine' && b.semaine) {
        const annee = Number(b.annee) || new Date().getFullYear();
        const sem = Number(b.semaine) || 0;
        const [rows] = await conn.query(
            `SELECT DISTINCT l.id, l.first_name, l.last_name, l.email
               FROM enrollment e
               JOIN training_session s ON s.id = e.session_id
               JOIN learner l ON l.id = e.learner_id
              WHERE s.year = ? AND s.week = ? AND e.organization_id = ?
              ORDER BY l.last_name, l.first_name`, [annee, sem, orgId]);
        const [[n]] = await conn.query(
            'SELECT COUNT(*) AS n FROM training_session WHERE year = ? AND week = ? AND organization_id = ?',
            [annee, sem, orgId]);
        const nb = Number((n && n.n) || 0);
        return { liste: rows, cible: `Semaine ${sem} — ${annee} (${nb} session${nb > 1 ? 's' : ''})` };
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
            /* L'ADRESSE DE L'ÉCOLE, pour que l'écran puisse annoncer la copie — et dire qu'il n'y
               en aura pas quand l'organisme n'a pas d'adresse renseignée, plutôt que de laisser
               croire à une copie qui ne partira jamais. */
            copie_ecole: orgContext.orgInfo().email || null,
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
        const adresseEcole = o.email || null;
        /* CHARGÉES UNE FOIS pour tout l'envoi : quinze destinataires, une seule lecture — et les
           mêmes octets réutilisés pour chaque message. */
        const images = await chargerImages(conn, orgId, lu.valeurs.corps);
        let envoyes = 0;
        let echecs = 0;

        /* UN MESSAGE PAR PERSONNE, ET C'EST LE SEUL MODE (revenu au 2026-09-23 après essai).
           Un envoi unique en copie cachée avait été écrit : il interdit toute personnalisation —
           un seul corps pour tout le monde, donc aucun {Prénom} rempli. L'école a tranché pour la
           boucle : chacun reçoit SON message. Personne ne voit l'adresse d'un autre, puisque
           personne ne partage d'enveloppe. */
        for (const l of avec) {
            const valeurs = {
                'Prénom': l.first_name || '', Nom: l.last_name || '', Organisme: orgName || 'École Pizza',
            };
            const { subject, html } = modeles.messageGroupeEmail({
                objet: rendre(lu.valeurs.objet, valeurs),
                corps: rendre(lu.valeurs.corps, valeurs),
                orgName, images, repondreA: adresseEcole,
            });
            /* PAS DE `kind` : les cinq interrupteurs coupent des e-mails AUTOMATIQUES. Celui-ci
               est un geste délibéré, déclenché à l'instant — le couper au nom d'un réglage fait
               pour les envois automatiques rendrait le bouton muet sans rien expliquer. */
            /* `replyTo` ET `repondreA` PORTENT LA MÊME ADRESSE, exprès : le pied de page dit
               « vous pouvez y répondre » exactement quand la réponse a où aller. L'expéditeur,
               lui, reste la boîte technique — OVH n'en accepte pas d'autre. */
            const r = await sendMail({ to: l.email, replyTo: adresseEcole, subject, html, attachments: piecesImages(images) });
            if (r.sent) envoyes += 1; else echecs += 1;
        }
        /* UNE SEULE COPIE À L'ÉCOLE, et non une par destinataire : la mettre en copie de chaque
           message lui en ferait quinze dans sa boîte pour un seul envoi. Elle reçoit donc UN
           exemplaire, annoncé pour ce qu'il est — sans quoi il se lirait comme un message qui lui
           est adressé. */
        if (adresseEcole && envoyes > 0) {
            const valeurs = { 'Prénom': avec[0].first_name || '', Nom: avec[0].last_name || '', Organisme: orgName || 'École Pizza' };
            const entete = '<p style="margin:0 0 14px;padding:10px 12px;background:#f7f8fb;border:1px solid #e6e8ee;'
                + `border-radius:8px;font-size:13px;color:#5e5e68">Copie de l’envoi à ${envoyes} destinataire`
                + `${envoyes > 1 ? 's' : ''} — ${cible || 'groupe'}. Chacun a reçu ce message avec ses propres informations.</p>`;
            const { subject, html } = modeles.messageGroupeEmail({
                objet: rendre(lu.valeurs.objet, valeurs),
                corps: rendre(lu.valeurs.corps, valeurs),
                orgName, images, repondreA: adresseEcole,
            });
            await sendMail({ to: adresseEcole, subject: `[Copie] ${subject}`,
                html: html.replace('<h1', `${entete}<h1`), attachments: piecesImages(images) });
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
        res.json({ data: { envoyes, echecs, cible, journalise, copie: !!adresseEcole } });
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

/**
 * POST /api/mailing/images — déposer une image dans la bibliothèque du mailing.
 *
 * ELLE EST REDIMENSIONNÉE PAR LE NAVIGATEUR avant l'envoi, comme les photos de la communauté :
 * une photo de téléphone fait quatre mégaoctets, et quatre mégaoctets en pièce jointe d'un
 * courrier partent en indésirable. Le serveur borne quand même — on ne fait jamais confiance au
 * client sur une taille.
 */
const MAX_IMAGE_OCTETS = 600 * 1024;
const MIMES_IMAGE = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

const televerserImage = async (req, res) => {
    const f = req.file;
    if (!f) return res.status(422).json({ message: 'Aucun fichier reçu.' });
    if (!MIMES_IMAGE.includes(f.mimetype)) {
        return res.status(422).json({ message: 'Format accepté : PNG, JPEG, WebP ou GIF.' });
    }
    if (f.size > MAX_IMAGE_OCTETS) {
        return res.status(413).json({ message: `Image trop lourde (${Math.round(f.size / 1024)} Ko) : ${Math.round(MAX_IMAGE_OCTETS / 1024)} Ko au plus.` });
    }
    try {
        const id = crypto.randomUUID();
        await db.promise().query(
            'INSERT INTO mail_image (id, organization_id, nom, mime, octets, created_by) VALUES (?, ?, ?, ?, ?, ?)',
            [id, req.user.organization_id, String(f.originalname || 'image').slice(0, 160), f.mimetype, f.buffer, req.user.id]);
        logAudit(req, 'mail.image', 'MailImage', id);
        res.status(201).json({ data: { id, nom: f.originalname || 'image', mime: f.mimetype, octets: f.size } });
    } catch (err) {
        if (sansTable(err)) return res.status(503).json({ message: 'Migration 180 non jouée : les images ne sont pas encore disponibles.' });
        console.error('Erreur dépôt image mail :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** GET /api/mailing/images — la bibliothèque, sans les octets (on ne charge pas ce qu'on liste). */
const listerImages = async (req, res) => {
    try {
        const [rows] = await db.promise().query(
            `SELECT id, nom, mime, LENGTH(octets) AS octets, DATE_FORMAT(created_at, '%Y-%m-%d') AS quand
               FROM mail_image WHERE organization_id = ? ORDER BY created_at DESC LIMIT 60`,
            [req.user.organization_id]);
        res.json({ data: rows });
    } catch (err) {
        if (sansTable(err)) return res.json({ data: [], message: 'Migration 180 non jouée.' });
        console.error('Erreur liste images mail :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /api/mailing/images/:id — l'image elle-même, pour la bibliothèque à l'écran.
 *
 * L'APERÇU, LUI, NE PASSE PAS PAR ICI : son iframe est en bac à sable, sans cookie ni origine.
 * Cette route sert la vignette de la bibliothèque, dans la page elle-même.
 */
const servirImage = async (req, res) => {
    try {
        const [[img]] = await db.promise().query(
            'SELECT mime, octets FROM mail_image WHERE id = ? AND organization_id = ?',
            [req.params.id, req.user.organization_id]);
        if (!img) return res.status(404).json({ message: 'Image introuvable.' });
        /* `no-store` COMME TOUT LE RESTE : l'invariant de cette application est que rien de servi
           par l'API ne se garde sur le disque du navigateur, et une vignette de bibliothèque ne
           vaut pas qu'on rouvre la porte (cf. cache-documents.test.js). */
        res.set('Content-Type', img.mime).set('Cache-Control', 'no-store').send(img.octets);
    } catch (err) {
        if (sansTable(err)) return res.status(404).json({ message: 'Image introuvable.' });
        console.error('Erreur lecture image mail :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** DELETE /api/mailing/images/:id — retirer une image de la bibliothèque. */
const supprimerImage = async (req, res) => {
    try {
        const [r] = await db.promise().query('DELETE FROM mail_image WHERE id = ? AND organization_id = ?',
            [req.params.id, req.user.organization_id]);
        if (!r.affectedRows) return res.status(404).json({ message: 'Image introuvable.' });
        logAudit(req, 'mail.image.suppression', 'MailImage', req.params.id);
        /* LES MESSAGES DÉJÀ ENVOYÉS NE CHANGENT PAS : leur image est partie avec eux. Un texte
           programmé qui la citait encore la perdra — le marqueur s'efface au rendu. */
        res.json({ data: { id: req.params.id } });
    } catch (err) {
        if (sansTable(err)) return res.status(503).json({ message: 'Migration 180 non jouée.' });
        console.error('Erreur suppression image mail :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/* ── LES ENVOIS PROGRAMMÉS (migration 179) ─────────────────────────────────────────────────── */

const MIGRATION_179 = 'Migration 179 non jouée : les envois programmés ne sont pas encore disponibles.';

/** GET /api/mailing/regles — les règles, leur phrase, et ce qu'elles ont déjà envoyé. */
const getRegles = async (req, res) => {
    try {
        const [rows] = await db.promise().query(
            `SELECT r.id, r.nom, r.declencheur, r.sens, r.decalage, r.unite, r.program_id,
                    r.objet, r.corps, r.actif, DATE_FORMAT(r.depuis, '%Y-%m-%d') AS depuis,
                    p.code AS formation_code, p.title AS formation_titre,
                    (SELECT COUNT(*) FROM mail_regle_envoi x WHERE x.regle_id = r.id AND x.statut = 'envoye') AS envoyes,
                    (SELECT COUNT(*) FROM mail_regle_envoi x WHERE x.regle_id = r.id AND x.statut = 'echec') AS echecs,
                    (SELECT DATE_FORMAT(MAX(x.envoye_le), '%Y-%m-%d %H:%i') FROM mail_regle_envoi x WHERE x.regle_id = r.id) AS dernier
               FROM mail_regle r LEFT JOIN training_program p ON p.id = r.program_id
              WHERE r.organization_id = ? ORDER BY r.created_at DESC`, [req.user.organization_id]);
        res.json({
            data: rows.map((r) => ({ ...r, phrase: phraseRegle(r) })),
            /* L'ÉCRAN A BESOIN DU VOCABULAIRE, pas d'une liste recopiée à côté : déclencheurs,
               unités, sens et jetons viennent d'ici, donc du même endroit que la règle. */
            catalogue: {
                declencheurs: Object.entries(DECLENCHEURS).map(([cle, d]) => ({ cle, libelle: d.libelle })),
                unites: Object.entries(UNITES).map(([cle, libelle]) => ({ cle, libelle })),
                sens: Object.entries(SENS).map(([cle, libelle]) => ({ cle, libelle })),
                jetons: JETONS_REGLE,
            },
            disponible: true,
        });
    } catch (err) {
        if (sansTable(err)) {
            return res.json({ data: [], disponible: false, message: MIGRATION_179,
                catalogue: {
                    declencheurs: Object.entries(DECLENCHEURS).map(([cle, d]) => ({ cle, libelle: d.libelle })),
                    unites: Object.entries(UNITES).map(([cle, libelle]) => ({ cle, libelle })),
                    sens: Object.entries(SENS).map(([cle, libelle]) => ({ cle, libelle })),
                    jetons: JETONS_REGLE,
                } });
        }
        console.error('Erreur lecture règles mail :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/mailing/regles — créer une règle.
 *
 * `depuis` VAUT AUJOURD'HUI, ET N'EST PAS DEMANDÉ. C'est le garde-fou : une règle « trois mois
 * après la fin » qui rattraperait le passé écrirait d'un coup à trois ans d'anciens stagiaires.
 * L'école l'a tranché le 2026-09-23 — rien avant la création.
 */
const creerRegle = async (req, res) => {
    const lu = lireRegle(req.body || {}, { jetons: JETONS_REGLE });
    if (lu.erreur) return res.status(422).json({ message: lu.erreur });
    const v = lu.valeurs;
    try {
        const id = crypto.randomUUID();
        await db.promise().query(
            `INSERT INTO mail_regle (id, organization_id, nom, declencheur, sens, decalage, unite,
                    program_id, objet, corps, actif, depuis, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), ?)`,
            [id, req.user.organization_id, v.nom, v.declencheur, v.sens, v.decalage, v.unite,
                v.program_id, v.objet, v.corps, v.actif, req.user.id]);
        logAudit(req, 'mail.regle', 'MailRegle', id);
        res.status(201).json({ data: { id, ...v, phrase: phraseRegle(v) } });
    } catch (err) {
        if (sansTable(err)) return res.status(503).json({ message: MIGRATION_179 });
        console.error('Erreur création règle mail :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** PUT /api/mailing/regles/:id — modifier une règle. `depuis` NE BOUGE PAS : elle a déjà servi. */
const modifierRegle = async (req, res) => {
    const lu = lireRegle(req.body || {}, { jetons: JETONS_REGLE });
    if (lu.erreur) return res.status(422).json({ message: lu.erreur });
    const v = lu.valeurs;
    try {
        const [r] = await db.promise().query(
            `UPDATE mail_regle SET nom = ?, declencheur = ?, sens = ?, decalage = ?, unite = ?,
                    program_id = ?, objet = ?, corps = ?, actif = ?
              WHERE id = ? AND organization_id = ?`,
            [v.nom, v.declencheur, v.sens, v.decalage, v.unite, v.program_id, v.objet, v.corps,
                v.actif, req.params.id, req.user.organization_id]);
        if (!r.affectedRows) return res.status(404).json({ message: 'Règle introuvable.' });
        logAudit(req, 'mail.regle', 'MailRegle', req.params.id);
        res.json({ data: { id: req.params.id, ...v, phrase: phraseRegle(v) } });
    } catch (err) {
        if (sansTable(err)) return res.status(503).json({ message: MIGRATION_179 });
        console.error('Erreur modification règle mail :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * DELETE /api/mailing/regles/:id — supprimer une règle.
 *
 * ELLE PART AVEC SA MÉMOIRE (cascade sur `mail_regle_envoi`), et c'est assumé : une règle
 * supprimée ne reviendra pas, et garder la trace d'envois d'une règle disparue n'aide personne.
 * Pour l'arrêter sans perdre la mémoire, il y a l'interrupteur « active ».
 */
const supprimerRegle = async (req, res) => {
    try {
        const [r] = await db.promise().query('DELETE FROM mail_regle WHERE id = ? AND organization_id = ?',
            [req.params.id, req.user.organization_id]);
        if (!r.affectedRows) return res.status(404).json({ message: 'Règle introuvable.' });
        logAudit(req, 'mail.regle.suppression', 'MailRegle', req.params.id);
        res.json({ data: { id: req.params.id } });
    } catch (err) {
        if (sansTable(err)) return res.status(503).json({ message: MIGRATION_179 });
        console.error('Erreur suppression règle mail :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { getModeles, saveModele, resetModele, apercu, getDestinataires, envoyerGroupe, getEnvois,
    getRegles, creerRegle, modifierRegle, supprimerRegle,
    televerserImage, listerImages, servirImage, supprimerImage, chargerImages, piecesImages,
    MAX_DESTINATAIRES, MIGRATION, JETONS_GROUPE };
