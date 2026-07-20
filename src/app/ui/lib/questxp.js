/**
 * XP de Pizza Quest, calculé À PARTIR DES QUESTIONS.
 *
 * Historiquement l'XP valait « étoiles × 10 » : un chapitre de 3 questions faciles rapportait
 * autant qu'un chapitre de 12 questions difficiles. Depuis que l'organisme fixe l'XP de chaque
 * question (Configuration → Pizza Quest), c'est le contenu qui doit décider — sinon régler une
 * question à 50 XP n'aurait aucun effet en jeu.
 *
 * On NE STOCKE PAS l'XP : la progression enregistrée reste « étoiles par chapitre », inchangée.
 * L'XP se recalcule à l'affichage à partir du chapitre et de ses étoiles. Deux conséquences
 * assumées : retarifer une question mettra à jour l'XP déjà acquis (cohérent — le barème est
 * celui de l'organisme, pas un solde bancaire), et aucune migration n'est nécessaire.
 */

/**
 * XP d'une question : sa valeur propre, sinon le socle. Même règle que côté serveur.
 *
 * `null` est traité comme ABSENT et non comme zéro — c'est la valeur que porte en base une
 * question qui s'en remet à sa difficulté. Un simple `Number(q.xp)` la ramènerait à 0
 * (Number(null) === 0) et la question ne rapporterait plus rien.
 */
export const XP_DEFAUT = 10;
export const xpOfQuestion = (q) => {
  const raw = q == null ? null : q.xp;
  if (raw === null || raw === undefined || raw === "") return XP_DEFAUT;
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 ? v : XP_DEFAUT;
};

/** XP maximal d'un chapitre = somme de ses questions (sans-faute à 3 étoiles). */
export function chapterXpMax(chapter) {
  const qs = (chapter && chapter.questions) || [];
  return qs.reduce((s, q) => s + xpOfQuestion(q), 0);
}

/**
 * XP réellement acquis sur un chapitre, proportionnel aux étoiles (0 à 3).
 * Le barème passe par les étoiles et non par le nombre de bonnes réponses pour rester
 * cohérent avec ce qui est ENREGISTRÉ : seules les étoiles le sont, et un rechargement de
 * page doit afficher le même total.
 */
export function chapterXpEarned(chapter, stars) {
  const s = Math.max(0, Math.min(3, Number(stars) || 0));
  if (!s) return 0;
  return Math.round(chapterXpMax(chapter) * (s / 3));
}

/**
 * Total d'un monde. `prog` = { [indexChapitre]: étoiles }.
 * Un chapitre dont on n'a plus le contenu (banque modifiée, index disparu) retombe sur
 * l'ancien barème étoiles × 10 : mieux vaut un total légèrement daté qu'un XP qui s'évapore.
 */
export function worldXp(chapters = [], prog = {}) {
  let total = 0;
  for (const [key, stars] of Object.entries(prog || {})) {
    const ch = chapters[Number(key)];
    total += ch ? chapterXpEarned(ch, stars) : (Number(stars) || 0) * 10;
  }
  return total;
}
