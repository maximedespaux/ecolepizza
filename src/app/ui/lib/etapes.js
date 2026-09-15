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
 * @param {{status?: string, stagiaireSign?: boolean, piece?: boolean, pieceStatus?: string}} doc
 * @returns {"todo"|"progress"|"done"}
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
    if (doc.status === "SIGNE") return "done";
    if (doc.stagiaireSign) {
        return ["ENVOYE", "CONSULTE", "GENERE"].includes(doc.status) ? "progress" : "todo";
    }
    // Document non signable : considéré terminé dès qu'il est généré/envoyé.
    return ["GENERE", "ENVOYE", "CONSULTE"].includes(doc.status) ? "done" : "todo";
}
