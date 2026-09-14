/**
 * QUI EST PRÉVENU DE QUOI — la rubrique concernée par une action journalisée.
 *
 * POURQUOI CE FICHIER EXISTE. Le carillon sonne pour tout le personnel dès qu'une autre
 * personne modifie quelque chose. Pour dire ENFIN ce qui a changé, on relit le journal
 * d'audit — mais le journal, lui, est réservé aux administrateurs, et pour de bonnes raisons :
 * il contient « Facture supprimée », « Paiement enregistré », « Dépense créée ». Recracher ce
 * flux à tout le monde ferait de la cloche une fuite d'informations comptables déguisée en
 * confort d'usage.
 *
 * LA RÈGLE RETENUE : on est prévenu de ce qu'on a déjà le droit de VOIR. Chaque entité
 * journalisée est rattachée à sa rubrique de menu, et l'API ne renvoie que les rubriques
 * accordées à la personne. Une entité inconnue de cette table n'est montrée qu'aux
 * propriétaires : l'ajout d'une entité demain ne peut donc pas ouvrir une fuite par oubli.
 *
 * POURQUOI ON NE RECALCULE PAS LE MENU PAR DÉFAUT D'UN RÔLE ICI. Ce dictionnaire-là vit dans
 * l'interface (`ui/lib/nav.js`, `builtinRoleAccess`), dérivé de l'arbre de navigation lui-même.
 * En recopier une version serveur, c'est le défaut déjà payé une fois : le tableau de bord
 * tenait SA table d'actions en double, avec huit entrées sur soixante-quatre, et divergeait
 * silencieusement du journal. On s'en tient donc à ce qui est EXPLICITEMENT accordé en base
 * (`nav_access`) — le reste ferme, il n'ouvre pas.
 */
const { modeFor, SECTIONS_LECTURE_SEULE } = require('../middlewares/sectionAccess.middleware.js');

/* Propriétaires : voient tout, toujours (ce sont eux qui distribuent les accès).
   ADMIN_ROLES inclut le secrétariat : tant qu'aucun accès n'a été restreint pour lui, il garde
   la vue complète qu'il a déjà partout ailleurs dans l'API. */
const OWNER_ROLES = ['SUPER_ADMIN', 'ADMIN_ORGANISME'];
const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT'];

/** Entité journalisée → rubrique de menu. Les clés sont celles posées par `logAudit`. */
const SECTION_PAR_ENTITE = {
    Learner: '/stagiaires', PieceDepot: '/stagiaires', GeneratedDocument: '/stagiaires',
    Company: '/entreprises',
    TrainingSession: '/sessions', AttendanceSheet: '/sessions',
    Invoice: '/factures', BillingProfile: '/reglages-facturation',
    AccountingSettings: '/comptabilite', Expense: '/comptabilite', RevenueExtra: '/comptabilite',
    MaterialSale: '/ventes', InventoryItem: '/ventes',
    DocumentTemplate: '/modeles', DocumentCondition: '/modeles', DocumentEquivalence: '/modeles',
    ConditionField: '/modeles', EmargementTemplate: '/modeles', PieceType: '/modeles',
    Quiz: '/qcm', QuizResponse: '/qcm',
    /* La grille se configure dans Formations, la note se saisit depuis la session : chaque
       entité pointe la rubrique où se fait le GESTE, pas celle où l'on consulte le résultat. */
    EvaluationGrille: '/formations', EvaluationNote: '/sessions',
    Partner: '/partenaires', PartnerContribution: '/partenaires', PartnerProduct: '/partenaires',
    Opco: '/opcos', Organization: '/reglages', Archive: '/suivi',
    CommunityPost: '/communaute', CommunityAnswer: '/communaute', Recipe: '/communaute',
    AccessProfile: '/roles', User: '/equipe',
    quest_category: '/pizza-quest-admin', quest_chapter: '/pizza-quest-admin',
    quest_difficulty: '/pizza-quest-admin', quest_prerequisite: '/pizza-quest-admin',
    quest_question: '/pizza-quest-admin',
};

