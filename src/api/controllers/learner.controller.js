const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../config/database.js');
const { encrypt, decrypt, generatePassword } = require('../lib/crypto.js');
const { sendMail, envoiPossible, appUrl } = require('../lib/mailer.js');
const { credentialsEmail, resetEmail } = require('../lib/mailTemplates.js');
/* NI LA CRÉATION NI LA SUPPRESSION D'UN STAGIAIRE N'ÉTAIENT JOURNALISÉES. Le journal d'audit
   couvrait les factures, les modèles, les partenaires — mais pas la fiche autour de laquelle
   tourne toute l'application. Conséquence : aucune trace de qui a créé ou supprimé qui, et la
   cloche restait muette sur l'événement le plus courant de la journée. */
const { logAudit } = require('../lib/audit.js');
const { couperSessions } = require('./auth.controller.js'); // évincer les sessions après un reset
const { resolveurBadges, resoudreCsv } = require('../lib/badges.js');
const { capitaliser, CAPITALES_STAGIAIRE, CAPITALES_ENTREPRISE } = require('../lib/saisie.js');
const { suivreStagiaire } = require('../lib/referentEntreprise.js');
const { MAX_LIGNES, analyserStagiaires, bilan } = require('../lib/importFiches.js');
/* Le compte des mots de la réponse libre d'un QCM : le MÊME que celui de l'écran (ui/lib/mots.js),
   pour que « 128 / 128 » affiché pendant la frappe ne soit jamais refusé à l'enregistrement. */
const { compterMots, CARACTERES_MAX } = require('../lib/reponseLibre.js');
const { colonneExiste, largeurColonne } = require('../lib/colonnes.js');
const { champsManquants, contexteAdresse } = require('../lib/ficheIncomplete.js');
const { PRECISIONS_FOUR, COLONNES_PHRASE, colonnesProjetSql } = require('../lib/projet.js');
const { aDesDestinataires, champsOrganisme } = require('../lib/consentements.js');
const { lireMontant } = require('../lib/montantSaisi.js');
const { montantDuDossier } = require('../lib/inscriptionsFacturees.js');
const { calculerReglement } = require('../lib/reglementDossier.js');
const { moyenValide, moyensConfigures } = require('../lib/moyensPaiement.js');

// Crée un compte de connexion (rôle STAGIAIRE) pour un stagiaire, si l'email
// n'est pas déjà utilisé. Renvoie { userId, password } ou null.
/* NB — `password_plain_enc` N'EXISTE PLUS : la colonne portait une copie RÉVERSIBLE du mot de
   passe et a été supprimée par la migration 039. Le mot de passe n'est stocké qu'en bcrypt.
   Le commentaire est corrigé plutôt que retiré : lu tel quel dans un fichier qui manipule des
   mots de passe, il laissait croire qu'une copie déchiffrable traînait quelque part — et c'est
   le genre de fausse piste qui fait chercher une faille inexistante, ou pire, qui donne
   l'impression qu'on peut en récupérer un. */
async function createStagiaireAccount(conn, organizationId, { email, first_name, last_name, phone }) {
    if (!email) return null;
    // Unicité par organisme : le même e-mail peut exister dans un autre organisme.
    const [existing] = await conn.query('SELECT id FROM user WHERE email = ? AND organization_id = ?', [email, organizationId]);
    if (existing.length > 0) return null; // email déjà pris dans CET organisme : pas de compte auto
    const userId = crypto.randomUUID();
    const password = generatePassword();
    const hash = await bcrypt.hash(password, 10);
    await conn.query(
        `INSERT INTO user
            (id, organization_id, role, first_name, last_name, email, phone, password)
         VALUES (?, ?, 'STAGIAIRE', ?, ?, ?, ?, ?)`,
        [userId, organizationId, first_name, last_name, email, phone || null, hash]
    );
    // E-mail de bienvenue avec les identifiants. Fire-and-forget : la création du compte NE DOIT
    // PAS échouer ni ralentir si le SMTP est lent ou absent (cf. lib/mailer.js). Sans SMTP
    // configuré, c'est un no-op — le mot de passe reste communiqué à la main comme avant.
    const { subject, html } = credentialsEmail({ firstName: first_name, email, password, loginUrl: `${appUrl()}/login` });
    sendMail({ to: email, subject, html, kind: 'credentials' });
    /* `envoye` : les identifiants partent-ils vraiment ? Sinon l'appelant MONTRE le mot de passe,
       seule trace en clair qui en restera (cf. envoiPossible). */
    return { userId, password, envoye: envoiPossible('credentials') };
}

/**
 * LA LISTE BLANCHE, FILTRÉE SUR CE QUE LA TABLE PORTE VRAIMENT.
 *
 * Sans ce filtre, ajouter une colonne à `LEARNER_FIELDS` cassait l'enregistrement d'une fiche
 * TANT QUE LA MIGRATION N'ÉTAIT PAS JOUÉE : le formulaire envoie tous ses champs, l'INSERT
 * nommait donc une colonne inexistante, et la création échouait sur un `ER_BAD_FIELD_ERROR`
 * incompréhensible pour qui n'a rien demandé de nouveau. C'est la règle « le code marche AVANT
 * et APRÈS » (CLAUDE.md § 2.1), appliquée une fois pour toutes plutôt qu'une fois par colonne :
 * celle qu'on ajoutera demain en hérite sans y penser.
 *
 * Rien n'est mémorisé, pour la même raison que `colonneExiste` : une migration jouée pendant que
 * le serveur tourne doit prendre effet sans redémarrage.
 */
async function champsEcrivables(conn) {
    try {
        const [cols] = await conn.query(
            `SELECT column_name AS c FROM information_schema.columns
              WHERE table_schema = DATABASE() AND table_name = 'learner'`);
        const presentes = new Set(cols.map((r) => r.c));
        return LEARNER_FIELDS.filter((f) => presentes.has(f));
    } catch {
        /* Ne pas savoir ne doit pas empêcher d'enregistrer : on retombe sur la liste complète,
           c'est-à-dire sur le comportement d'avant ce filtre. */
        return LEARNER_FIELDS;
    }
}

// Champs de la « fiche d'expression du stagiaire » stockés sur learner.
const LEARNER_FIELDS = [
    'contacted_at', 'contacted_by', 'civility', 'first_name', 'last_name', 'email',
    'phone', 'birthday', 'birth_place', 'address', 'zip_code', 'town',
    'diploma_level', 'diploma_name', 'diploma_year', 'last_experience',
    'experience_value', 'experience_unit', 'professional_status', 'cpf_amount',
    'france_travail_id', 'current_contract', 'social_security', 'financing', 'opco', 'levels',
    /* `project_improvement` (migration 158) : le projet de qui EXERCE DEJA et vient se
       perfectionner. Les cinq autres disent toutes un changement — creer, reprendre, s'equiper,
       chercher un poste — et ces stagiaires-la ressortaient donc avec zero case cochee,
       indiscernables de ceux qui n'avaient rien rempli. */
    'project_creation', 'project_takeover', 'project_oven', 'project_truck', 'project_job',
    'project_improvement',
    /* Le TYPE de four (migration 172), sous la case « Four » : bois, électrique, gaz — les trois
       ensemble possibles (un four mixte). Filtrés comme les autres sur les colonnes que la table
       porte : sans la migration, ils ne s'enregistrent pas, et `ignores` le dit à l'écran. */
    'project_oven_wood', 'project_oven_electric', 'project_oven_gas',
    /* Migration 173 : le type d'activité, le reste de l'équipement (et le four déjà acheté),
       l'avancement du projet, l'intérêt pour une formation. Mêmes règles : filtrées sur les colonnes
       que la table porte, et signalées à l'écran si la migration manque. */
    'project_dine_in', 'project_takeaway', 'project_by_slice', 'project_vending', 'project_catering', 'project_add_on',
    'project_kneader', 'project_sheeter', 'project_fridge_counter', 'project_oven_owned',
    'project_premises', 'project_funded', 'project_opening_soon', 'project_support', 'project_more_training',
    // Cadres exclusifs accordés par l'école (migration 113) — même idiome que `levels` : une
    // liste séparée par des virgules. Passe par cette liste blanche, donc par PATCH /:id, donc
    // par `authorizeRoles(...ADMIN_ROLES)` : un formateur ne peut pas s'accorder un Champion.
    // Il entre aussi de ce fait au journal d'audit, comme tout autre champ de la fiche.
    'cadres_exclusifs',
    /* `note_libre` (migration 168) : la note en texte simple, sous « Votre projet », 128 mots au
       plus (cf. refusNote). « note_libre » et pas « note » : ici, une note est aussi une note
       d'ÉVALUATION — le nom dit un texte, pas un chiffre. Écrite par l'école seule : l'espace du
       stagiaire a sa propre liste (INFO_FIELDS), et aucune de ses réponses ne rend la fiche entière. */
    'note_libre',
    /* `a_recontacter` (migration 169) : le RAPPEL — la case cochée met la fiche en tête de la liste
       de priorité (page des stagiaires, tableau de bord) et dans la pastille du menu. Sa date,
       `a_recontacter_depuis`, n'est PAS ici : c'est le serveur qui la pose (cf. la mise à jour). */
    'a_recontacter',
];

