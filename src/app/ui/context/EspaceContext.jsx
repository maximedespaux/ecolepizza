import { createContext } from "react";

/**
 * ESPACE ACTIF — pour un compte qui a DEUX casquettes : un rôle du bureau (admin / formateur) ET
 * une fiche stagiaire (`has_learner`). `viewAs` dit lequel on affiche ("backoffice" | "stagiaire"),
 * `canBeStudent` dit si la bascule a lieu d'être.
 *
 * AUCUNE AUTORITÉ ici. Le serveur reste seul juge : les routes admin sont gardées PAR RÔLE, l'espace
 * stagiaire est servi PAR DONNÉE (la requête lit « mon » learner). Basculer change l'ÉCRAN, pas les
 * droits — un vrai stagiaire (rôle STAGIAIRE) n'est jamais éligible, et forcer l'UI admin ne donne
 * aucun accès puisque chaque appel admin est refusé côté serveur.
 */
export const EspaceContext = createContext({ viewAs: "backoffice", setViewAs: () => {}, canBeStudent: false });
