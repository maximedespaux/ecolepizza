const crypto = require('crypto');
const db = require('../config/database.js');
const { logAudit } = require('../lib/audit.js');
const consentements = require('../lib/consentements.js');
const { etatContrat } = require('../lib/contratPartenaire.js');

/**
 * LE CÔTÉ ORGANISME DU REGISTRE — voir qui a répondu quoi, saisir une réponse donnée hors ligne,
 * et produire la liste destinée à un partenaire SANS pouvoir y glisser quelqu'un qui a refusé.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE, et ce qu'il remplace.
 *
 * L'organisme envoie aujourd'hui ses listes à la main, par courriel, session par session. Un
 * courriel écrit à la main ne consulte aucun registre : rien n'empêche d'y inclure quelqu'un qui a
 * refusé, et rien ne garde trace de ce qui est parti. Recueillir un consentement puis continuer
 * d'envoyer une liste faite à la main est PIRE que de n'avoir rien demandé — on se constitue une
 * preuve qui documente sa propre infraction.
 *
 * D'où le principe qui gouverne tout le fichier : LA LISTE EST PRODUITE PAR LE SERVEUR, jamais
 * composée par l'écran. Le filtre sur le consentement n'est pas une case à cocher que l'on peut
 * décocher, c'est la seule façon dont la liste existe.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * SANS LA TABLE, ON N'ENVOIE PERSONNE — et surtout pas tout le monde.
 *
 * Si la migration 130 n'est pas jouée, la lecture des consentements échoue. La tentation serait de
 * rendre une liste « par défaut » : ce serait transmettre les coordonnées de gens dont on n'a
 * jamais lu la réponse. Chaque route rend donc une erreur explicite (409) plutôt qu'un résultat
 * vide qui se lirait comme « personne n'a consenti » — ou pire, une liste complète.
 */

const FINALITE = 'partenaires';

/**
 * DEUX PANNES QUI SE RESSEMBLENT, ET QU'IL NE FAUT SURTOUT PAS CONFONDRE.
 *
 * `isMissingSchema` de la bibliothèque accepte `ER_NO_SUCH_TABLE` ET `ER_BAD_FIELD_ERROR` : ce qui
 * convient pour DÉCIDER (dans les deux cas, on ne lit rien, donc on n'envoie personne) mais pas
 * pour EXPLIQUER. Une première version annonçait « migration 130 non jouée » dans les deux cas —
 * y compris quand la table existait parfaitement et que c'était MA requête qui nommait une colonne
 * inexistante. Le message accusait alors l'utilisateur d'un oubli qu'il n'avait pas commis, et
 * envoyait chercher la panne à l'endroit exact où elle n'était pas.
 *
 * Une colonne manquante sur une table présente est un DÉFAUT DE CODE : il doit être dit comme tel,
 * et remonter dans les journaux du serveur au lieu d'être maquillé en tâche d'administration.
 */
const TABLE_ABSENTE = (e) => e && e.code === 'ER_NO_SUCH_TABLE';
const CHAMP_ABSENT = (e) => e && e.code === 'ER_BAD_FIELD_ERROR';
const isMissingSchema = (e) => TABLE_ABSENTE(e) || CHAMP_ABSENT(e);

const SANS_REGISTRE = 'Registre des consentements indisponible (migration 130 non jouée). '
    + 'Aucune liste ne peut être produite : sans lecture des réponses, transmettre reviendrait à '
    + 'transmettre sans consentement.';