/**
 * RÉGLER L'OUTIL N'EST PAS UN ÉVÉNEMENT — ce qui sépare la cloche du journal d'audit.
 *
 * LES DEUX ÉCRANS DISAIENT LA MÊME CHOSE. La cloche relit `audit_log`, exactement comme le
 * journal : elle en devenait un second exemplaire, plus court et moins consultable. Relevé en
 * production, ce qu'elle annonçait : « Produit partenaire modifié », « Produit partenaire
 * supprimé », à côté de « Document envoyé » et « Pièce déposée ». Personne n'a besoin d'un
 * carillon pour apprendre qu'un tarif de catalogue a bougé.
 *
 * LA RÈGLE : une cloche répond à « quelque chose a bougé dans un DOSSIER, dois-je agir ? ». Le
 * journal répond à « que s'est-il passé, exactement, et qui l'a fait ? ». Modifier un modèle de
 * document, un type de pièce, un tarif partenaire ou les réglages de l'organisme, c'est
 * configurer l'outil : ça se retrouve, ça ne se signale pas.
 *
 * ON A ÉCARTÉ LE TRI PAR AUTEUR (personnel / stagiaire), qui semblait plus élégant : sur les
 * cent dernières lignes du journal, les cent venaient de trois membres du personnel. Une cloche
 * muette pour tout ce que fait un collègue serait vide dans une école de trois personnes.
 *
 * UNE ENTITÉ INCONNUE EST UN RÉGLAGE. Le silence est le défaut sûr : ajouter une entité demain
 * ne peut pas se mettre à sonner chez tout le monde par oubli — même logique que la règle
 * d'accès ci-dessus, qui ferme au lieu d'ouvrir.
 */
const ENTITES_REGLAGE = new Set([
    // Modèles et conditions : la forme des documents, pas les documents.
    'DocumentTemplate', 'DocumentCondition', 'DocumentEquivalence', 'ConditionField',
    'EmargementTemplate', 'PieceType',
    // Le QCM en tant que MODÈLE. Une réponse de stagiaire (`QuizResponse`), elle, est un événement.
    'Quiz',
    /* La GRILLE d'évaluation est un réglage au même titre : on y fixe le barème et le seuil.
       La NOTE, elle, reste un événement — c'est un résultat d'examen qui arrive à quelqu'un. */
    'EvaluationGrille',
    // Catalogue partenaire et stock : des tarifs et des références. Une CONTRIBUTION, en
    // revanche, est de l'argent qui arrive — elle reste un événement.
    'Partner', 'PartnerProduct', 'InventoryItem',
    // Paramétrage de la maison : facturation, comptabilité, rôles, équipe, financeurs.
    'BillingProfile', 'AccountingSettings', 'Opco', 'Organization', 'AccessProfile', 'User',
    // Administration de Pizza Quest.
    'quest_category', 'quest_chapter', 'quest_difficulty', 'quest_prerequisite', 'quest_question',
]);

/** Cette action mérite-t-elle la cloche, ou seulement le journal ? */
function estEvenement(entity) {
    /* L'ENTITÉ DOIT ÊTRE CONNUE. Écrit d'abord `!ENTITES_REGLAGE.has(entity)`, ce test rendait
       VRAI pour n'importe quel nom inventé — l'inverse de ce que la note ci-dessus annonce. Les
       appelants n'exposent aujourd'hui que des entités connues, si bien que rien ne l'aurait
       révélé ; mais une fonction doit tenir sa promesse seule, sans dépendre de la prudence de
       qui l'appelle. */
    return !!entity && !!SECTION_PAR_ENTITE[entity] && !ENTITES_REGLAGE.has(entity);
}

const RUBRIQUES = [...new Set(Object.values(SECTION_PAR_ENTITE))];

/** Rubrique d'une entité journalisée, ou null si on ne la connaît pas. */
function sectionDeLEntite(entity) {
    return SECTION_PAR_ENTITE[entity] || null;
}

/**
 * Rubriques dont cette personne doit être tenue au courant.
 * @returns {null|string[]} `null` = tout, `[]` = rien.
 */
