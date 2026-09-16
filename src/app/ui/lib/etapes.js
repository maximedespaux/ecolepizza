/**
 * L'ÉTAT D'UNE ÉTAPE DE PARCOURS — une seule définition, et voici pourquoi elle a son fichier.
 *
 * ELLE A VÉCU À DEUX ENDROITS, ET A FINI PAR DIRE DEUX CHOSES. `components/Roadmap.jsx` en
 * portait la version de référence ; `pages/Suivi.jsx` en gardait une copie, annoncée en
 * commentaire comme « identique à Roadmap.stepState ». Elle ne l'était plus : le cas des pièces
 * justificatives a été ajouté à l'une et jamais à l'autre.
 *
 * CE QUE ÇA DONNAIT À L'ÉCRAN, mesuré en production le 2026-09-15 : le bandeau « Ce qui
 * manque » réclamait quatre pièces d'identité et quatre justificatifs, et le détail du dossier,
 * quinze pixels plus bas, affichait « Pièce d'identité — Terminé ». Le même écran, les mêmes
 * données, deux réponses.
 *
 * POURQUOI UN FICHIER À PART plutôt qu'un export depuis le composant. Une règle de DONNÉES
 * n'appartient pas à un composant d'affichage : tant qu'elle y vit, la copier ailleurs paraît
 * raisonnable — on ne va pas importer un composant pour compter des manques. Ici, il n'y a plus
 * d'excuse pour en écrire une seconde. Et le fichier est du JavaScript pur, sans JSX, donc les
 * tests de `src/api/test` peuvent l'importer et l'ÉPROUVER — ce qu'une fonction enfermée dans un
 * `.jsx` ne permettait pas. Le test qui existait ne pouvait que lire le source à la recherche
 * d'un motif ; il l'a trouvé, dans le seul fichier où il regardait.
 */

/**
 * @param {{status?: string, stagiaireSign?: boolean, piece?: boolean, pieceStatus?: string,
 *          remise?: boolean, remiseStatus?: string}} doc
 * @returns {"todo"|"progress"|"done"|"skip"} — « skip » = hors décompte (remise sans objet).
 */
export function stepState(doc) {
    /* UNE PIÈCE N'A PAS DE DOCUMENT GÉNÉRÉ : son état vient de son DÉPÔT, pas d'un `status` —
       lequel reste « A_FAIRE » à vie, ce qui est correct et n'a rien à voir avec elle. Sans ce
       cas, une carte d'identité validée tombait dans la règle générale et passait pour à faire.
       Refusée ⇒ « à faire » : il y a bien quelque chose à refaire, et le motif se lit dans la
       carte des pièces du dossier, pas ici. */
    if (doc.piece) {
        if (doc.pieceStatus === "VALIDEE") return "done";
        if (doc.pieceStatus === "DEPOSEE") return "progress";
        return "todo";
    }
    /* UNE REMISE NON PLUS N'A PAS DE DOCUMENT GÉNÉRÉ, et pour la même raison que la pièce —
       son état vient de la remise. Mais la frontière est ailleurs, et c'est tout le propos de
       la migration 160 : DÉPOSER N'EST PAS REMETTRE. Un fichier déposé que personne n'a
       confirmé est « en cours », jamais « terminé » ; le compter comme fait ferait monter le
       score de conformité du dossier sur un document que le stagiaire n'a peut-être jamais
       ouvert. Seul son accusé de réception termine l'étape. */
    if (doc.remise) {
        /* « SANS OBJET » (migration 161) SORT DU DÉCOMPTE, il ne le remplit pas. La compter comme
           « done » gonflerait le score de conformité d'un dossier avec une étape que personne
           n'a faite ; la compter comme due l'empêcherait d'atteindre cent pour cent à jamais.
           D'où un QUATRIÈME état, que les appelants doivent écarter des DEUX côtés de la
           fraction — c'est la seule valeur de retour qui ne soit pas un avancement. */
        if (doc.sansObjet) return "skip";
        if (doc.remiseStatus === "RECUE") return "done";
        if (doc.remiseStatus === "REMISE") return "progress";
        return "todo";
    }
    if (doc.status === "SIGNE") return "done";
    if (doc.stagiaireSign) {
        return ["ENVOYE", "CONSULTE", "GENERE"].includes(doc.status) ? "progress" : "todo";
    }
    // Document non signable : considéré terminé dès qu'il est généré/envoyé.
    return ["GENERE", "ENVOYE", "CONSULTE"].includes(doc.status) ? "done" : "todo";
}

/**
 * CE QUI MANQUE, AGRÉGÉ PAR TYPE **ET PAR FORMATION**.
 *
 * POURQUOI PAS PAR TYPE SEUL, ce qui paraît évident. Deux formations ont chacune leur
 * « Évaluation Formative du Mercredi » — des QCM DIFFÉRENTS, donc deux `type` distincts, mais
 * le MÊME libellé à l'écran. Le bandeau affichait donc « 4 Évaluation Formative du Mercredi »
 * puis, six cartes plus loin, « 1 Évaluation Formative du Mercredi » : rigoureusement
 * identiques, impossibles à départager. Relevé en production le 2026-09-15 — trois libellés en
 * double sur douze cartes.
 *
 * ET DANS L'AUTRE SENS : un même `type` peut traverser DEUX formations. La feuille d'émargement
 * est la même pour tout le monde ; une carte unique ne pourrait donc porter aucune couleur
 * juste. Découper par formation règle les deux cas d'un coup — chaque carte porte exactement
 * une formation, donc exactement une couleur, et le filtre au clic devient précis.
 *
 * @param {Array} dossiers lignes de `/api/suivi`
 * @returns {Array<{cle:string, type:string, code:string|null, label:string, n:number}>}
 */
export function manquesParFormation(dossiers) {
    const m = new Map();
    for (const d of dossiers || []) {
        for (const doc of (d.documents || [])) {
            /* « skip » AUSSI : une remise sans objet n'est pas un manque. L'oublier ici ferait
               réclamer au bandeau un document que l'école a explicitement écarté. */
            if (["done", "skip"].includes(stepState(doc))) continue;
            const cle = `${doc.type}|${d.program_code || ""}`;
            if (!m.has(cle)) m.set(cle, { cle, type: doc.type, code: d.program_code || null, label: doc.label, n: 0 });
            m.get(cle).n++;
        }
    }
    /* Le plus nombreux d'abord — c'est par là qu'on commence. À nombre égal, on regroupe par
       formation : les couleurs se suivent au lieu de s'alterner. */
    return [...m.values()].sort((a, b) => b.n - a.n
        || (a.code || "").localeCompare(b.code || "")
        || a.label.localeCompare(b.label));
}

/** Les dossiers concernés par une carte — même découpage que ci-dessus : type ET formation. */
export function dossiersDuManque(dossiers, manque) {
    if (!manque) return dossiers;
    return (dossiers || []).filter((d) => (d.program_code || "") === (manque.code || "")
        && (d.documents || []).some((doc) => doc.type === manque.type && stepState(doc) !== "done"));
}
