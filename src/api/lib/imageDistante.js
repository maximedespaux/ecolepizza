/**
 * L'ADRESSE D'UNE IMAGE HÉBERGÉE AILLEURS — ce qu'on accepte, et ce qu'on refuse.
 *
 * L'école illustre ses articles et ses partenaires avec des images qui vivent sur le site du
 * fournisseur. Coller un lien est le geste demandé : pas de fichier à téléverser, pas de stockage
 * à gérer, et l'image suit le catalogue du fournisseur quand il le met à jour.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FILTRE EMPÊCHE, ET POURQUOI IL N'EST PAS DÉCORATIF.
 *
 * La valeur atterrit dans un `src` d'image. Trois familles d'adresses n'y ont rien à faire :
 *
 *  · `javascript:` — les navigateurs actuels ne l'exécutent plus dans un `<img src>`, mais la même
 *    chaîne finit un jour dans un `<a href>` ou une feuille de style au gré d'une refonte. On ne
 *    laisse pas entrer en base une valeur dont l'innocuité dépend du contexte où on la relira.
 *
 *  · `data:` — une image entière encodée dans l'URL. Elle passerait le contrôle « ça commence par
 *    un protocole connu » tout en gonflant la colonne, et permettrait d'y loger n'importe quel
 *    contenu (SVG avec script compris) sans jamais quitter la base.
 *
 *  · `file:` et les adresses sans hôte — inutiles au mieux, et révélatrices de l'arborescence du
 *    serveur au pire.
 *
 * ON N'ACCEPTE DONC QUE `http:` ET `https:`, par LISTE BLANCHE. Une liste noire des schémas
 * dangereux serait toujours en retard d'un schéma.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * `http:` EST ACCEPTÉ MAIS SIGNALÉ. Une page servie en HTTPS bloque une image en HTTP (contenu
 * mixte) : elle ne s'affichera PAS en production, alors qu'elle marche très bien en local, où le
 * serveur de développement est en clair. Le refuser franchement serait excessif — beaucoup de
 * sites de fournisseurs traînent encore en HTTP — mais le laisser passer sans rien dire produirait
 * une image qui « marche chez moi » et manque en ligne, ce qui est le pire des deux.
 */

/** Longueur de la colonne en base. Tronquer sans le dire donnerait une URL cassée, silencieuse. */
const LONGUEUR_MAX = 500;

/**
 * Valide une adresse d'image. Rend `{ ok, valeur, avertissement }` ou `{ ok: false, message }`.
 * Une valeur vide est VALIDE et rend `null` : retirer une image est une opération légitime.
 */
function validerImage(brut) {
    if (brut === undefined) return { ok: true, valeur: undefined };   // champ non envoyé
    const v = String(brut ?? '').trim();
    if (!v) return { ok: true, valeur: null };                        // vidé volontairement

    if (v.length > LONGUEUR_MAX) {
        return {
            ok: false,
            message: `Adresse trop longue (${v.length} caractères, maximum ${LONGUEUR_MAX}). `
                + 'Elle serait tronquée et l\'image ne s\'afficherait pas.',
        };
    }

    let u;
    try { u = new URL(v); } catch {
        return {
            ok: false,
            message: 'Adresse invalide. Collez le lien complet de l\'image, en commençant par '
                + '« https:// ».',
        };
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return {
            ok: false,
            message: `Seules les adresses « http:// » et « https:// » sont acceptées `
                + `(reçu « ${u.protocol} »).`,
        };
    }
    if (!u.hostname) {
        return { ok: false, message: 'Adresse sans nom de domaine.' };
    }
    return {
        ok: true,
        valeur: v,
        // Signalé, pas refusé : l'image marchera en local et manquera en ligne.
        avertissement: u.protocol === 'http:'
            ? 'Cette adresse est en « http:// ». Une page sécurisée bloque les images non '
                + 'sécurisées : elle risque de ne pas s\'afficher en ligne. Préférez « https:// » '
                + 'si le site du fournisseur le propose.'
            : null,
    };
}

module.exports = { validerImage, LONGUEUR_MAX };