// La case telle qu'elle arrive : un booléen du formulaire, ou 1 / « true » d'un autre appelant.
const estCoche = (v) => v === true || v === 1 || v === '1' || v === 'true';

/* L'IDENTIFIANT FRANCE TRAVAIL EST CHIFFRÉ AU REPOS (2026-09-21), comme le n° de sécurité sociale :
   « même nature — un identifiant attribué par un organisme public » (cf. lib/consentements.js), et
   il était resté EN CLAIR dans la base et donc dans chaque sauvegarde. Chiffré et non HACHÉ : il
   doit se relire — sur la fiche, et imprimé sur les documents par le jeton {France Travail}.

   LA COLONNE DOIT AVOIR LA PLACE (migration 170). Un chiffré fait « enc: » + 60 caractères + deux
   fois le clair — environ 80 pour un identifiant de 8 : dans l'ancienne colonne de 60, l'écriture
   échouerait, ou serait TRONQUÉE sans erreur hors mode strict, et un chiffré tronqué ne se rouvre
   JAMAIS. Tant que la colonne est étroite, on écrit donc en clair, comme avant — l'outil
   `database/tools/chiffrer-france-travail.js` reprendra ces valeurs une fois la 170 jouée. */
const LARGEUR_CHIFFRE = 255;
async function franceTravailChiffrable(conn) {
    return (await largeurColonne(conn, 'learner', 'france_travail_id')) >= LARGEUR_CHIFFRE;
}
// Ce que la base reçoit pour un champ : chiffré pour les deux identifiants, le montant CPF lu en
// français (et vérifié avant, cf. refusMontantCpf), tel quel sinon.
function valeurStockee(champ, valeur, chiffrerFT) {
    if (valeur === null || valeur === undefined || valeur === '') return valeur === '' ? null : valeur;
    if (champ === 'social_security') return encrypt(valeur);
    if (champ === 'france_travail_id' && chiffrerFT) return encrypt(valeur);
    if (champ === 'cpf_amount') return lireMontant(valeur).toFixed(2);
    return valeur;
}
/* LE MONTANT CPF se TAPE en français (« 1 500,00 ») : il partait TEL QUEL dans l'INSERT, et MariaDB,
   en mode strict, refuse « 1500,00 » dans un DECIMAL — la fiche entière ne s'enregistrait pas, sur
   un message qui ne disait pas pourquoi. Vérifié ici, avant toute écriture. */
function refusMontantCpf(body) {
    const v = body.cpf_amount;
    if (v == null || v === '') return null;
    const n = lireMontant(v);
    if (!Number.isFinite(n) || n < 0) return 'Montant CPF illisible : écrivez-le par exemple 1500,00.';
    return null;
}
/* BORNÉ POUR TENIR, UNE FOIS CHIFFRÉ, DANS LES 255 : 96 octets de clair donnent 62 + 192 = 254
   caractères. Un vrai identifiant en compte 8 à 11 ; 60 caractères, c'est l'ancienne colonne. */
function refusFranceTravail(body) {
    const v = body.france_travail_id;
    if (v == null || v === '') return null;
    const t = String(v);
    if (t.length > 60 || Buffer.byteLength(t, 'utf8') > 96) return "L'identifiant France Travail est trop long (60 caractères au plus).";
    return null;
}

/* LA NOTE LIBRE : 128 MOTS AU PLUS, demandé le 2026-09-21. Vérifiée ICI et pas seulement à
   l'écran : la route n'est pas le seul chemin d'entrée (reprise de données, appel direct). Le
   garde-fou en caractères tient pour un texte collé sans espace, qui ne compterait qu'un « mot ». */
const NOTE_MOTS_MAX = 128;
function refusNote(body) {
    if (body.note_libre == null || body.note_libre === '') return null;
    const texte = String(body.note_libre);
    const mots = compterMots(texte);
    if (mots > NOTE_MOTS_MAX) return `La note dépasse ${NOTE_MOTS_MAX} mots (${mots}) : raccourcissez-la.`;
    if (texte.length > CARACTERES_MAX) return `La note dépasse ${CARACTERES_MAX} caractères.`;
    return null;
}

/* CE QUI A ÉTÉ ENVOYÉ SANS POUVOIR ÊTRE ÉCRIT — colonne absente, migration pas encore jouée : dit
   à l'écran (`ignores`) plutôt que perdu en silence. Une note tapée, puis « Stagiaire mis à jour »,
   et plus rien à la réouverture : le succès aurait menti. */
/* UNE CASE N'EST PERDUE QUE COCHÉE : décochée, elle ne dit rien que la base ignore. Et la case du
   rappel arrive déjà ramenée à 0 ou 1 (normaliserSaisie) : sans cette règle, décocher avant la
   migration 169 aurait annoncé « sauf le rappel » pour une case qui ne disait rien. */
const CASES = new Set(['project_creation', 'project_takeover', 'project_oven', 'project_truck', 'project_job',
    'project_improvement', 'project_oven_wood', 'project_oven_electric', 'project_oven_gas',
    'project_dine_in', 'project_takeaway', 'project_by_slice', 'project_vending', 'project_catering', 'project_add_on',
    'project_kneader', 'project_sheeter', 'project_fridge_counter', 'project_oven_owned',
    'project_premises', 'project_funded', 'project_opening_soon', 'project_support', 'project_more_training', 'a_recontacter']);
function champsIgnores(body, champs) {
    const perdu = (f) => (CASES.has(f) ? estCoche(body[f])
        : body[f] !== undefined && body[f] !== null && body[f] !== '' && body[f] !== false);
    const ignores = LEARNER_FIELDS.filter((f) => !champs.includes(f) && perdu(f));
    return ignores.length ? { ignores } : {};
}

// Colonnes de l'entreprise (section « Informations professionnelle »).
const COMPANY_FIELDS = [
    'name', 'legal_status', 'siret', 'naf_ape', 'address', 'zip_code', 'town',
    'email', 'phone', 'opco', 'representative_civ', 'representative_name', 'representative_role',
];

// Normalise une valeur de formulaire (chaîne vide -> null).
const clean = (v) => (v === undefined || v === '' ? null : v);

/* CONVENTIONS DE SAISIE — appliquées CÔTÉ SERVEUR, pas seulement dans le formulaire : ce n'est
   pas le seul chemin d'entrée (reprise de données, second écran, appel direct). Une base où
   « despaux », « Despaux » et « DESPAUX » cohabitent ne se trie plus, ne se dédoublonne plus, et
   ressort telle quelle sur les attestations.
   · NOM et VILLE en majuscules — l'usage administratif français. Les accents sont conservés de
     toute façon (« déspaux » donne « DÉSPAUX », vérifié : toUpperCase() le fait déjà) ; ce qu'on
     épingle avec `toLocaleUpperCase('fr')`, c'est la LOCALE, pour que la casse ne dépende jamais
     de celle du serveur — sans argument, un hôte turc écrirait « İLE » pour « ile ». La liste des
     champs concernés vit dans lib/saisie.js, partagée avec l'entreprise et l'espace stagiaire ;
   · E-MAIL en minuscules et sans espaces : c'est aussi l'identifiant de connexion du stagiaire,
     et « Jean@X.fr » puis « jean@x.fr » finiraient en DEUX comptes pour la même personne. */
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function normaliserSaisie(b) {
    const out = capitaliser(b, CAPITALES_STAGIAIRE);
    if (out.first_name != null) out.first_name = String(out.first_name).trim();
    if (out.email != null) out.email = String(out.email).trim().toLowerCase();
    if (out.note_libre != null) out.note_libre = String(out.note_libre).trim();
    if (out.a_recontacter !== undefined) out.a_recontacter = estCoche(out.a_recontacter) ? 1 : 0;
    /* UN FOUR À BOIS SANS FOUR EST UNE CONTRADICTION : le formulaire les lie, mais la route accepte
       d'autres appelants. Une précision cochée — un type, ou « déjà acheté » (173) — coche « Four » :
       l'export, qui ne les dit qu'entre les parenthèses du four, les tairait sinon. */
    if (PRECISIONS_FOUR.some(({ c }) => estCoche(out[c]))) out.project_oven = 1;
    if (out.france_travail_id != null) out.france_travail_id = String(out.france_travail_id).trim();
    /* L'ANCIENNE SAISIE « EN LIGNE » d'une entreprise (`company: {…}`, cf. createLearner et
       updateLearner) écrit dans `company` sans passer par la normalisation de l'entreprise. Plus
       aucun écran ne l'envoie, mais la route l'accepte toujours : la ville et le référent y
       entraient tels que tapés. */
    if (out.company && typeof out.company === 'object') out.company = capitaliser(out.company, CAPITALES_ENTREPRISE);
    return out;
}

