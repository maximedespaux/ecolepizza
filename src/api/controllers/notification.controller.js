const crypto = require('crypto');
const db = require('../config/database.js');
const { sendMail, appUrl } = require('../lib/mailer.js');
const { notificationEmail } = require('../lib/mailTemplates.js');
const { sectionsVisibles, entitesVisibles, sectionDeLEntite, estLu, regrouperConsecutives, estEvenement, SECTION_PAR_ENTITE } = require('../lib/activite.js');
const { aLaCapaciteEnBase } = require('../lib/capacites.js');
const { preciser } = require('../lib/precisionsActivite.js');
const { colonneExiste } = require('../lib/colonnes.js');
const { STAFF_ROLES, AUDIT_ROLES } = require('../middlewares/auth.middleware.js');

/* LA CLOCHE D'ORGANISME EST RÉSERVÉE À L'ÉQUIPE INTERNE (audit du 2026-10-07).
   Une notification `user_id` nul est « visible par tout l'organisme » — mais « l'organisme », ici,
   c'est l'ÉQUIPE : ces alertes nomment des commandes boutique (nom du stagiaire, montant, retrait)
   et des signatures (« Signé par X »). Les lire n'a de sens que pour qui traite le dossier. Sans ce
   filtre, un STAGIAIRE ou une ENTREPRISE ouvrant sa cloche voyait les commandes et les signatures de
   TOUT LE MONDE, et pouvait d'un « tout marquer lu » éteindre la cloche de l'équipe.
   Les non-équipe gardent leurs notifications NOMINATIVES (`user_id` = le leur) : un stagiaire reçoit
   toujours son « Émargement à signer » (lib/relancesEmargement.js). LISTE POSITIVE, jamais une
   exclusion « tout rôle sauf stagiaire » (le travers payé plusieurs fois, cf. CLAUDE.md). */
const ROLES_CLOCHE_ORG = [...new Set([...STAFF_ROLES, ...AUDIT_ROLES])];
const voitClocheOrg = (role) => ROLES_CLOCHE_ORG.includes(role);
/* Le fragment WHERE de portée : l'équipe voit AUSSI l'organisme (user_id nul), les autres UNIQUEMENT
   leurs lignes nominatives. Les paramètres liés (…, user_id) ne changent pas entre les deux formes. */
const porteeNotif = (role) => (voitClocheOrg(role) ? '(user_id = ? OR user_id IS NULL)' : 'user_id = ?');

/* SUPPRIMER UNE NOTIFICATION EST UN DROIT NOMINATIF, pas un attribut de rôle. La raison tient à
   une particularité de la table : une notification d'organisme (`user_id` nul) est UNE ligne
   partagée. La supprimer ne la retire pas de ma cloche, elle la retire de CELLE DE TOUT LE
   MONDE — y compris de quelqu'un qui ne l'a pas encore lue. Ce n'est donc pas « ranger chez
   soi », c'est effacer une information chez les autres, et ça se donne à qui l'organisme
   désigne. Les propriétaires l'ont d'office ; la liste ci-dessous doit rester identique au
   `defaultRoles` affiché dans « Équipe & accès » (un test le vérifie). */
const CAP_SUPPRIMER_NOTIF = 'cap:delete-notifications';
const ROLES_SUPPRESSION_DOFFICE = ['SUPER_ADMIN', 'ADMIN_ORGANISME'];

/**
 * Crée une notification (best-effort). user_id null = visible par tout l'organisme.
 * `email: false` retire le double par e-mail — pour une alerte RÉPÉTÉE, comme les relances
 * d'émargement (deux par demi-journée de cours, cf. lib/relancesEmargement.js).
 */
