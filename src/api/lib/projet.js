/**
 * LE PROJET DU STAGIAIRE, CÔTÉ SERVEUR — ce qui part aux partenaires, et comment le lire.
 *
 * « Votre projet » est passé de six cases à une trentaine le 2026-09-22 (migrations 172 et 173) :
 * nature du projet, type d'activité, équipement, avancement. Trois lecteurs côté serveur avaient
 * chacun leur copie de la liste — l'export des partenaires (la phrase), le bandeau de la fiche
 * incomplète (un projet est-il renseigné ?) et la liste des stagiaires (le même repère). Trois copies
 * de vingt colonnes auraient fini par diverger : elles vivent ici. (Les libellés d'ÉCRAN, eux, vivent
 * dans src/app/ui/lib/projet.js ; un test vérifie que les deux côtés connaissent les mêmes cases.)
 *
 * CE QUI PART AUX PARTENAIRES, ET CE QUI N'Y PART PAS. Le stagiaire consent à transmettre « la
 * nature de mon projet » (lib/consentements.js). La nature du projet, le type d'activité et
 * l'équipement en sont. L'AVANCEMENT — local trouvé, financement obtenu, ouverture prochaine,
 * accompagnement souhaité — et l'intérêt pour une formation n'en sont pas : ce sont des signaux
 * commerciaux qu'on ne lui a pas annoncés, et « financement obtenu » dirait à un vendeur ce que le
 * solde CPF, exclu du catalogue, lui aurait dit. Ils restent à l'école — fiche, conditions de
 * documents — et l'export ne les LIT même pas : une donnée qu'on ne charge pas ne peut pas partir
 * par erreur.
 */

/* La phrase envoyée aux partenaires, dans son ordre. `migration` : la colonne n'existe qu'après
   elle, et se lit donc de façon tolérante (NULL tant qu'elle n'est pas jouée). */
const PHRASE_PROJET = [
    { c: 'project_creation', mot: 'création' },
    { c: 'project_takeover', mot: 'reprise' },
    // Le type d'activité (173).
    { c: 'project_dine_in', mot: 'pizzeria sur place', migration: 173 },
    { c: 'project_takeaway', mot: 'à emporter / livraison', migration: 173 },
    { c: 'project_by_slice', mot: 'pizza à la part', migration: 173 },
    { c: 'project_vending', mot: 'distributeur automatique', migration: 173 },
    { c: 'project_catering', mot: 'traiteur / événementiel', migration: 173 },
    { c: 'project_add_on', mot: 'pizza en complément d\'un commerce', migration: 173 },
    // L'équipement.
    { c: 'project_oven', mot: 'four' },
    { c: 'project_truck', mot: 'camion' },
    { c: 'project_kneader', mot: 'pétrin', migration: 173 },
    { c: 'project_sheeter', mot: 'laminoir / façonneuse', migration: 173 },
    { c: 'project_fridge_counter', mot: 'saladette / vitrine réfrigérée', migration: 173 },
    { c: 'project_job', mot: 'recherche de poste' },
    { c: 'project_improvement', mot: 'perfectionnement', migration: 158 },
];

/* LE FOUR, PRÉCISÉ : son type (172) et s'il est déjà acheté (173) — « four (bois, gaz, déjà
   acheté) » plutôt que « four ». C'est la première question d'un fabricant de fours. */
const PRECISIONS_FOUR = [
    { c: 'project_oven_wood', mot: 'bois', migration: 172 },
    { c: 'project_oven_electric', mot: 'électrique', migration: 172 },
    { c: 'project_oven_gas', mot: 'gaz', migration: 172 },
    { c: 'project_oven_owned', mot: 'déjà acheté', migration: 173 },
];

const coche = (v) => Number(v) === 1;

/** La phrase du projet pour un stagiaire : « création, pizza à la part, four (bois, gaz) ». */
function phraseProjet(l) {
    return PHRASE_PROJET.filter(({ c }) => coche(l[c])).map(({ c, mot }) => {
        if (c !== 'project_oven') return mot;
        const precisions = PRECISIONS_FOUR.filter(({ c: p }) => coche(l[p])).map((p) => p.mot);
        return precisions.length ? `four (${precisions.join(', ')})` : mot;
    }).join(', ');
}

/** Toutes les colonnes que lit la phrase — et elles seules. */
const COLONNES_PHRASE = [...PHRASE_PROJET, ...PRECISIONS_FOUR].map((x) => x.c);
const TARDIVES = new Set([...PHRASE_PROJET, ...PRECISIONS_FOUR].filter((x) => x.migration).map((x) => x.c));

/**
 * La liste SELECT de ces colonnes, TOLÉRANTE : une colonne que la table ne porte pas encore est lue
 * NULL, et la requête ne tombe pas. UNE introspection pour toutes, et non une par colonne comme
 * `colonneOuNull` : la liste des stagiaires la paie à chaque chargement. Sans introspection
 * possible, on s'en tient aux colonnes d'origine — les seules dont on soit sûr. Une réponse VIDE
 * compte comme telle : la table existe (on la lit juste après), c'est qu'on ne la voit pas — et la
 * croire sans colonne lirait NULL jusqu'à « création ».
 */
async function colonnesProjetSql(conn, prefixe = 'l.') {
    let presentes = null;
    try {
        const [cols] = await conn.query(
            `SELECT column_name AS c FROM information_schema.columns
              WHERE table_schema = DATABASE() AND table_name = 'learner'`);
        if (cols.length) presentes = new Set(cols.map((r) => r.c));
    } catch { /* introspection impossible : les colonnes d'origine */ }
    return COLONNES_PHRASE.map((c) => {
        const la = presentes ? presentes.has(c) : !TARDIVES.has(c);
        return la ? `${prefixe}${c}` : `NULL AS ${c}`;
    }).join(', ');
}

module.exports = { PHRASE_PROJET, PRECISIONS_FOUR, COLONNES_PHRASE, phraseProjet, colonnesProjetSql };
