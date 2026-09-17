/**
 * L'ORDRE DES QCM D'UNE FORMATION : celui des jours, comme le déroulé de la semaine.
 *
 * Le test de positionnement (J-7) d'abord, puis l'évaluation du mardi (J2), du mercredi (J3)… Un QCM
 * sans jour passe à la fin, et le titre départage. À égalité complète, l'ordre reçu est gardé (le
 * tri est stable) : le serveur met le QCM actif avant son ancienne version.
 *
 * UNE SEULE RÈGLE POUR DEUX ÉCRANS. Les Modèles de QCM rangeaient déjà ainsi ; les Résultats QCM
 * rangeaient au nombre de réponses, puis au titre — en RS7404, le 2026-09-17 : « Jeudi, Mardi,
 * Mercredi, Test de positionnement », la semaine à l'envers. Recopier le tri aurait fait deux
 * règles, qui divergent à la première retouche.
 *
 * LE JOUR QUI S'APPLIQUE dans le groupe : celui de SA formation pour un QCM d'une seule formation
 * (depuis la migration 163, chaque formation peut avoir le sien), sinon celui du QCM.
 */
export const jourAffiche = (q) => (q.formations && q.formations.length === 1 ? q.formations[0].jour : q.day);

/** Comparateur pour `Array.prototype.sort` : jour croissant, sans jour à la fin, puis titre. */
export const parJour = (a, b) => (jourAffiche(a) ?? 99) - (jourAffiche(b) ?? 99) || a.title.localeCompare(b.title);
