/**
 * LES DOSSIERS QUI RESTENT À SUIVRE — ce que montrent le tableau de bord et le suivi Qualiopi.
 *
 * Du JavaScript pur, sans JSX, pour la raison écrite en tête de `etapes.js` : les tests de
 * `src/api/test` peuvent l'importer et l'ÉPROUVER, ce qu'une règle enfermée dans une page ne
 * permet pas — on ne pourrait qu'y chercher un motif dans le source.
 *
 * DEUX DEMANDES DU 2026-09-21, UNE MÊME IDÉE : un dossier se quitte des yeux quand il est FINI,
 * pas quand sa session l'est.
 *   · Le tableau de bord ne gardait que les dossiers des sessions en cours ou à venir. Le jour où
 *     une session s'achevait, ses dossiers quittaient la carte, complets ou non — mesuré en
 *     production le jour même : 5 dossiers sur 10 d'une session terminée, tous entre 50 et 99 %,
 *     tous invisibles. Or c'est APRÈS la session qu'on finit un dossier : satisfaction, certificat.
 *   · Le suivi, à l'inverse, gardait sous les yeux les dossiers à 100 %, qui n'appellent plus aucun
 *     geste et noyaient ceux qui en appellent un.
 */

/** Combien de dossiers tient la carte « Derniers dossiers » — autant que l'activité à côté. */
export const DERNIERS_DOSSIERS = 6;

const pourcent = (x) => Number(x.percent) || 0;

/**
 * TABLEAU DE BORD — les dossiers à suivre et, parmi eux, ceux de la carte.
 *
 * Un dossier d'une session TERMINÉE reste à suivre s'il n'est pas à 100 % ET que le stagiaire a
 * franchi le POINT DE RUPTURE du parcours (`point_franchi`, calculé par le serveur avec la règle
 * même de l'émargement, cf. src/api/lib/pointDeRupture.js). Resté avant le point, c'est quelqu'un
 * qui n'est jamais venu : son dossier ne se complétera pas, et le montrer noierait les autres.
 *
 * UN DRAPEAU ABSENT NE GARDE RIEN (`=== true`) : une réponse sans lui — serveur d'avant, onglet
 * resté ouvert pendant une mise en ligne — retombe sur le comportement d'avant, où la session
 * terminée faisait sortir le dossier.
 *
 * UN PARCOURS VIDE N'A RIEN À FINIR. Zéro étape se lit « 0 % » (pourcentFait, côté serveur) et le
 * resterait à jamais : sans cette garde, le dossier d'une formation sans parcours ne quitterait
 * plus la carte.
 *
 * @param enr        lignes de GET /enrollments (session_id, percent, point_franchi, dates)
 * @param actives    Set des sessions à venir ou en cours
 * @param estPassee  (ligne) => sa session est-elle terminée ?
 * @returns {{ aSuivre: object[], derniers: object[] }} `derniers` : la carte, déjà coupée, chaque
 *          ligne marquée `echu` quand elle n'y est que parce qu'elle reste à finir.
 */
export function dossiersASuivre(enr, actives, estPassee) {
    const echu = (x) => !actives.has(x.session_id) && estPassee(x)
        && (Number(x.total) || 0) > 0 && pourcent(x) < 100 && x.point_franchi === true;
    const aSuivre = (enr || []).filter((x) => actives.has(x.session_id) || echu(x));
    /* L'ORDRE DIT CE QUI PRESSE, et il se fait AVANT la coupe : l'incomplet d'une session terminée
       (en retard), puis l'incomplet en cours, puis le complet. Coupée d'abord, la liste gardait les
       six plus récents — ceux d'une session qui démarre —, et le dossier à finir, plus ancien,
       sortait de la carte exactement comme avant. À rang égal, l'ordre reçu (le plus récent
       d'abord). */
    const rang = (x) => (echu(x) ? 0 : pourcent(x) < 100 ? 1 : 2);
    const derniers = aSuivre
        .map((x, i) => [x, i])
        .sort((a, b) => rang(a[0]) - rang(b[0]) || a[1] - b[1])
        .slice(0, DERNIERS_DOSSIERS)
        .map(([x]) => ({ ...x, echu: echu(x) }));
    return { aSuivre, derniers };
}

/**
 * LES DOSSIERS RANGÉS SOUS LEUR ENTREPRISE — la même règle pour le suivi et le tableau de bord.
 *
 * QUAND UNE ENTREPRISE INSCRIT SON MONDE, ses stagiaires ne se lisent pas un par un : elle a ses
 * propres documents à signer (convention, accord de prise en charge), et c'est vers SA fiche qu'il
 * faut aller. Éparpillés dans la liste, ils obligeaient à retrouver de tête qui venait d'où.
 *
 * L'ORDRE REÇU EST CONSERVÉ, et un groupe prend la place de son PREMIER membre : la liste reste
 * triée comme elle l'était (le plus pressé, ou le plus récent, devant). Le regrouper en fin de
 * liste ferait disparaître une entreprise arrivée ce matin sous des dossiers de la semaine passée.
 *
 * Le groupe ne porte ici QUE l'identité et les membres : le suivi y ajoute ses agrégats
 * (pourcentage, pire score, feuille de route), le tableau de bord n'en a pas besoin.
 *
 * @param liste  dossiers portant `company_id` / `company_name` (GET /enrollments, GET /suivi)
 * @returns [{ type: "solo", d } | { type: "company", company_id, company_name, members }]
 */
export function grouperParEntreprise(liste) {
    const parEntreprise = new Map();
    const out = [];
    for (const d of liste || []) {
        if (!d.company_id) { out.push({ type: "solo", d }); continue; }
        let g = parEntreprise.get(d.company_id);
        if (!g) {
            g = { type: "company", company_id: d.company_id, company_name: d.company_name || "Entreprise", members: [] };
            parEntreprise.set(d.company_id, g);
            out.push(g);
        }
        g.members.push(d);
    }
    return out;
}

/** Un dossier complet : toutes ses étapes faites — le « VERT » du serveur, 100 %. */
export const estComplet = (d) => !!d && d.score === "VERT";

/**
 * SUIVI QUALIOPI — la liste sans les dossiers complets, sauf à la demande.
 *
 * Un dossier complet quitte la liste et fait monter le compteur « complets », qui les réaffiche.
 * Dans un groupe d'entreprise, seuls les membres encore à finir restent (`membresVus`) ; le groupe
 * ne quitte la liste que complet. SON AGRÉGAT, LUI, NE BOUGE PAS : il est calculé sur TOUS les
 * membres, en amont. Le recalculer sur les seuls membres visibles ferait baisser le pourcentage
 * d'une entreprise à chaque dossier terminé — l'inverse de ce qui se passe.
 *
 * @param groupes       [{ type: "solo", d }] ou [{ type: "company", members, … }]
 * @param voirComplets  vrai quand on a demandé à les revoir
 */
export function sansLesComplets(groupes, voirComplets) {
    const garde = (d) => voirComplets || !estComplet(d);
    const out = [];
    for (const g of groupes || []) {
        if (g.type === "solo") { if (garde(g.d)) out.push(g); continue; }
        const membresVus = (g.members || []).filter(garde);
        if (membresVus.length) out.push({ ...g, membresVus, complets: g.members.length - membresVus.length });
    }
    return out;
}