/**
 * Le même refus pour les deux pannes, mais jamais le même diagnostic.
 *
 * ⚠ UNE COLONNE MANQUANTE N'EST PAS FORCÉMENT UN DÉFAUT DE CODE, et ce message l'a affirmé à
 * tort. `CREATE TABLE IF NOT EXISTS` ne rattrape RIEN sur une table qui existe déjà : si elle a
 * été créée dans une forme antérieure, rejouer la migration l'ignore intégralement, sans ajouter
 * la moindre colonne ni lever d'erreur. C'est ce qui est arrivé à `partner_disclosure.
 * champs_envoyes`, et le message envoyait alors chercher un bug dans le code — exactement là où
 * il n'était pas.
 *
 * Il NOMME donc la colonne et laisse les deux hypothèses ouvertes. Nommer coûte une ligne et fait
 * gagner une demi-heure : c'est ce nom qui a permis d'identifier la cause.
 */
function refusLecture(res, err, ou) {
    if (CHAMP_ABSENT(err)) {
        console.error(`Colonne inconnue dans ${ou} :`, err.sqlMessage || err.message);
        const colonne = (err.sqlMessage || '').match(/Unknown column '([^']+)'/)?.[1];
        return res.status(500).json({
            message: `Le registre est en place, mais la colonne ${colonne ? `« ${colonne} » ` : ''}`
                + 'lui manque. Rien n\'a été transmis. Deux causes possibles : une migration qui '
                + 'ajoute cette colonne n\'a pas été jouée — `CREATE TABLE IF NOT EXISTS` ne '
                + 'complète jamais une table déjà présente — ou la requête nomme une colonne qui '
                + 'n\'existe pas. Le détail est dans les journaux du serveur.',
        });
    }
    return res.status(409).json({ message: SANS_REGISTRE });
}

/**
 * La session ET ses inscrits, en vérifiant qu'elle appartient bien à l'organisme du demandeur.
 * Rend `null` si elle n'existe pas ou n'est pas la sienne — les deux cas se répondent pareil, pour
 * ne pas révéler l'existence d'une session d'un autre organisme.
 */
async function sessionAvecInscrits(conn, sessionId, orgId) {
    const [rows] = await conn.query(
        `SELECT s.id, DATE_FORMAT(s.start_date, '%Y-%m-%d') AS start_date,
                DATE_FORMAT(s.end_date, '%Y-%m-%d') AS end_date,
                p.title AS program_title, p.code AS program_code
           FROM training_session s
           LEFT JOIN training_program p ON p.id = s.program_id
          WHERE s.id = ? AND s.organization_id = ?`,
        [sessionId, orgId]);
    if (!rows.length) return null;
    const [inscrits] = await conn.query(
        /* `entreprise` et `ville` NE SONT PAS TRANSMISES PAR DÉFAUT : elles ne font pas partie
           des six champs d'origine, et n'apparaissent que si l'école les coche dans ses réglages
           ET qu'elles ont été annoncées à la personne. On les LIT ici pour que l'export puisse
           les servir le jour où c'est le cas — les lire ne les envoie pas. */
        /* ON NE LIT QUE CE QUE LE CATALOGUE PEUT OFFRIR. Les colonnes exclues (numéro de sécurité
           sociale, date de naissance, solde CPF, coordonnées GPS…) ne sont pas seulement
           décochables : elles ne sont pas lues du tout. Une donnée qu'on ne charge pas ne peut
           pas partir par erreur. */
        `SELECT l.id, l.first_name, l.last_name, l.email, l.phone,
                l.civility, l.address, l.zip_code, l.town, l.professional_status,
                l.project_creation, l.project_takeover, l.project_oven, l.project_truck,
                l.project_job,
                c.name AS company_name, c.siret AS company_siret,
                c.legal_status AS company_legal, c.naf_ape AS company_naf,
                c.address AS company_address, c.zip_code AS company_zip, c.town AS company_town
           FROM enrollment e
           JOIN learner l ON l.id = e.learner_id
           LEFT JOIN company c ON c.id = e.company_id
          WHERE e.session_id = ?
          ORDER BY l.last_name, l.first_name`,
        [sessionId]);
    return { session: rows[0], inscrits };
}