function notify(orgId, { userId = null, type = 'INFO', title, body = null, link = null, email = true }) {
    /* Renvoie une PROMESSE, pour que l'appelant puisse attendre l'insertion avant de répondre.
     *
     * Pourquoi ça compte : toute réponse réussie déclenche une diffusion SSE `refresh` à
     * l'organisme (broadcastMutations), et chaque poste recharge alors ses notifications dans la
     * seconde. Si l'insertion n'est pas encore validée sur la base DISTANTE à ce moment-là, le
     * compteur n'a pas bougé — donc pas de son, pas de cloche : il faut attendre le sondage de
     * secours, jusqu'à vingt-cinq secondes plus tard. Une course qu'on gagne le plus souvent,
     * mais pas toujours, ce qui donne une alerte tantôt immédiate tantôt tardive.
     *
     * Reste au mieux : l'erreur est journalisée et avalée. Une notification manquée ne doit
     * jamais faire échouer l'action qu'elle accompagne. */
    return db.promise()
        .query(
            `INSERT INTO notification (id, organization_id, user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [crypto.randomUUID(), orgId, userId, type, title, body, link])
        .then(() => {
            // Miroir e-mail — UNIQUEMENT pour une notification adressée à une personne (userId).
            // Une notification d'organisme (userId null) est visible par tous dans l'app ; l'envoyer
            // par mail écrirait à tout le monde, ce qu'on ne veut pas. Best-effort, jamais bloquant.
            if (userId && email) emailNotification(orgId, userId, { title, body, link });
        })
        .catch((err) => { console.error('notification:', err.message); });
}

/** Double une notification ciblée par un e-mail, si le destinataire a une adresse. Best-effort. */
async function emailNotification(orgId, userId, { title, body, link }) {
    try {
        const [rows] = await db.promise().query(
            'SELECT first_name, email FROM user WHERE id = ? AND organization_id = ?', [userId, orgId]);
        const u = rows[0];
        if (!u || !u.email) return;
        // Le lien stocké est relatif (« /mon-espace ») : un e-mail a besoin d'une URL absolue.
        const lien = link && link.startsWith('/') ? `${appUrl()}${link}` : link;
        const { subject, html } = notificationEmail({ firstName: u.first_name, title, body, link: lien });
        sendMail({ to: u.email, subject, html, kind: 'notifications' });
    } catch (e) {
        console.error('[mail] notification:', e.message);
    }
}

/**
 * Réglages d'activité de la personne : ce qu'elle a le droit de voir, et jusqu'où elle a lu.
 *
 * `dormant` vaut vrai tant que la migration 142 n'est pas jouée : la colonne manque, on ne sait
 * pas où en est la lecture, donc on considère TOUT comme lu. La rubrique s'affiche, mais aucune
 * pastille ne saute — le code marche avant comme après la migration, sans compteur fantaisiste.
 */
async function profilActivite(userId) {
    try {
        const [[row]] = await db.promise().query(
            'SELECT nav_access, activity_seen_at FROM user WHERE id = ?', [userId]);
        return { navAccess: row ? row.nav_access : null, vue: row ? row.activity_seen_at : null, dormant: false };
    } catch (e) {
        if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
        const [[row]] = await db.promise().query('SELECT nav_access FROM user WHERE id = ?', [userId]);
        return { navAccess: row ? row.nav_access : null, vue: null, dormant: true };
    }
}

/**
 * L'ACTIVITÉ VIENT DU JOURNAL D'AUDIT, PAS D'UNE COPIE.
 *
 * Chaque mutation de l'application y est déjà inscrite (une centaine de points d'appel) : qui,
 * quoi, quand. Écrire en plus une notification par action, ce serait doubler l'écriture de
 * toute l'application pour recopier ce qu'on a déjà — avec le risque de la copie, deux vérités
 * qui divergent. On relit donc la source.
 *
 * JAMAIS MES PROPRES ACTIONS : le carillon les tait déjà (cf. Topbar), et une cloche qui
 * m'annonce ce que je viens de faire n'apprend rien à personne.
 *
 * Le filtre par entité est posé AVANT le `LIMIT` : filtrer après ramènerait trente lignes dont
 * un formateur ne pourrait en voir que deux, et sa cloche paraîtrait vide alors qu'elle ne
 * l'est pas.
 */
/* DEUX FILTRES, QUI NE RÉPONDENT PAS À LA MÊME QUESTION.
   `entitesVisibles` dit ce que cette personne a le DROIT de voir ; `estEvenement` dit ce qui
   MÉRITE une cloche. Sans le second, le carillon annonçait « Produit partenaire modifié » ou
   « Modèle enregistré » — configurer l'outil n'est pas un événement, et la cloche n'était qu'un
   second journal d'audit, plus court et moins consultable.
   EXTRAIT ICI parce que la LISTE et le COMPTE doivent poser exactement le même filtre : deux
   copies finiraient par diverger, et la pastille annoncerait des lignes introuvables. */
function entitesDeLActivite({ role, navAccess }) {
    const visibles = entitesVisibles(sectionsVisibles({ role, navAccess }));
    return (visibles || Object.keys(SECTION_PAR_ENTITE)).filter(estEvenement);
}

/**
 * COMBIEN DE LIGNES D'ACTIVITÉ JE N'AI PAS VUES — le vrai compte, pris en base.
 *
 * PAS LA LONGUEUR DE LA LISTE : elle s'arrête à trente lignes, si bien que la pastille
 * plafonnait à trente sans jamais le dire. Le compte, lui, interroge le journal entier.
 * La liste regroupe les gestes consécutifs identiques (douze inscriptions d'un coup = une
 * ligne) ; le compte, lui, compte les ÉVÉNEMENTS. C'est la question posée : « combien de choses
 * se sont passées depuis ma dernière lecture ».
 */
/* LE COMPTE DES NON-LUES, SÉPARÉ SELON L'AUTEUR (2026-09-24). Ce qu'un STAGIAIRE fait compte
   désormais comme une ALERTE (rouge) — il attend un geste : une pièce à vérifier, un document
   signé —, ce que l'ÉQUIPE fait reste de l'activité (bleu). Un stagiaire n'est pas « l'équipe » :
   ses actions n'avaient jamais eu leur place dans « Activité de l'équipe ». Auteur supprimé
   (role NULL) → équipe, le repli d'avant. */
async function compteActiviteParRole({ orgId, moi, role, navAccess, vue, dormant }) {
    /* `dormant` : migration 142 non jouée, on ne sait pas où en est la lecture — donc tout est
       réputé lu, et aucune pastille ne saute. Même règle que `estLu`. */
    if (dormant) return { equipe: 0, stagiaire: 0 };
    const entites = entitesDeLActivite({ role, navAccess });
    if (entites.length === 0) return { equipe: 0, stagiaire: 0 };
    const params = [orgId, moi, ...entites];
    /* `vue` NULL = rien n'a jamais été marqué comme lu : tout est neuf, et c'est vrai (estLu). */
    const depuis = vue ? ' AND a.created_at > ?' : '';
    if (vue) params.push(vue);
    const [[row]] = await db.promise().query(
        `SELECT SUM(u.role = 'STAGIAIRE') AS stagiaire,
                SUM(u.role IS NULL OR u.role <> 'STAGIAIRE') AS equipe
           FROM audit_log a LEFT JOIN user u ON u.id = a.user_id
          WHERE a.organization_id = ? AND a.user_id IS NOT NULL AND a.user_id <> ?
                AND a.entity IN (${entites.map(() => '?').join(',')})${depuis}`, params);
    return { equipe: Number((row && row.equipe) || 0), stagiaire: Number((row && row.stagiaire) || 0) };
}

/* DEUX FLUX DEPUIS LE MÊME JOURNAL, SÉPARÉS PAR L'AUTEUR. Ce qu'un stagiaire a fait part en
   ALERTES (rouge), le reste en ACTIVITÉ (bleu). Deux requêtes, chacune coupée à trente : couper
   à trente PUIS séparer laisserait un flux presque vide dès que l'autre est bavard. Le filtre de
   rôle est une chaîne FIXE (jamais une donnée d'utilisateur) — pas d'injection. */
async function activiteRecente({ orgId, moi, role, navAccess, vue, dormant }) {
    const entites = entitesDeLActivite({ role, navAccess });
    if (entites.length === 0) return { equipe: [], stagiaire: [] };
    const conn = db.promise();
    /* LE NOM FIGÉ DE CE QUI N'EXISTE PLUS (migration 186). Une seule colonne sondée : les deux
       arrivent par le même ALTER, ensemble ou pas du tout. Sans elles, `NULL` — la ligne se nomme
       encore par ce qu'elle désigne, tant que ça existe (lib/precisionsActivite.js). */
    const figes = await colonneExiste(conn, 'audit_log', 'libelle')
        ? 'a.libelle, a.learner_id' : 'NULL AS libelle, NULL AS learner_id';

    const enPuce = (r, p) => ({
        /* Préfixe `activite:` — l'identifiant vient d'`audit_log`, pas de `notification`. Il ne
           doit jamais être envoyé à « marquer comme lue » : une marque « jusqu'ici » ne sait pas
           dire l'état d'UNE ligne. C'est « Tout marquer comme lu » qui fait avancer la date. */
        id: `activite:${r.id}`,
        type: 'ACTIVITE',
        /* Le code brut, PAS un libellé français : la traduction appartient à l'interface
           (`ui/lib/auditLabels.js`, qui la fait déjà pour le journal et le tableau de bord).
           En tenir une seconde table ici, c'est le défaut déjà payé une fois — celle du tableau
           de bord couvrait huit codes sur soixante-quatre et divergeait en silence. */
        action: r.action,
        entity: r.entity,
        auteur: [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Quelqu\u2019un',
        title: null,
        body: null,
        /* LE LIEN NE MÈNE QU'À L'ENREGISTREMENT LUI-MÊME, sinon il n'y a pas de lien.
           Ici se trouvait `sectionDeLEntite(r.entity)`, avec pour justification « un lien qui
           marche toujours ». Il marchait, en effet : il ne tombait jamais sur une 404. Mais sur
           les cent dernières lignes du journal, quatre-vingt-onze déposaient sur une LISTE — le
           calendrier des sessions pour un émargement précis, l'annuaire complet des stagiaires
           pour un document précis. Un lien qui marche toujours et n'emmène nulle part.
           Depuis le 2026-09-28, il remonte au PARENT quand la ligne n'a pas de page à elle : un
           document signé ouvre la fiche de SON stagiaire, un émargement SA session (`lienPrecis`). */
        link: p.lien,
        /* La rubrique reste, mais pour ce qu'elle est vraiment : une ÉTIQUETTE (« où ça s'est
           passé »), que l'interface affiche à gauche de la ligne. Elle voyage à part depuis
           qu'elle n'est plus le lien — le front la lisait dans `link`, ce qui la faisait
           disparaître dès que le lien devenait précis ou nul. */
        section: sectionDeLEntite(r.entity),
        /* CE QUE LA LIGNE DÉSIGNE (2026-09-28) : « Document signé » ne disait pas LEQUEL. Le nom de
           l'objet (« Devis particulier ») et le stagiaire concerné — son nom relu dans sa fiche,
           `soi` quand c'est lui qui a agi. Des DONNÉES, pas des libellés : l'écran compose la phrase. */
        objet: p.objet,
        stagiaire: p.stagiaire,
        is_read: estLu({ quand: r.quand, vue, dormant }) ? 1 : 0,
        created_at: r.created_at,
    });

    const lire = async (roleClause) => {
        const [rows] = await conn.query(
            `SELECT a.id, a.action, a.entity, a.entity_id, a.user_id, ${figes}, a.created_at AS quand,
                    DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i') AS created_at, u.first_name, u.last_name
               FROM audit_log a LEFT JOIN user u ON u.id = a.user_id
              WHERE a.organization_id = ? AND a.user_id IS NOT NULL AND a.user_id <> ? AND ${roleClause}
                    AND a.entity IN (${entites.map(() => '?').join(',')})
              ORDER BY a.created_at DESC LIMIT 30`, [orgId, moi, ...entites]);
        const precisions = await preciser(conn, orgId, rows);
        return regrouperConsecutives(rows.map((r, i) => enPuce(r, precisions[i])));
    };
    /* Le stagiaire d'abord, l'équipe ensuite : deux listes distinctes, jamais le même flux coupé. */
    return {
        stagiaire: await lire("u.role = 'STAGIAIRE'"),
        equipe: await lire("(u.role IS NULL OR u.role <> 'STAGIAIRE')"),
    };
}

/**
 * GET /api/notifications — alertes adressées + activité de l'organisme, mêlées par date.
 */
const getNotifications = async (req, res) => {
    try {
        const { organization_id: orgId, id: moi, role } = req.user;
        const { navAccess, vue, dormant } = await profilActivite(moi);

        const [notifs] = await db.promise().query(
            /* `NULLIF` PARCE QUE LA COLONNE REND DES CHAÎNES VIDES. Mesuré en production :
               sept lignes « Nouvelle commande boutique » ont un type vide, alors que l'appelant
               passe bien `type: 'BOUTIQUE'`. Signature d'un ENUM qui refuse la valeur — MariaDB
               hors mode strict range `''` au lieu de refuser l'insertion. L'étiquette de couleur
               affichait donc une pastille SANS TEXTE. Le repli rend la ligne lisible tout de
               suite ; la cause, elle, se règle sur le schéma (cf. le rapport du 2026-09-16). */
            `SELECT id, COALESCE(NULLIF(type, ''), 'INFO') AS type, title, body, link, is_read,
                    DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS created_at
             FROM notification
             WHERE organization_id = ? AND ${porteeNotif(role)}
             ORDER BY created_at DESC
             LIMIT 40`, [orgId, moi]);

        /* DEUX FLUX D'ACTIVITÉ : ce qu'un STAGIAIRE a fait rejoint les ALERTES, ce que l'ÉQUIPE a
           fait reste l'ACTIVITÉ. Un stagiaire n'est pas « l'équipe », et sa pièce déposée ou son
           document signé appellent un geste — c'est une alerte, pas une information de couloir. */
        const flux = await activiteRecente({ orgId, moi, role, navAccess, vue, dormant });

        /* DEUX LISTES, PLUS UNE SEULE. Elles étaient mêlées par date puis coupées à quarante
           lignes — et comme l'activité est par nature plus récente (trente lignes de journal
           peuvent toutes dater du jour), elle occupait tout le haut. Mesuré le 2026-09-16 :
           la relance « Émargement à signer » la plus récente se trouvait au ONZIÈME rang, et
           seize notifications adressées tombaient déjà hors de la coupe. L'utilisateur croyait
           qu'elles avaient disparu ; elles étaient noyées.

           Les deux natures ne se disputent donc plus les mêmes places. C'est aussi ce que
           l'accroche de la page promet depuis toujours — « ce qui appelle un geste » — sans
           qu'aucun code ne l'ait jamais respecté : une note d'évaluation saisie par un collègue
           n'appelle aucun geste, et depuis ce matin elle n'est même plus cliquable. */
        // Le format « AAAA-MM-JJ hh:mm » se trie comme une date : comparaison de chaînes suffisante.
        const tri = (a, b) => (a.created_at < b.created_at ? 1 : -1);

        /* ── LE VRAI COMPTE DES NON-LUES, ET PAS LA LONGUEUR DES LISTES ────────────────────
           Les deux listes sont coupées (40 alertes, 30 lignes d'activité) : compter dedans
           faisait plafonner la pastille à ce que la page pouvait afficher, sans que rien ne le
           dise. Une cloche qui affiche « 40 » à quelqu'un qui en a deux cents ne ment pas à
           moitié — elle donne un chiffre précis, donc crédible, et faux.
           DEUX COMPTES SÉPARÉS parce que ce sont deux natures : une ALERTE appelle un geste,
           l'ACTIVITÉ informe. Les écrans les montrent maintenant de deux couleurs, et chacune
           doit pouvoir dire son propre nombre. `unread` reste leur somme, pour ce qui le lit
           encore. */
        const [[compteur]] = await db.promise().query(
            `SELECT COUNT(*) AS n FROM notification
              WHERE organization_id = ? AND ${porteeNotif(role)} AND is_read = 0`,
            [orgId, moi]);
        const nonLuesNotif = Number((compteur && compteur.n) || 0);
        const comptes = await compteActiviteParRole({ orgId, moi, role, navAccess, vue, dormant });
        /* ALERTES = notifications adressées + ce qu'un stagiaire a fait ; ACTIVITÉ = l'équipe. */
        const nonLuesAlertes = nonLuesNotif + comptes.stagiaire;
        const nonLuesActivite = comptes.equipe;

        res.json({
            data: [...notifs, ...flux.stagiaire].sort(tri),
            activite: flux.equipe.sort(tri),
            unread: nonLuesAlertes + nonLuesActivite,
            non_lues: { alertes: nonLuesAlertes, activite: nonLuesActivite },
        });
    } catch (err) {
        console.error('Erreur notifications :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * PATCH /api/notifications/:id/read — marque comme lue.
 */
const markRead = (req, res) => {
    db.query(
        `UPDATE notification SET is_read = 1
         WHERE id = ? AND organization_id = ? AND ${porteeNotif(req.user.role)}`,
        [req.params.id, req.user.organization_id, req.user.id],
        (err) => {
            if (err) return res.status(400).json({ message: 'Erreur' });
            res.json({ success: true });
        }
    );
};

/**
 * POST /api/notifications/read-all — marque tout comme lu.
 */
const markAllRead = async (req, res) => {
    try {
        await db.promise().query(
            `UPDATE notification SET is_read = 1
             WHERE organization_id = ? AND ${porteeNotif(req.user.role)} AND is_read = 0`,
            [req.user.organization_id, req.user.id]);
        /* Et la marque « j'ai lu l'activité jusqu'ici ». Best-effort volontaire : tant que la
           migration 142 n'est pas jouée, la colonne n'existe pas et l'échec ne doit pas empêcher
           les vraies notifications d'être marquées lues. */
        try {
            await db.promise().query('UPDATE user SET activity_seen_at = NOW() WHERE id = ?', [req.user.id]);
        } catch (e) {
            if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur marquage notifications :', err);
        res.status(400).json({ message: 'Erreur' });
    }
};

/**
 * DELETE /api/notifications/:id — retire une notification.
 *
 * REFUSE LES LIGNES D'ACTIVITÉ, et c'est le cœur de cette fonction. Elles viennent du journal
 * d'audit : les supprimer, ce serait effacer la trace de qui a fait quoi — exactement ce qu'un
 * journal existe pour empêcher, et ce que `auditLabels.js` formule déjà (« ce qui a été écrit
 * reste écrit »). Un droit de ménage dans la cloche ne doit jamais devenir, par un préfixe
 * d'identifiant, un droit d'effacer l'historique. D'où un refus explicite plutôt qu'un DELETE
 * qui ne trouverait rien et répondrait « c'est fait » : silencieux, il laisserait croire que
 * la ligne est partie, et elle reviendrait au rechargement suivant.
 */
const deleteNotification = async (req, res) => {
    if (String(req.params.id || '').startsWith('activite:')) {
        return res.status(422).json({
            message: 'Cette ligne vient du journal d\u2019activité : elle ne se supprime pas.',
        });
    }
    try {
        if (!await aLaCapaciteEnBase(req.user, CAP_SUPPRIMER_NOTIF, ROLES_SUPPRESSION_DOFFICE)) {
            return res.status(403).json({ message: 'Suppression des notifications non autorisée.' });
        }
        const [r] = await db.promise().query(
            'DELETE FROM notification WHERE id = ? AND organization_id = ?',
            [req.params.id, req.user.organization_id]);
        if (!r.affectedRows) return res.status(404).json({ message: 'Notification introuvable.' });
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur suppression notification :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = {
    getNotifications, markRead, markAllRead, notify, deleteNotification,
    CAP_SUPPRIMER_NOTIF, ROLES_SUPPRESSION_DOFFICE,
    // Exposés pour le test de portée de la cloche (audit sécurité 2026-10-07).
    voitClocheOrg, porteeNotif,
};
