/**
 * LE NOM DU RÉFÉRENT D'UNE ENTREPRISE, tel qu'on le lit (migration 174).
 *
 * Du JavaScript pur, sans JSX : les tests de `src/api/test` l'importent. Le pendant serveur est
 * `nomReferent` dans src/api/lib/referentEntreprise.js — même règle.
 *
 * `representative_name` porte le NOM seul quand le prénom est saisi à part, et le nom COMPLET sur
 * les fiches d'avant la 174 (« JEAN DUPONT » dans un seul champ). Les deux se lisent donc ensemble :
 * « Jean DUPONT », ou « JEAN DUPONT » tel qu'il avait été tapé.
 */
export const nomReferent = (c) => [c?.representative_first_name, c?.representative_name]
  .map((x) => String(x || "").trim()).filter(Boolean).join(" ");

/** « M. Jean DUPONT » : civilité comprise, pour une ligne de liste ou de fiche. */
export const referentAvecCivilite = (c) => [c?.representative_civ, nomReferent(c)].filter(Boolean).join(" ");

/** Ce que le serveur n'a pu garder du référent (`ignores`, migration 174 non jouée), en toutes lettres. */
export function messageReferentPerdu(ignores) {
  const i = ignores || [];
  if (i.includes("representative_learner_id")) return "le lien vers le stagiaire référent : la migration 174 n'est pas jouée.";
  if (i.includes("representative_first_name")) return "le prénom du référent : la migration 174 n'est pas jouée.";
  return null;
}
