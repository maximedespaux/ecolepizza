/**
 * Traduit les codes techniques du journal d'audit en libellés lisibles.
 *
 * POURQUOI ÇA VIT ICI, ET PAS EN BASE. Le journal enregistre un code stable — `invoice.facturx`,
 * `sale.checkout` — parce qu'une trace d'audit ne doit jamais changer de sens après coup : ce
 * qui a été écrit reste écrit. Mais un code stable n'est pas fait pour être lu par un humain.
 * La traduction est une affaire d'affichage, elle appartient donc à l'interface. On garde la
 * vérité en base, on la rend lisible à l'écran — les deux ne sont pas le même métier.
 *
 * La table précédente ne couvrait que 8 codes sur 64. Tout le reste tombait sur le code brut :
 * l'écran affichait « invoice.facturx », « emargement_template.update », « accessprofile.system »
 * — exactement ce qu'un journal est censé éviter, puisqu'il existe pour être relu.
 *
 * Les tons suivent la NATURE de l'action, pas son sujet : une suppression est rouge où qu'elle
 * arrive, un envoi est bleu. La couleur doit répondre « dois-je m'en inquiéter ? » d'un coup
 * d'œil, avant même la lecture du libellé.
 */

/* Tons du composant Badge : g vert (positif) · a ambre (modification) · r rouge (destructif)
   · b bleu (émission / envoi) · n neutre. */
const G = 'g'; const A = 'a'; const R = 'r'; const B = 'b'; const N = 'n';

/** action → [libellé, ton]. La clé est le code exact posé par logAudit. */
const ACTION_LABEL = {
    // Documents de dossier
    'document.create': ['Document préparé', N],
    'document.docx': ['Document généré (Word)', B],
    'document.pdf': ['Document généré (PDF)', B],
    'document.send': ['Document envoyé', B],
    'document.sign': ['Document signé', G],
    'document.sign_link': ['Lien de signature émis', B],
    'document.delete': ['Document supprimé', R],

    // Facturation et ventes
    'invoice.create': ['Facture créée', G],
    'invoice.facturx': ['Facture Factur-X téléchargée', B],
    'payment.record': ['Paiement enregistré', G],
    'sale.create': ['Vente enregistrée', G],
    'sale.checkout': ['Vente encaissée', G],

    // Inventaire
    'inventory.create': ['Article ajouté à l\'inventaire', G],
    'inventory.sell': ['Article vendu', A],

    // Émargements
    'attendance.generate': ['Émargement généré', B],
    'attendance.sign': ['Émargement signé', G],
    'emargement.regenerate': ['Émargement régénéré', A],
    'intervenant.emargement.sign': ['Émargement signé (intervenant)', G],
    'emargement_template.create': ['Modèle d\'émargement créé', G],
    'emargement_template.update': ['Modèle d\'émargement modifié', A],
    'emargement_template.delete': ['Modèle d\'émargement supprimé', R],

    // Modèles de documents
    'template.save': ['Modèle enregistré', A],
    'template.upload': ['Modèle importé', G],
    'template.duplicate': ['Modèle dupliqué', G],
    'template.rename': ['Identifiant de modèle renommé', A],
    'template.reorder': ['Modèles réordonnés', A],
    'template.delete': ['Modèle supprimé', R],
    'template.customTokens': ['Jetons personnalisés modifiés', A],

    // Conditions et champs de document
    'condition.create': ['Condition créée', G],
    'condition.update': ['Condition modifiée', A],
    'condition.delete': ['Condition supprimée', R],
    'condition_field.save': ['Champs de document modifiés', A],
    'equivalence.create': ['Équivalence créée', G],
    'equivalence.update': ['Équivalence modifiée', A],
    'equivalence.delete': ['Équivalence supprimée', R],

    // Sessions et intervenants
    'session.create': ['Session planifiée', G],
    'session.intervenant.add': ['Intervenant ajouté à une session', G],
    'session.intervenant.slots': ['Créneaux d\'intervenant modifiés', A],
    'session.intervenant.remove': ['Intervenant retiré d\'une session', R],

    // Stagiaires et équipe
    'learner.create': ['Stagiaire ajouté', G],
    'equipe.convert': ['Membre converti en stagiaire', A],
    'equipe.revert_stagiaire': ['Retour au statut stagiaire', A],

    // Comptabilité
    'expense.create': ['Dépense ajoutée', G],
    'expense.delete': ['Dépense supprimée', R],
    'revenueextra.create': ['Recette annexe ajoutée', G],
    'revenueextra.update': ['Recette annexe modifiée', A],
    'revenueextra.delete': ['Recette annexe supprimée', R],
    'accountingsettings.update': ['Réglages comptables modifiés', A],

    // Partenaires (OPCO, financeurs)
    'partner.create': ['Partenaire créé', G],
    'partner.update': ['Partenaire modifié', A],
    'partner.delete': ['Partenaire supprimé', R],
    'partner.contribution.create': ['Financement enregistré', G],
    'partner.contribution.delete': ['Financement supprimé', R],
    'opco.create': ['OPCO créé', G],

    // Quiz
    'quiz.create': ['Quiz créé', G],
    'quiz.save': ['Quiz enregistré', A],
    'quiz.duplicate': ['Quiz dupliqué', G],
    'quiz.submit': ['Quiz passé', N],
    'quiz.send': ['Quiz envoyé', B],

    // Organisme et accès
    'organization.update': ['Organisme modifié', A],
    'organization.locations': ['Lieux de formation modifiés', A],
    'accessprofile.create': ['Profil d\'accès créé', G],
    'accessprofile.system': ['Profil d\'accès système modifié', A],
    'platform.org.create': ['Organisme créé (plateforme)', G],

    // Entités émettrices (identités de facturation)
    'billing_profile.create': ['Entité émettrice créée', G],
    'billing_profile.update': ['Entité émettrice modifiée', A],
    'billing_profile.default': ['Entité émettrice par défaut modifiée', A],
    'billing_profile.delete': ['Entité émettrice supprimée', R],

    // Archives
    'archive.bulk_delete': ['Archives supprimées en lot', R],
};