/**
 * GET /api/sessions/:id/consentements — qui a accepté, qui a refusé, QUI N'A JAMAIS ÉTÉ SOLLICITÉ.
 *
 * Le troisième groupe est celui qui compte. C'est le seul sur lequel l'organisme a quelque chose à
 * faire : poser la question. Un écran qui n'afficherait que « oui » et « non » laisserait croire
 * que tout le monde a répondu, et les silencieux disparaîtraient de la liste comme s'ils avaient
 * refusé — alors qu'ils n'ont rien dit du tout.
 */
const getSessionConsents = async (req, res) => {
    try {
        const conn = db.promise();
        const bloc = await sessionAvecInscrits(conn, req.params.id, req.user.organization_id);
        if (!bloc) return res.status(404).json({ message: 'Session introuvable' });

        const etats = await consentements.etatParStagiaire(
            conn, req.user.organization_id, bloc.inscrits.map((l) => l.id), FINALITE);
        /* QUI S'EST EXPRIMÉ LUI-MÊME, une fois quelconque. En LOT : une session de quinze
           stagiaires ferait sinon quinze requêtes pour une information que l'écran affiche d'un
           bloc. */
        const propres = await consentements.ontReponduEuxMemes(
            conn, req.user.organization_id, bloc.inscrits.map((l) => l.id), FINALITE);
        const stagiaires = bloc.inscrits.map((l) => {
            const e = etats.get(l.id);
            return {
                learner_id: l.id, first_name: l.first_name, last_name: l.last_name,
                email: l.email, phone: l.phone,
                // `null` = jamais sollicité. Ni un oui, ni un non : une question jamais posée.
                accorde: e ? e.accorde : null,
                decide_at: e ? e.decide_at : null,
                source: e ? e.source : null,
                /* CE QUI LUI A ÉTÉ MONTRÉ le jour où il a répondu. Le comparer à la liste du jour
                   dit s'il faut redemander : un partenaire ajouté depuis n'est couvert par aucun
                   accord passé, puisque la personne ne pouvait pas le connaître. */
                destinataires: e ? e.destinataires : null,
                /* DATE DE SA PROPRE RÉPONSE, s'il en a donné une un jour. C'est elle qui ferme la
                   saisie pour autrui — pas la source de la DERNIÈRE ligne, qu'une saisie de
                   l'organisme suffirait à changer. */
                repondu_lui_meme: propres.get(l.id) || null,
            };
        });

        res.json({
            data: {
                session: bloc.session,
                stagiaires,
                destinatairesActuels: await consentements.destinatairesPartenaires(conn, req.user.organization_id),
                formulation: consentements.FINALITES[FINALITE].formulation,
                champs: consentements.FINALITES[FINALITE].champs,
                sources: consentements.SOURCES,
            },
        });
    } catch (err) {
        if (isMissingSchema(err)) return refusLecture(res, err, 'consentements de session');
        console.error('Erreur consentements de session :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * PUT /api/sessions/:id/consentements/:learnerId — saisir une réponse donnée HORS LIGNE.
 *
 * POURQUOI L'ORGANISME PEUT ÉCRIRE À LA PLACE DU STAGIAIRE, alors que le consentement est
 * strictement personnel : parce que la réponse existe déjà. Elle a été donnée sur un formulaire
 * papier, ou de vive voix pendant l'inscription, et refuser de l'enregistrer ne la ferait pas
 * disparaître — elle resterait dans un classeur, invisible de l'export, qui écarterait alors des
 * gens ayant accepté. On saisit donc une réponse EXISTANTE ; on n'en invente pas.
 *
 * Ce qui rend la chose tenable, c'est la traçabilité : `source` dit d'où vient la réponse et
 * `saisi_par` qui l'a saisie. Une ligne « papier, saisie par X » se conteste et se vérifie contre
 * le document ; elle ne se confond jamais avec un « oui » cliqué par la personne elle-même.
 *
 * `espace_stagiaire` est donc REFUSÉ ici : c'est la seule source que le stagiaire produit lui-même,
 * et l'autoriser depuis cette route permettrait de fabriquer un consentement en ligne qui n'a
 * jamais été donné — exactement la preuve que ce registre existe pour empêcher.
 */
const setConsentPourStagiaire = async (req, res) => {
    try {
        const conn = db.promise();
        const bloc = await sessionAvecInscrits(conn, req.params.id, req.user.organization_id);
        if (!bloc) return res.status(404).json({ message: 'Session introuvable' });
        if (!bloc.inscrits.some((l) => l.id === req.params.learnerId)) {
            return res.status(404).json({ message: 'Ce stagiaire n\'est pas inscrit à cette session.' });
        }
        if (typeof req.body?.accorde !== 'boolean') {
            return res.status(422).json({ message: 'Réponse attendue : accepté ou refusé.' });
        }
        const source = req.body.source || 'papier';
        if (source === 'espace_stagiaire') {
            return res.status(422).json({
                message: 'Une réponse saisie par l\'organisme ne peut pas être enregistrée comme '
                    + 'venant de l\'espace du stagiaire.',
            });
        }
        /* ─────────────────────────────────────────────────────────────────────────────────────
           LA PAROLE DU STAGIAIRE NE S'ÉCRASE PAS DEPUIS LE BACK-OFFICE.

           Cette route existe pour une raison réelle : un stagiaire sans compte répond sur un
           formulaire papier, et refuser d'enregistrer sa réponse l'exclurait de l'export alors
           qu'il a accepté. La saisie pour autrui est donc légitime — TANT QUE LA PERSONNE NE
           S'EST PAS EXPRIMÉE ELLE-MÊME.

           Dès qu'elle l'a fait, l'organisme ne doit plus pouvoir passer par-dessus. C'est
           précisément l'abus que ce registre existe pour rendre impossible : un « non » cliqué
           par un stagiaire puis retourné en « oui » depuis un écran d'administration ne serait
           plus un consentement du tout, et la trace ferait croire qu'il l'est.

           CE QUE ÇA COÛTE, ET C'EST ASSUMÉ : si la personne change d'avis et le dit de vive voix,
           le secrétariat ne peut pas le saisir pour elle. Elle le fait depuis son profil, en deux
           clics — et l'article 7.3 exige justement que se rétracter soit aussi simple que
           d'accepter. Le coût est faible ; l'inverse ouvrirait une porte qui ne se referme pas. */
        /* TOUT L'HISTORIQUE, PAS LA DERNIÈRE LIGNE. Un premier jet ne regardait que la réponse
           la plus récente : il suffisait alors d'UNE saisie de l'organisme pour que la protection
           saute définitivement, la dernière ligne ne venant plus de l'espace du stagiaire. Le
           verrou se désactivait en le forçant une fois. */
        const quand = await consentements.aReponduLuiMeme(
            conn, req.user.organization_id, req.params.learnerId, FINALITE);
        if (quand) {
            return res.status(409).json({
                /* FORMULATION NEUTRE : le message parle de gens dont on ne connaît pas le genre,
                   et le masculin en faisait une supposition gratuite. Dire d'OÙ vient la réponse
                   est de toute façon plus juste que dire QUI l'a donnée — c'est l'origine qui
                   ferme la saisie, pas la personne. */
                message: `Cette réponse a été donnée depuis l'espace stagiaire (le ${quand}). Elle `
                    + 'ne peut pas être modifiée ici : seule la personne concernée peut en '
                    + 'changer, depuis son profil.',
            });
        }

        const r = await consentements.enregistrer(conn, {
            orgId: req.user.organization_id, learnerId: req.params.learnerId,
            finalite: FINALITE, accorde: req.body.accorde, source, saisiPar: req.user.id,
        });
        if (!r.ok) return res.status(409).json({ message: r.message });
        logAudit(req, `consent.${req.body.accorde ? 'accorde' : 'refuse'}.${FINALITE}.${source}`,
            'Learner', req.params.learnerId);
        res.json({ success: true });
    } catch (err) {
        if (isMissingSchema(err)) return refusLecture(res, err, 'saisie de consentement');
        console.error('Erreur saisie de consentement :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/sessions/:id/transmission — LA LISTE POUR UN PARTENAIRE, et son inscription au journal.
 *
 * ELLE NE RETIENT QUE LES « OUI », et le filtre est ici, dans le serveur : l'écran ne choisit pas
 * qui figure sur la liste, il l'affiche. C'est la différence avec le courriel écrit à la main —
 * il n'existe aucun chemin pour y ajouter quelqu'un.
 *
 * ELLE N'ENVOIE QUE LES CHAMPS ANNONCÉS. `FINALITES.partenaires.champs` est la liste exacte que la
 * formulation soumise au stagiaire énumère. Ajouter ici une colonne — l'entreprise qui finance,
 * une note interne — transmettrait une donnée à laquelle personne n'a consenti. Le lien entre les
 * deux est volontairement direct : on ne peut pas élargir l'export sans rouvrir le texte.
 *
 * ELLE JOURNALISE AU MOMENT DE PRODUIRE. Le registre prouve le consentement, pas ce qui est parti ;
 * sans ce journal, l'organisme ne peut pas répondre à « à qui avez-vous donné mes coordonnées ? »,
 * question à laquelle le stagiaire a droit (art. 15). Le journal peut donc sur-déclarer — une liste
 * produite puis jamais envoyée y figure quand même. C'est le bon sens de l'erreur : annoncer un
 * destinataire de trop est réparable, en oublier un ne l'est pas.
 *
 * Il garde les IDENTIFIANTS, pas une copie des coordonnées. Recopier ici e-mails et téléphones
 * créerait une seconde base personnelle à protéger et à purger, sans rien prouver de plus.
 */
/**
 * LES LIGNES DE L'EXPORT — communes aux deux chemins (par session, par partenaire).
 *
 * ON N'ENVOIE QUE L'INTERSECTION entre ce que l'école transmet AUJOURD'HUI et ce qui avait été
 * ANNONCÉ À CHAQUE PERSONNE. Un consentement porte sur ce qui a été dit : si l'école ajoute un
 * champ six mois après, les accords déjà donnés ne le couvrent pas — la personne ne pouvait pas
 * consentir à ce qu'elle ignorait. Restreindre la liste s'applique donc tout de suite à tout le
 * monde, l'élargir ne vaut que pour les réponses suivantes. On transmet toujours MOINS que ce qui
 * a été accepté, jamais plus.
 *
 * Extraite parce que les deux exports doivent appliquer la MÊME règle. Recopiée, elle aurait
 * divergé — et une divergence ici ne se voit pas : elle produit un export qui envoie un champ de
 * trop, sans erreur ni alerte.
 */
async function composerLignes(conn, orgId, retenus, etats) {
    const choisis = await consentements.champsOrganisme(conn, orgId);
    const champsParStagiaire = new Map(retenus.map((l) => {
        const annonces = etats.get(l.id)?.champsAnnonces || [];
        return [l.id, choisis.filter((c) => annonces.includes(c))];
    }));
    /* La colonne de l'export est l'UNION de ce qui part réellement : une colonne présente pour un
       seul stagiaire doit exister dans le tableau, vide pour les autres. La cacher masquerait le
       fait que la donnée est bel et bien partie pour celui-là. */
    const champs = choisis.filter((c) => [...champsParStagiaire.values()].some((l) => l.includes(c)));

    /* LE PROJET EST CINQ BOOLÉENS EN BASE. Les envoyer tels quels donnerait cinq colonnes de 0 et
       de 1 à décoder ; on les rassemble en une phrase lisible. */
    const PROJETS = [
        ['project_creation', 'création'], ['project_takeover', 'reprise'],
        ['project_oven', 'four'], ['project_truck', 'camion'],
        ['project_job', 'recherche de poste'],
    ];
    const valeurs = (l) => ({
        civilite: l.civility || '',
        nom: l.last_name || '', prenom: l.first_name || '',
        email: l.email || '', telephone: l.phone || '',
        adresse: l.address || '', code_postal: l.zip_code || '', ville: l.town || '',
        formation: l.program_title || l.program_code || '',
        dates_session: l.start_date && l.end_date ? `${l.start_date} → ${l.end_date}` : '',
        projet: PROJETS.filter(([c]) => Number(l[c]) === 1).map(([, m]) => m).join(', '),
        statut: l.professional_status || '',
        /* L'ENTREPRISE : vide quand le stagiaire n'en a pas. Une colonne présente et vide dit
           « pas d'entreprise » ; une colonne absente forcerait à deviner. */
        entreprise: l.company_name || '',
        entreprise_siret: l.company_siret || '',
        entreprise_forme: l.company_legal || '',
        entreprise_naf: l.company_naf || '',
        entreprise_adresse: l.company_address || '',
        entreprise_cp: l.company_zip || '',
        entreprise_ville: l.company_town || '',
    });

    const lignes = retenus.map((l) => {
        const permis = champsParStagiaire.get(l.id);
        const v = valeurs(l);
        /* Un champ non couvert pour CE stagiaire sort VIDE, pas absent : le tableau garde la même
           forme d'une ligne à l'autre, et un CSV dont les colonnes changent de sens d'une ligne à
           l'autre est illisible. */
        return Object.fromEntries(champs.map((c) => [c, permis.includes(c) ? v[c] : '']));
    });
    return { champs, lignes };
}

/**
 * LE PARTENAIRE PEUT-IL RECEVOIR DES COORDONNÉES ? Deux questions, dans cet ordre.
 *
 * Extrait parce que le contrôle vaut pour les DEUX exports — par session et par partenaire.
 * Recopié, il aurait divergé au premier ajustement, et une divergence ici produit un export qui
 * contourne une garantie sans que rien ne le signale.
 *
 * Rend `{ partenaire }`, ou `{ refus: { statut, message } }`.
 */
async function partenaireRecevable(conn, orgId, partnerId) {
    let pRows;
    let colonneDestinataire = true;
    try {
        [pRows] = await conn.query(
            `SELECT id, name, recoit_coordonnees, contrat, contrat_duree_mois,
                    DATE_FORMAT(contrat_debut, '%Y-%m-%d') AS contrat_debut
               FROM partner WHERE id = ? AND organization_id = ?`,
            [partnerId, orgId]);
    } catch (e) {
        if (!isMissingSchema(e)) throw e;
        /* Sans la 131, tout partenaire est destinataire : c'est le comportement d'avant, et il
           reste juste tant que l'école n'a pas eu la possibilité de restreindre. */
        colonneDestinataire = false;
        [pRows] = await conn.query(
            'SELECT id, name FROM partner WHERE id = ? AND organization_id = ?', [partnerId, orgId]);
    }
    if (!pRows.length) return { refus: { statut: 422, message: 'Partenaire inconnu.' } };
    const partenaire = pRows[0];

    /* CONTRAT ÉCHU : ON REFUSE, avant même de regarder les consentements. Transmettre à une
       entreprise avec qui l'école n'a plus d'accord, c'est transmettre hors de tout cadre — et le
       consentement recueilli nommait « un partenaire de l'école », pas une entreprise devenue
       tierce. Le message donne la date : un refus dont on ne comprend pas la cause se contourne. */
    const contrat = etatContrat(partenaire);
    if (contrat.suivi && contrat.actif === false) {
        return { refus: { statut: 422, message:
            `Le contrat avec ${partenaire.name} a pris fin le `
            + `${contrat.fin.split('-').reverse().join('/')}. Aucune coordonnée ne peut lui être `
            + 'transmise tant qu\'il n\'est pas renouvelé.' } };
    }
    /* DÉCLARÉ DESTINATAIRE (migration 131) : le pendant serveur de la case cochée sur sa fiche.
       Sans ce contrôle, la case ne serait qu'un affichage — il suffirait de choisir le partenaire
       dans une liste déroulante pour lui produire quand même les coordonnées. */
    if (colonneDestinataire && Number(partenaire.recoit_coordonnees) !== 1) {
        return { refus: { statut: 422, message:
            `${partenaire.name} n'est pas déclaré destinataire des coordonnées des stagiaires. `
            + 'Les personnes qui ont consenti ne l\'ont pas fait pour lui : cochez « reçoit les '
            + 'coordonnées » sur sa fiche si c\'est bien le cas.' } };
    }
    return { partenaire };
}

/**
 * L'EXPORT PAR PARTENAIRE — tous les stagiaires consentants d'une PÉRIODE, toutes sessions.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL COMPLÈTE L'EXPORT PAR SESSION plutôt que de le remplacer.
 *
 * L'école transmet d'ordinaire session par session, et l'écran de la session reste le bon endroit
 * pour ça. Mais un partenaire qui demande « envoyez-moi tout ce que vous avez sur l'année »
 * obligeait à ouvrir douze sessions et à recoller douze listes à la main — c'est-à-dire à refaire
 * exactement ce que ces écrans existent pour éviter.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * LA PÉRIODE EST OBLIGATOIRE, ET C'EST VOULU. « Tout depuis toujours » enverrait à un fournisseur
 * les coordonnées de gens formés il y a six ans, qui ont consenti dans un tout autre contexte et
 * ne se souviennent probablement plus de l'école. La minimisation ne porte pas que sur les
 * CHAMPS : elle porte aussi sur COMBIEN DE PERSONNES. Douze mois par défaut, modifiable.
 *
 * UN STAGIAIRE INSCRIT À DEUX SESSIONS N'APPARAÎT QU'UNE FOIS : le partenaire recevrait sinon
 * deux lignes pour la même personne, et croirait à deux prospects.
 */
const produireTransmissionPartenaire = async (req, res) => {
    try {
        const conn = db.promise();
        const rec = await partenaireRecevable(conn, req.user.organization_id, req.params.id);
        if (rec.refus) return res.status(rec.refus.statut).json({ message: rec.refus.message });
        const partenaire = rec.partenaire;

        const { depuis, jusqu_a: jusqua } = req.body || {};
        if (!depuis || !jusqua) {
            return res.status(422).json({ message: 'Période requise (depuis, jusqu_a).' });
        }

        /* LES SESSIONS TERMINÉES DANS LA PÉRIODE. On borne sur la date de FIN : une session en
           cours n'a pas encore de stagiaires « formés », et l'école les transmet à la clôture. */
        const [inscrits] = await conn.query(
            `SELECT l.id, l.first_name, l.last_name, l.email, l.phone, l.civility, l.address,
                    l.zip_code, l.town, l.professional_status, l.project_creation,
                    l.project_takeover, l.project_oven, l.project_truck, l.project_job,
                    c.name AS company_name, c.siret AS company_siret, c.legal_status AS company_legal,
                    c.naf_ape AS company_naf, c.address AS company_address,
                    c.zip_code AS company_zip, c.town AS company_town,
                    p.title AS program_title, p.code AS program_code,
                    DATE_FORMAT(s.start_date, '%Y-%m-%d') AS start_date,
                    DATE_FORMAT(s.end_date, '%Y-%m-%d') AS end_date
               FROM enrollment e
               JOIN learner l ON l.id = e.learner_id
               JOIN training_session s ON s.id = e.session_id
               LEFT JOIN training_program p ON p.id = s.program_id
               LEFT JOIN company c ON c.id = e.company_id
              WHERE s.organization_id = ? AND s.end_date BETWEEN ? AND ?
              ORDER BY l.last_name, l.first_name, s.end_date DESC`,
            [req.user.organization_id, depuis, jusqua]);

        /* DÉDOUBLONNAGE : on garde la session la PLUS RÉCENTE de chaque personne (l'ORDER BY la
           place en tête). Deux lignes pour un même nom feraient croire à deux prospects. */
        const uniques = [];
        const vus = new Set();
        for (const l of inscrits) { if (!vus.has(l.id)) { vus.add(l.id); uniques.push(l); } }

        const etats = await consentements.etatParStagiaire(
            conn, req.user.organization_id, uniques.map((l) => l.id), FINALITE);
        const retenus = uniques.filter((l) => etats.get(l.id)?.accorde === true);
        if (!retenus.length) {
            return res.json({ data: {
                partenaire: partenaire.name, lignes: [], champs: [], journalise: false,
                message: 'Aucun stagiaire de cette période n\'a consenti à la transmission.',
            } });
        }

        const { champs, lignes } = await composerLignes(conn, req.user.organization_id, retenus, etats);

        await conn.query(
            `INSERT INTO partner_disclosure
               (id, organization_id, partner_id, session_id, learner_ids, learners_count,
                champs_envoyes, envoye_par)
             VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
            [crypto.randomUUID(), req.user.organization_id, partenaire.id,
             retenus.map((l) => l.id).join(','), retenus.length,
             champs.join(', ').slice(0, 255), req.user.id]);
        logAudit(req, 'partner_disclosure.create', 'Partner', partenaire.id);

        res.json({ data: { partenaire: partenaire.name, lignes, champs, journalise: true,
            periode: { depuis, jusqu_a: jusqua } } });
    } catch (err) {
        if (isMissingSchema(err)) return refusLecture(res, err, 'transmission par partenaire');
        console.error('Erreur transmission partenaire (période) :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /api/partenaires/:id/transmissions — ce qui est déjà parti chez CE partenaire.
 *
 * PAR PARTENAIRE ET NON PAR SESSION, depuis que l'export l'est aussi. Un journal rangé par
 * session ne pourrait plus rien montrer : les envois produits depuis la fiche d'un partenaire
 * couvrent une PÉRIODE, pas une session, et n'ont donc pas de `session_id`.
 *
 * Deux usages, et le second est le vrai. D'abord éviter le double envoi. Ensuite répondre au
 * stagiaire qui demande à qui ses coordonnées ont été communiquées : un droit, pas une faveur
 * (art. 15). Le journal est la seule source capable de le dire, puisque l'envoi lui-même part par
 * courriel et ne laisse aucune trace dans l'outil.
 *
 * LES ANCIENNES LIGNES PAR SESSION RESTENT VISIBLES : elles portent un `session_id`, et rien ne
 * justifierait de les cacher — ce sont des transmissions qui ont bel et bien eu lieu.
 */
const getTransmissions = async (req, res) => {
    try {
        const conn = db.promise();
        const [rows] = await conn.query(
            `SELECT d.id, d.learners_count, d.champs_envoyes, d.session_id,
                    DATE_FORMAT(d.sent_at, '%Y-%m-%d %H:%i') AS sent_at,
                    TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS par
               FROM partner_disclosure d
               LEFT JOIN user u ON u.id = d.envoye_par
              WHERE d.organization_id = ? AND d.partner_id = ?
              ORDER BY d.sent_at DESC
              LIMIT 20`,
            [req.user.organization_id, req.params.id]);
        res.json({ data: rows });
    } catch (err) {
        // Repli ANODIN : ne pas savoir ce qui est parti n'autorise rien à partir.
        if (isMissingSchema(err)) return res.json({ data: [] });
        console.error('Erreur journal des transmissions :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { getSessionConsents, setConsentPourStagiaire,
    produireTransmissionPartenaire, getTransmissions };