function sectionsVisibles({ role, navAccess }) {
    if (OWNER_ROLES.includes(role)) return null;
    /* Aucun réglage : on ne devine pas le menu par défaut du rôle (cf. en-tête). Un profil
       d'administration garde sa vue complète, les autres n'ont pas d'activité — c'est la
       position fermée, celle qui ne peut pas fuir. */
    if (navAccess == null || navAccess === '') return ADMIN_ROLES.includes(role) ? null : [];
    // Les rubriques qui distribuent les accès (Équipe, Rôles) ne se délèguent pas — donc ne se
    // racontent pas non plus : savoir qui a été converti ou quel profil a changé, c'est déjà
    // une information d'administration.
    /* ÉQUIPE ET RÔLES RESTENT HORS DE LA CLOCHE, même depuis qu'ils se délèguent en lecture.
       Savoir qu'un membre a changé de profil est une information d'ADMINISTRATION, pas une
       nouvelle d'équipe : pouvoir la consulter ne veut pas dire vouloir être réveillé par elle. */
    return RUBRIQUES.filter((s) => !SECTIONS_LECTURE_SEULE.includes(s) && modeFor(navAccess, s));
}

/**
 * Entités correspondant à ces rubriques — sert à filtrer la requête AVANT le `LIMIT`, sinon
 * un formateur reçoit trente lignes dont il ne peut en voir que deux.
 * @returns {null|string[]} `null` quand tout est visible.
 */
function entitesVisibles(sections) {
    if (sections == null) return null;
    const permis = new Set(sections);
    return Object.keys(SECTION_PAR_ENTITE).filter((e) => permis.has(SECTION_PAR_ENTITE[e]));
}

/**
 * Cette ligne d'activité est-elle déjà lue ?
 *
 * Un flux ne se lit pas ligne à ligne mais « jusqu'ici » : une seule date par personne
 * (`user.activity_seen_at`) suffit, est neuf ce qui lui est postérieur. `dormant` couvre la
 * période AVANT la migration 142 — colonne absente, on ne sait pas où en est la lecture, donc
 * tout est réputé lu : la rubrique s'affiche sans faire sauter une pastille inventée.
 */
function estLu({ quand, vue, dormant }) {
    if (dormant) return true;
    if (!vue) return false; // jamais rien marqué comme lu : tout est neuf, et c'est vrai
    return new Date(quand) <= new Date(vue);
}

/**
 * Regroupe les lignes CONSÉCUTIVES identiques — même geste, même entité, même auteur.
 *
 * POURQUOI. L'inscription d'un groupe crée douze stagiaires en une fois, et chacun laisse sa
 * trace : c'est voulu, un contrôle veut savoir LESQUELS. Mais recopié tel quel dans la cloche,
 * ce lot chasse tout le reste de l'écran — douze fois « Stagiaire ajouté », et la facture
 * envoyée juste avant n'est plus visible. La trace reste fine, l'affichage se resserre.
 *
 * CONSÉCUTIVES seulement, et c'est important : deux séries séparées par un autre geste restent
 * deux lignes. Fusionner à distance ferait remonter un événement ancien au rang du récent et
 * mentirait sur l'ordre des choses.
 *
 * Les lignes arrivent de la plus récente à la plus ancienne : le groupe garde donc la date de
 * la plus récente. Il est non lu dès qu'une seule de ses lignes l'est.
 */
function regrouperConsecutives(lignes) {
    const out = [];
    for (const l of lignes) {
        const p = out[out.length - 1];
        if (p && p.action === l.action && p.entity === l.entity && p.auteur === l.auteur) {
            p.nombre += 1;
            p.is_read = p.is_read && l.is_read ? 1 : 0;
            continue;
        }
        out.push({ ...l, nombre: 1 });
    }
    return out;
}

module.exports = {
    ENTITES_REGLAGE, estEvenement,
    SECTION_PAR_ENTITE, sectionDeLEntite, sectionsVisibles, entitesVisibles, estLu,
    regrouperConsecutives, OWNER_ROLES, ADMIN_ROLES,
};