/**
 * GET /api/stagiaires — liste des stagiaires de l'organisme, filtre ?q= (nom/email).
 */
const getLearners = async (req, res) => {
    const organizationId = req.user.organization_id;
    const q = req.query.q ? `%${req.query.q}%` : '%';
    /* Civilité et projet : lus pour le repère « Fiche incomplète » (plus bas), jamais renvoyés. Les
       cases arrivées par migration (158, 172, 173) se lisent NULL tant que la leur n'est pas jouée :
       la liste ne tombe pas pour une colonne absente (lib/projet.js, comme l'export des partenaires). */
    const colonnesProjet = await colonnesProjetSql(db.promise());

    db.query(
        `SELECT l.id, l.organization_id, l.first_name, l.last_name, l.email, l.phone,
                l.birthday, l.zip_code, l.town, l.address, l.professional_status, l.levels,
                l.financing, l.opco, l.created_at,
                l.civility, ${colonnesProjet},
                l.company_id, c.name AS company_name,
                u.email AS account_email
         FROM learner l
         LEFT JOIN user u ON u.id = l.user_id
         LEFT JOIN company c ON c.id = l.company_id
         WHERE l.organization_id = ?
           AND (l.first_name LIKE ? OR l.last_name LIKE ? OR l.email LIKE ?)
         ORDER BY l.last_name, l.first_name`,
        [organizationId, q, q, q],
        async (err, results) => {
            if (err) {
                console.error('Erreur récupération stagiaires :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            /* Les badges (niveaux/codes) sont la source stockée sur le stagiaire : ajoutés
               automatiquement à l'inscription, mais entièrement modifiables à la main.
               TRADUITS À LA LECTURE en code de formation : l'attribution a longtemps écrit le
               NIVEAU quand la formation en avait un, si bien qu'un stagiaire RS7404 porte « RS »
               en base. Le corriger par une migration obligerait à découper une colonne CSV pour
               y remplacer un jeton — et « RS » étant un préfixe de « RS7404 », un REPLACE naïf
               produirait « RS74047404 ». On traduit donc à l'affichage, et les anciennes lignes
               redeviennent justes sans que personne n'y touche. */
            const resoudre = await resolveurBadges(db.promise(), req.user.organization_id);
            /* LE REPÈRE « FICHE INCOMPLÈTE » — la règle même du bandeau de la fiche
               (lib/ficheIncomplete.js), calculée ici pour chaque ligne. Les LIBELLÉS seulement,
               et seulement pour les fiches incomplètes : la liste compte plus de mille lignes, et
               le détail (envoyé aux partenaires ou essentiel) se lit sur la fiche. `null` : le
               calcul a échoué — la liste perd le repère, jamais ses lignes. */
            let transmis = null;
            try {
                const conn = db.promise();
                transmis = (await aDesDestinataires(conn, organizationId)) ? await champsOrganisme(conn, organizationId) : [];
            } catch (e) {
                console.error('Liste des stagiaires, champs manquants :', e.message);
            }
            /* LE CONTEXTE « adresse » DE CHAQUE STAGIAIRE, en UN seul agrégat sur les dossiers (la
               liste compte plus de mille lignes) : a-t-il un dossier particulier (→ on exige son
               adresse), et l'entreprise d'un dossier pro renseigne-t-elle adresse / CP / ville (→ elle
               la couvre) ? La même décision que la fiche (contexteAdresse). Un stagiaire sans dossier
               n'y figure pas : contexte vide, on exige — comme avant. Sans la table, on retombe de même. */
            const ctxParLearner = new Map();
            try {
                const [agg] = await db.promise().query(
                    `SELECT e.learner_id AS lid,
                            MAX(e.financing <> 'PROFESSIONNEL' OR e.financing IS NULL) AS particulier,
                            MAX(e.financing = 'PROFESSIONNEL' AND c.address  IS NOT NULL AND TRIM(c.address)  <> '') AS pro_adresse,
                            MAX(e.financing = 'PROFESSIONNEL' AND c.zip_code IS NOT NULL AND TRIM(c.zip_code) <> '') AS pro_cp,
                            MAX(e.financing = 'PROFESSIONNEL' AND c.town     IS NOT NULL AND TRIM(c.town)     <> '') AS pro_ville
                       FROM enrollment e LEFT JOIN company c ON c.id = e.company_id
                      WHERE e.organization_id = ?
                      GROUP BY e.learner_id`,
                    [organizationId]);
                for (const r of agg) ctxParLearner.set(r.lid, {
                    aUnDossierParticulier: !!Number(r.particulier),
                    adresseEntreprise: {
                        adresse: Number(r.pro_adresse) ? 'x' : '', code_postal: Number(r.pro_cp) ? 'x' : '', ville: Number(r.pro_ville) ? 'x' : '',
                    },
                });
            } catch (e) {
                if (!(e && (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE'))) console.error('Liste des stagiaires, dossiers :', e.message);
            }
            const data = results.map((ligne) => {
                const manque = transmis ? champsManquants(ligne, transmis, ctxParLearner.get(ligne.id) || {}).map((m) => m.libelle) : [];
                const { account_email, levels, ...rest } = ligne;
                for (const c of ['civility', ...COLONNES_PHRASE]) delete rest[c]; // lus, jamais renvoyés
                return {
                    ...rest, levels: resoudreCsv(levels, resoudre), has_account: !!account_email,
                    ...(manque.length ? { champs_manquants: manque } : {}),
                    /* L'E-MAIL DU COMPTE QUAND IL A DÉCROCHÉ DE CELUI DE LA FICHE — et seulement
                       alors. Il était lu ici depuis toujours, et JETÉ : l'écran ne pouvait donc pas
                       signaler l'écart, et personne ne pouvait le voir.

                       CE QUE ÇA COÛTAIT, vécu en production le 2026-09-16 : on corrige l'e-mail
                       d'une fiche après la création du compte, on réinitialise le mot de passe, et
                       la connexion répond « Email ou mot de passe incorrect » — parce qu'elle
                       cherche dans `user`, resté sur l'ANCIENNE adresse. Le message est
                       volontairement ambigu (il ne dit jamais si c'est l'e-mail ou le mot de passe,
                       pour ne pas révéler l'existence d'un compte) : on cherche donc le mot de
                       passe pendant des heures, alors que c'est l'identifiant qui a bougé.

                       Il n'est renvoyé QUE s'il diffère : la liste ne publie pas l'adresse de
                       connexion de 1073 personnes pour le plaisir. */
                    compte_email_different: account_email && rest.email
                        && account_email.trim().toLowerCase() !== String(rest.email).trim().toLowerCase()
                        ? account_email : null,
                };
            });
            res.json({ data });
        }
    );
};

/**
 * GET /api/stagiaires/distinctions — qui porte quel cadre exclusif (Champion, Podium, Jury…).
 *
 * Pour le panneau « Distinctions » de la Communauté, où l'école décerne ces cadres depuis le
 * 2026-09-17 — ils se décernaient sur la fiche stagiaire, au milieu du dossier administratif.
 *
 * Ne renvoie QUE les porteurs, et seulement leur nom : le panneau n'a besoin de rien d'autre, et
 * la liste générale publierait e-mail et téléphone de mille personnes pour en afficher trois.
 * C'est aussi ce qui permet d'écrire juste : quiconque n'est pas dans cette liste ne porte aucun
 * cadre, donc la chaîne à envoyer pour lui en attribuer un se déduit sans relire sa fiche.
 */
const getDistinctions = async (req, res) => {
    try {
        const [rows] = await db.promise().query(
            `SELECT id, first_name, last_name, cadres_exclusifs FROM learner
              WHERE organization_id = ? AND cadres_exclusifs IS NOT NULL AND TRIM(cadres_exclusifs) <> ''
              ORDER BY last_name, first_name`,
            [req.user.organization_id]);
        res.json({
            data: rows.map((r) => ({
                ...r, cadres_exclusifs: String(r.cadres_exclusifs).split(',').map((x) => x.trim()).filter(Boolean),
            })),
        });
    } catch (err) {
        // Colonne absente (migration 113 non jouée) : personne ne porte de cadre, ce n'est pas une panne.
        if (err.code === 'ER_BAD_FIELD_ERROR') return res.json({ data: [] });
        console.error('Erreur lecture des distinctions :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /api/stagiaires/a-recontacter — les fiches cochées « à recontacter » (migration 169) : la liste
 * de priorité de la page des stagiaires et du tableau de bord, et de quoi rappeler — nom, téléphone,
 * e-mail, canal du premier contact, la note. LA PLUS ANCIENNE ATTENTE EN TÊTE : c'est elle, la
 * priorité ; une fiche cochée avant que la date n'existe passe après les datées.
 *
 * UNE ROUTE À ELLE, comme les distinctions, et pour deux raisons : la liste générale suit la
 * recherche (le rappel doit rester en tête quoi qu'on tape), et elle nomme ses colonnes — y ajouter
 * `a_recontacter` l'aurait fait tomber en erreur tant que la migration n'est pas jouée. Ici, colonne
 * absente = personne à rappeler, pas une panne.
 */
const getARecontacter = async (req, res) => {
    try {
        const conn = db.promise();
        const [depuis, note] = await Promise.all([
            colonneExiste(conn, 'learner', 'a_recontacter_depuis'),
            colonneExiste(conn, 'learner', 'note_libre'),
        ]);
        const [rows] = await conn.query(
            `SELECT id, civility, first_name, last_name, phone, email, contacted_by,
                    ${depuis ? "DATE_FORMAT(a_recontacter_depuis, '%Y-%m-%d %H:%i')" : 'NULL'} AS a_recontacter_depuis,
                    ${note ? 'note_libre' : 'NULL'} AS note_libre
               FROM learner
              WHERE organization_id = ? AND a_recontacter = 1
              ORDER BY ${depuis ? 'a_recontacter_depuis IS NULL, a_recontacter_depuis, ' : ''}last_name, first_name`,
            [req.user.organization_id]);
        res.json({ data: rows });
    } catch (err) {
        if (err.code === 'ER_BAD_FIELD_ERROR') return res.json({ data: [] }); // migration 169 non jouée
        console.error('Erreur lecture des rappels :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /api/stagiaires/:id — dossier complet (avec l'entreprise liée si devis pro).
 */
const getLearner = async (req, res) => {
    try {
        const conn = db.promise();
        const [rows] = await conn.query(
            'SELECT * FROM learner WHERE id = ? AND organization_id = ?',
            [req.params.id, req.user.organization_id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Stagiaire introuvable' });
        }
        // Déchiffre le n° de sécurité sociale pour l'affichage (rôle autorisé).
        const learner = {
            ...rows[0],
            social_security: decrypt(rows[0].social_security),
            // Chiffré depuis la 170 ; `decrypt` rend tel quel un identifiant resté en clair.
            france_travail_id: decrypt(rows[0].france_travail_id),
        };

        /* BADGES TRADUITS À LA LECTURE, exactement comme la liste (getLearners) : un stagiaire
           RS7404 porte « RS » en base (le NIVEAU, pas le CODE ; lib/badges.js dit le pourquoi, et
           pourquoi on ne migre pas — « RS » est un préfixe de « RS7404 »). Sans cette traduction,
           la fenêtre « Modifier » proposait la MÊME formation deux fois : « RS7404 » (venu des
           formations) ET « RS » (le badge stocké). resoudreCsv fond les deux après traduction.
           On traduit aussi `completed_levels`, pour que le « terminé » coché reste aligné sur la
           pastille — mais seulement s'il est là (le code marche avant comme après sa migration). */
        const traduireBadges = await resolveurBadges(conn, req.user.organization_id);
        learner.levels = resoudreCsv(learner.levels, traduireBadges);
        if (Object.prototype.hasOwnProperty.call(rows[0], 'completed_levels')) {
            learner.completed_levels = resoudreCsv(learner.completed_levels, traduireBadges);
        }

        // Entreprise liée (pour préremplir la section « professionnel »).
        if (learner.company_id) {
            const [cRows] = await conn.query('SELECT * FROM company WHERE id = ?', [learner.company_id]);
            learner.company = cRows[0] || null;
        }

        /* LE CONTEXTE « adresse » — ses dossiers, pour décider si on réclame son adresse postale ou
           si l'entreprise la couvre (ficheIncomplete.contexteAdresse). Un dossier particulier l'exige
           (ses documents sont à son adresse) ; sinon l'entreprise d'un dossier pro peut la fournir.
           Sans la table (jamais en prod), on retombe sur « on exige », le comportement d'avant. */
        let ctxAdresse = {};
        try {
            const [doss] = await conn.query(
                `SELECT e.financing, c.address AS adresse, c.zip_code AS code_postal, c.town AS ville
                 FROM enrollment e LEFT JOIN company c ON c.id = e.company_id
                 WHERE e.learner_id = ? AND e.organization_id = ?`,
                [req.params.id, req.user.organization_id]);
            ctxAdresse = contexteAdresse(doss);
        } catch (e) {
            if (!(e && (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE'))) throw e;
        }

        /* CE QUI MANQUE À LA FICHE, pour le bandeau de l'écran (lib/ficheIncomplete.js) : ce que
           l'école envoie aux partenaires — si quelqu'un reçoit —, plus l'essentiel. Un échec ici,
           registre illisible par exemple, ne doit pas priver de la fiche : l'écran s'en passe, et
           n'affiche simplement pas de bandeau. */
        try {
            const orgId = req.user.organization_id;
            const transmis = (await aDesDestinataires(conn, orgId)) ? await champsOrganisme(conn, orgId) : [];
            learner.champs_manquants = champsManquants(learner, transmis, ctxAdresse);
        } catch (e) {
            console.error('Fiche stagiaire, champs manquants :', e.message);
        }

        res.json({ data: learner });
    } catch (err) {
        console.error('Erreur récupération stagiaire :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/stagiaires
 * Corps : les champs de la fiche stagiaire (voir LEARNER_FIELDS) + un objet
 * `company` optionnel (créé et rattaché quand le devis est professionnel).
 */
const createLearner = async (req, res) => {
    const organizationId = req.user.organization_id;
    const body = normaliserSaisie(req.body);

    if (!body.first_name || !body.last_name) {
        return res.status(422).json({ error: 'Nom et prénom requis' });
    }
    /* TÉLÉPHONE ET E-MAIL EXIGÉS — À LA CRÉATION SEULEMENT, et c'est la moitié qui compte.
     *
     * `updateLearner` ne les réclame pas : les imposer là bloquerait toute correction sur une
     * fiche ancienne dont le numéro n'a jamais été collecté. On serait incapable de corriger une
     * adresse faute d'un téléphone qu'on n'a pas — une contrainte de qualité qui empêche
     * justement de réparer les données. Les fiches NEUVES sont complètes, l'existant reste
     * modifiable, et se complète au fil de l'eau.
     *
     * L'e-mail n'est pas un ornement : il SERVIRA d'identifiant de connexion, quand le compte
     * sera créé à l'inscription à une session. Sans lui, `createStagiaireAccount` renverra null
     * ce jour-là, et la personne inscrite ne pourra jamais ouvrir son espace. */
    if (!String(body.phone || '').trim() || !String(body.email || '').trim()) {
        return res.status(422).json({ error: 'Téléphone et adresse e-mail requis pour créer un stagiaire.' });
    }
    // L'e-mail sera le compte de connexion : mieux vaut le refuser ici que préparer un accès mort.
    if (body.email && !RE_EMAIL.test(body.email)) {
        return res.status(422).json({ error: 'Adresse e-mail invalide.' });
    }
    const refus = refusNote(body) || refusFranceTravail(body) || refusMontantCpf(body);
    if (refus) return res.status(422).json({ error: refus });

    try {
        const conn = db.promise();
        let companyId = null;

        // Rattachement à une ENTREPRISE EXISTANTE (nouveau modèle) : simple lien via la FK.
        if (body.company_id) {
            const [[c]] = await conn.query('SELECT id FROM company WHERE id = ? AND organization_id = ?', [body.company_id, organizationId]);
            companyId = c ? c.id : null;
        } else if (body.company && body.company.name) {
            // Rétro-compatibilité : ancienne saisie « inline » (crée une entreprise).
            companyId = crypto.randomUUID();
            const cols = COMPANY_FIELDS.filter((f) => body.company[f] !== undefined && body.company[f] !== '');
            const placeholders = cols.map(() => '?').join(', ');
            const values = cols.map((f) => body.company[f]);
            await conn.query(
                `INSERT INTO company (id, organization_id, ${cols.join(', ')})
                 VALUES (?, ?, ${placeholders})`,
                [companyId, organizationId, ...values]
            );
            // Une entreprise créée EN PASSANT reste une entreprise créée : elle signera des
            // conventions et recevra des factures. Elle n'a pas à être moins tracée qu'une autre
            // parce qu'elle est née dans le formulaire d'un stagiaire.
            logAudit(req, 'company.create', 'Company', companyId);
        }

        /* PAS DE COMPTE DE CONNEXION ICI — il naît à l'INSCRIPTION À UNE SESSION
           (enrollment.controller). Décidé le 2026-09-17.

           Une fiche est souvent celle d'un PROSPECT : quelqu'un qui a appelé, demandé un devis, et
           ne viendra peut-être jamais. Lui créer un compte, c'était lui envoyer un mot de passe
           pour un espace VIDE : sans session, il n'a ni dossier, ni document à signer, ni pièce à
           déposer, et Pizza Quest comme la Communauté restent fermés jusqu'à l'inscription. Des
           accès dormants, et des mots de passe en clair dans des boîtes aux lettres, pour des
           personnes qui n'en ont pas l'usage.
           Pour une exception — un client de la seule boutique —, le bouton « ＋ Compte » de la
           liste des stagiaires le crée à la main. Les comptes déjà créés ne sont pas touchés. */

        // Stagiaire. Le n° de sécurité sociale et l'identifiant France Travail sont chiffrés au repos (AES-256-GCM).
        const champs = await champsEcrivables(conn);
        const cols = champs.filter((f) => body[f] !== undefined);
        const placeholders = cols.map(() => '?').join(', ');
        const chiffrerFT = cols.includes('france_travail_id') && await franceTravailChiffrable(conn);
        const values = cols.map((f) => valeurStockee(f, clean(body[f]), chiffrerFT));

        /* L'identifiant est tiré ICI et non par UUID() en base : sans lui, la ligne de journal
           dirait « un stagiaire a été créé » sans pouvoir dire lequel — une trace à moitié
           utile, qu'on ne peut pas relier à la fiche au moment du contrôle. */
        const learnerId = crypto.randomUUID();
        await conn.query(
            `INSERT INTO learner (id, organization_id, company_id, user_id, ${cols.join(', ')})
             VALUES (?, ?, ?, ?, ${placeholders})`,
            [learnerId, organizationId, companyId, null, ...values]
        );
        logAudit(req, 'learner.create', 'Learner', learnerId);
        /* NÉE « À RECONTACTER » : le rappel date de maintenant. Posée ici et jamais par le
           formulaire — un rappel ne se déclare pas plus ancien qu'il n'est. */
        if (body.a_recontacter === 1 && champs.includes('a_recontacter')
            && await colonneExiste(conn, 'learner', 'a_recontacter_depuis')) {
            await conn.query('UPDATE learner SET a_recontacter_depuis = NOW() WHERE id = ? AND organization_id = ?', [learnerId, organizationId]);
        }

        res.status(201).json({ message: 'Stagiaire créé', ...champsIgnores(body, champs) });
    } catch (err) {
        console.error('Erreur création stagiaire :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * PATCH /api/stagiaires/:id — met à jour la fiche + l'entreprise liée (upsert).
 */
const updateLearner = async (req, res) => {
    const organizationId = req.user.organization_id;
    const learnerId = req.params.id;
    const body = normaliserSaisie(req.body); // mêmes conventions qu'à la création
    if (body.email && !RE_EMAIL.test(body.email)) {
        return res.status(422).json({ error: 'Adresse e-mail invalide.' });
    }
    const refus = refusNote(body) || refusFranceTravail(body) || refusMontantCpf(body);
    if (refus) return res.status(422).json({ error: refus });

    try {
        const conn = db.promise();
        const [rows] = await conn.query(
            // `financing` est lu pour savoir s'il CHANGE réellement (voir la propagation en
            // fin de fonction) : sans lui, la comparaison porterait sur `undefined` et la
            // garde laisserait tout passer.
            /* `user_id` et `email` sont lus pour la PROPAGATION de l'identifiant ci-dessous :
               sans l'ancien e-mail, impossible de savoir s'il change réellement. */
            'SELECT company_id, financing, user_id, email FROM learner WHERE id = ? AND organization_id = ?',
            [learnerId, organizationId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Stagiaire introuvable' });
        }
        let companyId = rows[0].company_id;

        // Rattachement direct à une entreprise (nouveau modèle) : lien FK, ou détachement.
        if (body.company_id !== undefined) {
            if (body.company_id) {
                const [[c]] = await conn.query('SELECT id FROM company WHERE id = ? AND organization_id = ?', [body.company_id, organizationId]);
                companyId = c ? c.id : null;
            } else {
                companyId = null;
            }
        // Rétro-compatibilité : ancienne saisie inline (met à jour ou crée l'entreprise).
        } else if (body.company && body.company.name) {
            const cols = COMPANY_FIELDS.filter((f) => body.company[f] !== undefined && body.company[f] !== '');
            const vals = cols.map((f) => body.company[f]);
            if (companyId) {
                await conn.query(
                    `UPDATE company SET ${cols.map((f) => `${f} = ?`).join(', ')} WHERE id = ? AND organization_id = ?`,
                    [...vals, companyId, organizationId]
                );
            } else {
                companyId = crypto.randomUUID();
                await conn.query(
                    `INSERT INTO company (id, organization_id, ${cols.join(', ')})
                     VALUES (?, ?, ${cols.map(() => '?').join(', ')})`,
                    [companyId, organizationId, ...vals]
                );
                logAudit(req, 'company.create', 'Company', companyId); // même raison qu'à la création
            }
        }

        // Champs de la fiche stagiaire. Le formulaire envoie TOUS les champs : une
        // chaîne vide signifie « vider le champ » (→ NULL), ce qui permet de remettre
        // une liste sur « — ». Seuls les champs REQUIS ne peuvent pas être vidés.
        const REQUIRED = new Set(['first_name', 'last_name', 'financing']);
        const updates = [];
        const values = [];
        const champs = await champsEcrivables(conn);
        const chiffrerFT = body.france_travail_id !== undefined && await franceTravailChiffrable(conn);
        for (const field of champs) {
            if (body[field] === undefined) continue;
            if (body[field] === '' && REQUIRED.has(field)) continue; // ne pas vider un champ requis
            updates.push(`${field} = ?`);
            values.push(valeurStockee(field, body[field], chiffrerFT));
        }
        /* LA DATE DU RAPPEL SUIT LA CASE, sans relire la fiche : posée quand la case se coche,
           GARDÉE tant qu'elle le reste (`COALESCE`) — réenregistrer une fiche cochée ne la fait pas
           rajeunir, sinon la plus ancienne attente ne serait jamais en tête —, effacée à la décoche. */
        if (body.a_recontacter !== undefined && champs.includes('a_recontacter')
            && await colonneExiste(conn, 'learner', 'a_recontacter_depuis')) {
            updates.push('a_recontacter_depuis = CASE WHEN ? = 1 THEN COALESCE(a_recontacter_depuis, NOW()) ELSE NULL END');
            values.push(body.a_recontacter);
        }
        if (companyId !== rows[0].company_id) {
            updates.push('company_id = ?');
            values.push(companyId); // peut être null (détachement)
        }

        if (updates.length > 0) {
            values.push(learnerId, organizationId);
            await conn.query(
                `UPDATE learner SET ${updates.join(', ')} WHERE id = ? AND organization_id = ?`,
                values
            );
        }
        // Référent d'une entreprise (migration 174) : sa civilité, son prénom et son nom suivent cette fiche.
        if (['civility', 'first_name', 'last_name'].some((k) => body[k] !== undefined)) await suivreStagiaire(conn, learnerId);

        /* ─── L'E-MAIL DE LA FICHE EST L'IDENTIFIANT DE CONNEXION : il doit suivre ───────────
           DÉFAUT VÉCU EN PRODUCTION le 2026-09-16. Un e-mail saisi avec une coquille, corrigé
           ensuite sur la fiche : la fiche affiche la bonne adresse, le COMPTE garde l'ancienne.
           La connexion cherche dans `user` — elle ne trouve donc plus personne, et répond
           « Email ou mot de passe incorrect ». Message volontairement ambigu, pour ne pas
           révéler l'existence d'un compte : on réinitialise alors le mot de passe encore et
           encore, ce qui ne peut rien changer, puisque c'est l'IDENTIFIANT qui a bougé.

           TROIS GARDES, et elles comptent toutes les trois :
             · seulement un compte de rôle STAGIAIRE — une fiche peut pointer sur un compte du
               bureau (stagiaire converti), et lui changer son identifiant depuis l'écran
               stagiaire serait une prise de contrôle. Même garde que partout ailleurs ici ;
             · seulement si l'adresse est LIBRE dans l'organisme : deux comptes sur le même
               e-mail rendraient la connexion sans code organisme ambiguë (elle répond 409) ;
             · et l'on REFUSE bruyamment plutôt que de laisser diverger en silence — c'est le
               silence qui a coûté la journée. */
        /* LA COMPARAISON PORTE SUR LE COMPTE, PAS SUR L'ANCIENNE VALEUR DE LA FICHE.

           Première version : « propager si l'e-mail CHANGE dans cet enregistrement ». Elle
           réglait l'avenir et laissait le passé cassé — or c'est le passé qui fait mal : les
           fiches DÉJÀ décrochées le restaient, puisque réenregistrer sans rien changer ne
           déclenchait rien. Le cas signalé était précisément celui-là.

           En comparant à l'e-mail du COMPTE, un simple réenregistrement de la fiche RÉPARE. Le
           geste devient : ouvrir la fiche, enregistrer. Sans supprimer le compte, donc sans
           perdre ce qui s'y rattache. */
        const nouvelEmail = body.email !== undefined
            ? String(body.email).trim()
            : String(rows[0].email || '').trim();
        if (nouvelEmail && rows[0].user_id) {
            const [[compte]] = await conn.query(
                'SELECT id, role, email FROM user WHERE id = ? AND organization_id = ?',
                [rows[0].user_id, organizationId]);
            if (compte && compte.role === 'STAGIAIRE'
                && String(compte.email || '').trim().toLowerCase() !== nouvelEmail.toLowerCase()) {
                const [pris] = await conn.query(
                    'SELECT id FROM user WHERE email = ? AND organization_id = ? AND id <> ?',
                    [nouvelEmail, organizationId, compte.id]);
                if (pris.length) {
                    return res.status(409).json({
                        error: `La fiche est enregistrée, mais le compte de connexion n'a PAS pu suivre : `
                            + `l'adresse « ${nouvelEmail} » est déjà celle d'un autre compte. `
                            + `Ce stagiaire se connecte donc toujours avec « ${compte.email} ».`,
                    });
                }
                await conn.query('UPDATE user SET email = ? WHERE id = ? AND organization_id = ?',
                    [nouvelEmail, compte.id, organizationId]);
                logAudit(req, 'learner.account_email', 'Learner', learnerId);
            }
        }

        // Formations TERMINÉES (marquées manuellement) — colonne optionnelle (migration 094).
        // Traitée à part pour tolérer l'absence de la colonne sans casser le reste.
        if (Object.prototype.hasOwnProperty.call(body, 'completed_levels')) {
            const cl = String(body.completed_levels || '').trim() || null;
            try {
                await conn.query('UPDATE learner SET completed_levels = ? WHERE id = ? AND organization_id = ?',
                    [cl, learnerId, organizationId]);
            } catch (e) { if (!(e && e.code === 'ER_BAD_FIELD_ERROR')) throw e; }
        }

        /* PLUS DE CASCADE FICHE → DOSSIERS (2026-10-01). Le « type de devis » ne se saisit plus sur
           la fiche : il se décide à l'INSCRIPTION (un stagiaire = particulier, par une entreprise =
           professionnel) et se corrige dossier par dossier au menu du parcours. `learner.financing`
           n'est plus qu'un RÉSUMÉ dérivé, recalculé côté dossier (recalcFinancementStagiaire,
           enrollment.controller). Propager un changement de fiche réécrivait au contraire le
           financement de tous les dossiers de la personne — exactement ce qu'on voulait pouvoir
           distinguer (RS7404 particulier, NIV2 professionnel pour le même stagiaire). */

        logAudit(req, 'learner.update', 'Learner', req.params.id);
        res.status(200).json({ success: true, message: 'Stagiaire mis à jour', ...champsIgnores(body, champs) });
    } catch (err) {
        console.error('Erreur mise à jour stagiaire :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/stagiaires/:id/reset-password — régénère le mot de passe du compte
 * stagiaire (le crée si besoin). Renvoie le nouveau mot de passe en clair.
 */
const resetStagiairePassword = async (req, res) => {
    const organizationId = req.user.organization_id;
    try {
        const conn = db.promise();
        const [rows] = await conn.query(
            'SELECT id, user_id, email, first_name, last_name, phone FROM learner WHERE id = ? AND organization_id = ?',
            [req.params.id, organizationId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Stagiaire introuvable' });
        }
        const learner = rows[0];
        const password = generatePassword();
        const hash = await bcrypt.hash(password, 10);

        let userId = learner.user_id;
        if (userId) {
            /* #1 GARDE DE RÔLE — ne JAMAIS réinitialiser un compte du bureau via la route stagiaire.
               Un compte converti (stagiaire→bureau) garde sa fiche ; sans ce garde-fou, « réinitialiser
               son mot de passe stagiaire » écraserait un compte admin. Mêmes règles que deleteLearner. */
            const [[u]] = await conn.query('SELECT role FROM user WHERE id = ? AND organization_id = ?', [userId, organizationId]);
            if (u && u.role !== 'STAGIAIRE') {
                return res.status(409).json({ error: "Ce compte n'est pas un compte stagiaire : sa gestion passe par « Équipe & accès »." });
            }
            await conn.query('UPDATE user SET password = ? WHERE id = ? AND organization_id = ?',
                [hash, userId, organizationId]);
            await couperSessions(userId); // #4 : évincer toute session existante (compte peut-être compromis)
        } else {
            if (!learner.email) {
                return res.status(422).json({ error: "Ce stagiaire n'a pas d'email : impossible de créer un compte." });
            }
            // Cloisonnement : ne rattacher/réinitialiser qu'un compte du MÊME organisme.
            const [ex] = await conn.query('SELECT id, role FROM user WHERE email = ? AND organization_id = ?', [learner.email, organizationId]);
            if (ex.length > 0) {
                /* #1 GARDE DE RÔLE — l'e-mail correspond à un compte existant : ne le toucher QUE si
                   c'est un stagiaire. Sinon un SECRETARIAT pourrait créer une fiche à l'e-mail d'un
                   admin puis « réinitialiser » = prise de contrôle du compte. Refuser. */
                if (ex[0].role !== 'STAGIAIRE') {
                    return res.status(409).json({ error: "Cette adresse appartient déjà à un compte non-stagiaire : impossible de le réinitialiser ici." });
                }
                userId = ex[0].id;
                await conn.query('UPDATE user SET password = ? WHERE id = ? AND organization_id = ?',
                    [hash, userId, organizationId]);
                await couperSessions(userId); // #4
            } else {
                userId = crypto.randomUUID();
                await conn.query(
                    `INSERT INTO user
                        (id, organization_id, role, first_name, last_name, email, phone, password)
                     VALUES (?, ?, 'STAGIAIRE', ?, ?, ?, ?, ?)`,
                    [userId, organizationId, learner.first_name, learner.last_name, learner.email, learner.phone || null, hash]
                );
            }
            await conn.query('UPDATE learner SET user_id = ? WHERE id = ?', [userId, learner.id]);
        }

        if (learner.email) {
            const login = `${appUrl()}/login`;
            /* Le MÊME bouton sert à créer un compte et à en réinitialiser un. L'e-mail, lui, ne
               doit pas être le même : `learner.user_id` (sa valeur AVANT réassignation) dit si le
               compte préexistait. Absent → on vient de le créer/rattacher pour ce stagiaire, donc
               e-mail de BIENVENUE avec ses identifiants (son e-mail sert d'identifiant). Présent →
               simple réinitialisation. */
            const { subject, html } = learner.user_id
                ? resetEmail({ firstName: learner.first_name, password, loginUrl: login })
                : credentialsEmail({ firstName: learner.first_name, email: learner.email, password, loginUrl: login });
            // Compte préexistant → réinitialisation ('reset') ; sinon création → identifiants ('credentials').
            sendMail({ to: learner.email, subject, html, kind: learner.user_id ? 'reset' : 'credentials' });
        }
        res.status(200).json({
            success: true,
            created: !learner.user_id,
            message: learner.user_id ? 'Mot de passe réinitialisé' : 'Compte créé',
            password,
        });
    } catch (err) {
        console.error('Erreur réinitialisation mot de passe :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * DELETE /api/stagiaires/:id — supprime la fiche ET, si c'est son seul rôle, le compte de connexion.
 *
 * Sinon le compte reste ORPHELIN (aucune fiche pour le gérer) et continue de réserver son e-mail :
 * on ne peut plus réutiliser l'adresse (« e-mail déjà utilisé »). On ne supprime le compte QUE s'il
 * est de rôle STAGIAIRE et que plus RIEN ne s'y rattache — aucune autre fiche, aucune entreprise
 * (représentant). Un compte du bureau, ou un référent d'entreprise, n'est jamais supprimé ici.
 * (La migration 139 a nettoyé les orphelins déjà présents avant ce correctif.)
 */
const deleteLearner = async (req, res) => {
    const orgId = req.user.organization_id;
    try {
        const conn = db.promise();
        const [[learner]] = await conn.query('SELECT user_id FROM learner WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);
        await conn.query('DELETE FROM learner WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);

        const uid = learner?.user_id;
        if (uid) {
            const [[{ n: autresFiches }]] = await conn.query('SELECT COUNT(*) AS n FROM learner WHERE user_id = ?', [uid]);
            let refEntreprise = 0;
            try { const [[c]] = await conn.query('SELECT COUNT(*) AS n FROM company WHERE user_id = ?', [uid]); refEntreprise = c.n; }
            catch (e) { if (!(e && (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE'))) throw e; } // company.user_id : migration 084
            if (autresFiches === 0 && refEntreprise === 0) {
                // `role = STAGIAIRE` : garde-fou en plus — jamais un compte du bureau, même en cas d'incohérence.
                await conn.query("DELETE FROM user WHERE id = ? AND organization_id = ? AND role = 'STAGIAIRE'", [uid, orgId]);
            }
        }
        logAudit(req, 'learner.delete', 'Learner', req.params.id);
        res.status(200).json({ success: true, message: 'Stagiaire supprimé' });
    } catch (err) {
        console.error('Erreur suppression stagiaire :', err);
        res.status(400).json({ message: 'Erreur suppression' });
    }
};

/**
 * DELETE /api/stagiaires/:id/account — supprime UNIQUEMENT le compte de connexion
 * du stagiaire (la fiche, les dossiers et documents sont conservés).
 */
const deleteStagiaireAccount = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const [[learner]] = await conn.query(
            'SELECT id, user_id FROM learner WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);
        if (!learner) return res.status(404).json({ message: 'Stagiaire introuvable' });
        if (!learner.user_id) return res.status(400).json({ message: "Ce stagiaire n'a pas de compte de connexion." });
        /* #3 GARDE DE RÔLE — cette route ne supprime QUE des comptes stagiaire. Une fiche peut pointer
           sur un compte du bureau (stagiaire converti) ; le supprimer ici effacerait un login admin
           (et, s'il était le dernier propriétaire, verrouillerait l'organisme). */
        const [[u]] = await conn.query('SELECT role FROM user WHERE id = ? AND organization_id = ?', [learner.user_id, orgId]);
        if (u && u.role !== 'STAGIAIRE') {
            return res.status(409).json({ error: "Ce compte n'est pas un compte stagiaire : sa suppression passe par « Équipe & accès »." });
        }
        // Détache la fiche puis supprime le compte (login) — la fiche reste intacte. `role='STAGIAIRE'`
        // en défense de profondeur (comme deleteLearner), même si le pré-contrôle l'a déjà écarté.
        await conn.query('UPDATE learner SET user_id = NULL WHERE id = ?', [learner.id]);
        await conn.query("DELETE FROM user WHERE id = ? AND organization_id = ? AND role = 'STAGIAIRE'", [learner.user_id, orgId]);
        res.json({ success: true, message: 'Compte de connexion supprimé (fiche conservée).' });
    } catch (err) {
        console.error('Erreur suppression compte stagiaire :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/stagiaires/import — l'import CSV (demandé le 2026-09-22 ; les règles : lib/importFiches.js).
 * Corps : { lignes: [{ _ligne, last_name, first_name, … }], essai }.
 *
 * SANS `essai: false`, RIEN NE S'ÉCRIT : une requête qui oublie le drapeau reste un essai. L'import
 * refait tous les contrôles de l'essai plutôt que de croire l'écran, et chaque fiche créée l'est comme
 * à la main — mêmes colonnes (champsEcrivables), même trace au journal, pas de compte de connexion.
 */
const importLearners = async (req, res) => {
    const lignes = Array.isArray(req.body?.lignes) ? req.body.lignes : null;
    const essai = req.body?.essai !== false;
    if (!lignes || !lignes.length) return res.status(422).json({ error: 'Aucune ligne à importer.' });
    if (lignes.length > MAX_LIGNES) return res.status(422).json({ error: `Trop de lignes (${lignes.length}) : ${MAX_LIGNES} au plus par import.` });
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        // La date en TEXTE : un objet Date se décalerait d'un jour selon le fuseau, et ne se comparerait plus.
        const [existants] = await conn.query(
            "SELECT email, last_name, first_name, DATE_FORMAT(birthday, '%Y-%m-%d') AS birthday FROM learner WHERE organization_id = ?", [orgId]);
        const [entreprises] = await conn.query('SELECT id, name, siret, zip_code FROM company WHERE organization_id = ?', [orgId]);
        const resultats = analyserStagiaires(lignes, { existants, entreprises, normaliser: normaliserSaisie, reEmail: RE_EMAIL });
        if (!essai) {
            const champs = await champsEcrivables(conn);
            for (const r of resultats.filter((x) => x.statut === 'a_creer')) {
                const cols = champs.filter((f) => r.valeurs[f] !== undefined);
                const id = crypto.randomUUID();
                try {
                    await conn.query(
                        `INSERT INTO learner (id, organization_id, company_id, user_id, ${cols.join(', ')})
                         VALUES (?, ?, ?, ?, ${cols.map(() => '?').join(', ')})`,
                        [id, orgId, r.company_id || null, null, ...cols.map((f) => valeurStockee(f, clean(r.valeurs[f]), false))]);
                    logAudit(req, 'learner.create', 'Learner', id);
                    r.statut = 'cree';
                } catch (e) {
                    // Une ligne qui échoue n'arrête pas les autres : elle est dite, les suivantes passent.
                    console.error('Import stagiaires, ligne', r.ligne, ':', e.message);
                    r.statut = 'erreur'; r.motif = 'l\'écriture a échoué';
                }
            }
        }
        // Les valeurs ne repartent pas : l'écran les a déjà, et une réponse n'a pas à faire l'écho de mille fiches.
        const sortie = resultats.map(({ valeurs, company_id, ...r }) => r);
        res.json({ data: { essai, bilan: bilan(sortie), resultats: sortie } });
    } catch (err) {
        console.error('Erreur import stagiaires :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * Les moyens de paiement PROPOSÉS pour le règlement : ceux de l'entité émettrice de l'organisme
 * (Paramètres → Facturation → « École Pizza »), la MÊME liste qu'à la caisse. On prend l'entité
 * `is_organization` si la colonne existe (migration 117), sinon l'entité par défaut, sinon le repli
 * des quatre libellés. Tolérant : toute lecture qui échoue retombe sur le repli (le règlement marche
 * avant comme après, sans jamais planter sur une base ancienne).
 */
async function moyensPaiementOrg(conn, orgId) {
    try {
        let ordre = 'is_default DESC';
        if (await colonneExiste(conn, 'billing_profile', 'is_organization')) ordre = 'is_organization DESC, is_default DESC';
        const [[bp]] = await conn.query(
            `SELECT payment_methods FROM billing_profile WHERE organization_id = ? ORDER BY ${ordre} LIMIT 1`, [orgId]);
        return moyensConfigures(bp ? bp.payment_methods : '');
    } catch {
        return moyensConfigures('');
    }
}

/**
 * GET /api/stagiaires/:id/reglements — le suivi du règlement, un bloc par DOSSIER : l'acompte et le
 * solde, payés ou dus, d'après les factures (table `payment`) OU la coche manuelle (migration 194).
 * La règle vit dans lib/reglementDossier.js (pure, éprouvée) ; ici on ne fait que rassembler.
 */
const getReglements = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const [[learner]] = await conn.query('SELECT id FROM learner WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);
        if (!learner) return res.status(404).json({ message: 'Stagiaire introuvable' });

        // Les deux dates « payé le … » arrivent avec la 194 ; sans elles, on lit le règlement d'après
        // les seules factures, et l'écran n'offre pas la coche (`migration_194: false`).
        const aDates = await colonneExiste(conn, 'enrollment', 'acompte_paye_le');
        const colsDates = aDates
            ? "DATE_FORMAT(e.acompte_paye_le, '%Y-%m-%d') AS acompte_paye_le, DATE_FORMAT(e.solde_paye_le, '%Y-%m-%d') AS solde_paye_le"
            : 'NULL AS acompte_paye_le, NULL AS solde_paye_le';
        // Le moyen de paiement (migration 195) — mêmes précautions : sans les colonnes, on lit NULL et
        // l'écran n'offre pas le sélecteur (`migration_195: false`).
        const aMoyen = await colonneExiste(conn, 'enrollment', 'acompte_moyen');
        const colsMoyen = aMoyen
            ? 'e.acompte_moyen, e.acompte_ref, e.solde_moyen, e.solde_ref'
            : 'NULL AS acompte_moyen, NULL AS acompte_ref, NULL AS solde_moyen, NULL AS solde_ref';
        const [dossiers] = await conn.query(
            `SELECT e.id AS enrollment_id, e.price AS enroll_price, e.acompte, ${colsDates}, ${colsMoyen},
                    p.title AS program_title, p.code AS program_code, p.price AS tarif, s.year, s.week
               FROM enrollment e
               JOIN training_session s ON s.id = e.session_id
               LEFT JOIN training_program p ON p.id = s.program_id
              WHERE e.learner_id = ? AND e.organization_id = ?
              ORDER BY s.year DESC, s.week DESC, p.code`,
            [req.params.id, orgId]
        );

        const data = [];
        for (const d of dossiers) {
            /* Les factures qui désignent le dossier — sur la facture même OU sur l'une de ses lignes
               (une facture d'entreprise en porte une par stagiaire), comme lib/inscriptionsFacturees.js.
               Le PAYÉ = somme des règlements REUSSI ; la date, le plus récent d'entre eux. */
            const [factures] = await conn.query(
                `SELECT i.number AS numero, i.type, i.status AS statut, i.amount_net AS montant,
                        COALESCE(SUM(CASE WHEN pay.status = 'REUSSI' THEN pay.amount END), 0) AS paye,
                        DATE_FORMAT(MAX(CASE WHEN pay.status = 'REUSSI' THEN pay.paid_at END), '%Y-%m-%d') AS dernier_paiement
                   FROM invoice i
                   LEFT JOIN payment pay ON pay.invoice_id = i.id
                  WHERE i.organization_id = ? AND i.type IN ('ACOMPTE', 'FACTURE')
                    AND (i.enrollment_id = ? OR i.id IN (SELECT il.invoice_id FROM invoice_line il WHERE il.enrollment_id = ?))
                  GROUP BY i.id`,
                [orgId, d.enrollment_id, d.enrollment_id]
            );
            const { montant: prix } = montantDuDossier(d.enroll_price, d.tarif);
            const r = calculerReglement({
                prix, acompteConvenu: d.acompte,
                acomptePayeLe: d.acompte_paye_le, soldePayeLe: d.solde_paye_le,
                acompteMoyen: d.acompte_moyen, acompteRef: d.acompte_ref,
                soldeMoyen: d.solde_moyen, soldeRef: d.solde_ref,
                factures,
            });
            data.push({
                enrollment_id: d.enrollment_id, program_title: d.program_title, program_code: d.program_code,
                year: d.year, week: d.week,
                acompte_convenu: d.acompte != null ? Number(d.acompte) : null, // pour préremplir le champ de saisie
                migration_194: aDates, // l'écran n'offre la coche « payé le… » que si la 194 est jouée
                migration_195: aMoyen, // … et le moyen de paiement que si la 195 est jouée
                ...r,
            });
        }
        // La liste PROPOSÉE par la carte (le sélecteur « Réglé par ») : les moyens de l'entité.
        const moyens = await moyensPaiementOrg(conn, orgId);
        res.json({ data, moyens });
    } catch (err) {
        console.error('getReglements:', err.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * PATCH /api/stagiaires/:id/reglement/:enrollmentId — la PART MANUELLE du règlement d'un dossier :
 * le montant de l'acompte convenu (colonne `acompte`, déjà là) et les deux « payé le … » (194).
 * Ce que porte une facture ne se saisit PAS ici : la facture fait foi (cf. lib/reglementDossier.js).
 */
const updateReglement = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const [[enr]] = await conn.query(
            'SELECT id FROM enrollment WHERE id = ? AND learner_id = ? AND organization_id = ?',
            [req.params.enrollmentId, req.params.id, orgId]
        );
        if (!enr) return res.status(404).json({ message: 'Dossier introuvable' });

        const b = req.body || {};
        const sets = [];
        const vals = [];

        // Montant de l'acompte convenu — les montants se TAPENT en français (cf. lib/montantSaisi.js).
        if ('acompte' in b) {
            const brut = b.acompte;
            if (brut === null || brut === '' || brut === undefined) sets.push('acompte = NULL');
            else {
                const m = lireMontant(brut); // NaN (pas null) si illisible — d'où Number.isFinite.
                if (!Number.isFinite(m)) return res.status(422).json({ error: 'Montant de l\'acompte invalide, écrivez-le par exemple 450,00.' });
                sets.push('acompte = ?');
                vals.push(m.toFixed(2));
            }
        }

        // Les « payé le … » sont les colonnes de la 194 : sans elles, un refus lisible plutôt qu'un plantage.
        if (('acompte_paye_le' in b) || ('solde_paye_le' in b)) {
            const aDates = await colonneExiste(conn, 'enrollment', 'acompte_paye_le');
            if (!aDates) return res.status(503).json({ error: 'La coche « payé le… » arrive avec la migration 194 (non jouée).' });
            for (const cle of ['acompte_paye_le', 'solde_paye_le']) {
                if (!(cle in b)) continue;
                const v = b[cle];
                if (v === null || v === '' || v === undefined) sets.push(`${cle} = NULL`);
                else if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) { sets.push(`${cle} = ?`); vals.push(v); }
                else return res.status(422).json({ error: 'Date invalide (attendu AAAA-MM-JJ).' });
            }
        }

        // Le moyen de paiement du règlement (195), séparément acompte / solde. Sans les colonnes, un
        // refus lisible. Le moyen est l'un des moyens connus (ou vide) ; la référence, un texte court.
        if (['acompte_moyen', 'solde_moyen', 'acompte_ref', 'solde_ref'].some((k) => k in b)) {
            const aMoyen = await colonneExiste(conn, 'enrollment', 'acompte_moyen');
            if (!aMoyen) return res.status(503).json({ error: 'Le moyen de paiement arrive avec la migration 195 (non jouée).' });
            // On accepte les moyens de l'entité (ceux que la carte propose) et les codes historiques.
            const autorises = await moyensPaiementOrg(conn, orgId);
            for (const cle of ['acompte_moyen', 'solde_moyen']) {
                if (!(cle in b)) continue;
                const v = b[cle];
                if (v === null || v === '' || v === undefined) sets.push(`${cle} = NULL`);
                else if (moyenValide(v, autorises)) { sets.push(`${cle} = ?`); vals.push(v); }
                else return res.status(422).json({ error: 'Moyen de paiement inconnu.' });
            }
            for (const cle of ['acompte_ref', 'solde_ref']) {
                if (!(cle in b)) continue;
                const v = b[cle];
                if (v === null || v === '' || v === undefined) sets.push(`${cle} = NULL`);
                else { sets.push(`${cle} = ?`); vals.push(String(v).trim().slice(0, 80)); }
            }
        }

        if (!sets.length) return res.status(422).json({ error: 'Rien à enregistrer.' });
        vals.push(req.params.enrollmentId, orgId);
        await conn.query(`UPDATE enrollment SET ${sets.join(', ')} WHERE id = ? AND organization_id = ?`, vals);
        // Journalisé comme le retrait de session : sur le STAGIAIRE (sa fiche), pas sur un objet
        // « dossier » qui n'a d'écran nulle part — la cloche mène ainsi à la fiche où vit le règlement.
        logAudit(req, 'enrollment.reglement', 'Learner', req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error('updateReglement:', err.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = {
    getLearners, getDistinctions, getARecontacter, getLearner, createLearner, updateLearner, deleteLearner, resetStagiairePassword,
    deleteStagiaireAccount, createStagiaireAccount, normaliserSaisie, RE_EMAIL, importLearners, getReglements, updateReglement,
};