/**
 * Verbes génériques, désambiguïsés par l'entité.
 *
 * Certaines actions sont enregistrées sous un simple `CREATE` / `UPDATE` / `DELETE` : seule
 * l'entité dit de quoi il s'agit. « CREATE » seul n'apprend rien ; « Chapitre créé » si.
 */
const VERBE = {
    CREATE: ['créé', G], UPDATE: ['modifié', A], DELETE: ['supprimé', R],
};

/** entité technique → nom lisible, et son genre (pour accorder le participe). */
const ENTITY_LABEL = {
    Invoice: ['Facture', 'f'],
    MaterialSale: ['Vente de matériel', 'f'],
    InventoryItem: ['Article d\'inventaire', 'm'],
    GeneratedDocument: ['Document', 'm'],
    DocumentTemplate: ['Modèle de document', 'm'],
    DocumentCondition: ['Condition de document', 'f'],
    DocumentEquivalence: ['Équivalence de document', 'f'],
    ConditionField: ['Champ de document', 'm'],
    EmargementTemplate: ['Modèle d\'émargement', 'm'],
    AttendanceSheet: ['Feuille d\'émargement', 'f'],
    TrainingSession: ['Session de formation', 'f'],
    Quiz: ['Quiz', 'm'],
    Expense: ['Dépense', 'f'],
    RevenueExtra: ['Recette annexe', 'f'],
    AccountingSettings: ['Réglages comptables', 'm'],
    Partner: ['Partenaire', 'm'],
    PartnerContribution: ['Financement', 'm'],
    Opco: ['OPCO', 'm'],
    Organization: ['Organisme', 'm'],
    AccessProfile: ['Profil d\'accès', 'm'],
    BillingProfile: ['Entité émettrice', 'f'],
    Archive: ['Archive', 'f'],
    User: ['Membre', 'm'],
    quest_category: ['Catégorie (Pizza Quest)', 'f'],
    quest_chapter: ['Chapitre (Pizza Quest)', 'm'],
    quest_difficulty: ['Difficulté (Pizza Quest)', 'f'],
    quest_prerequisite: ['Prérequis (Pizza Quest)', 'm'],
    quest_question: ['Question (Pizza Quest)', 'f'],
};

/**
 * Libellé et ton d'une ligne d'audit.
 *
 * L'ordre compte : un code explicite prime toujours sur le verbe générique. Ce n'est qu'à
 * défaut qu'on compose « <Entité> <verbe accordé> », et en dernier recours qu'on rend le code
 * brut — pour qu'un code AJOUTÉ demain reste lisible tel quel plutôt que de disparaître.
 *
 * @returns {{ label: string, tone: string }}
 */
function auditLabel(action, entity) {
    const exact = ACTION_LABEL[action];
    if (exact) return { label: exact[0], tone: exact[1] };

    const v = VERBE[action];
    if (v) {
        const [nomEntite, genre] = ENTITY_LABEL[entity] || [entity || 'Élément', 'm'];
        const [participe, ton] = v;
        // Accord du participe au féminin : « créé » → « créée ».
        const accorde = genre === 'f' ? `${participe}e` : participe;
        return { label: `${nomEntite} ${accorde}`, tone: ton };
    }

    return { label: action, tone: N };
}

/** Nom lisible d'une entité, pour la colonne de droite. Rend l'entité brute si inconnue. */
function entityLabel(entity) {
    if (!entity) return '';
    const e = ENTITY_LABEL[entity];
    return e ? e[0] : entity;
}

export { auditLabel, entityLabel, ACTION_LABEL, ENTITY_LABEL };
