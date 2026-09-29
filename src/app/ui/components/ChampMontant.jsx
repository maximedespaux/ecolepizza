import { useEffect, useState } from "react";
import { montantEnSaisie, valeurTransmise, texteAJour } from "../lib/montantSaisi.js";

/**
 * UN CHAMP D'ARGENT QUI GARDE CE QU'ON TAPE : « 12,5 » à l'écran, « 12.5 » pour le parent.
 *
 * Pour les écrans qui CALCULENT avec la valeur à chaque frappe — le coût d'une fiche technique :
 * leur état garde des nombres écrits avec un point, que tous leurs calculs lisent par `Number()`.
 * Leur donner la saisie brute (« 12,5 ») aurait tout faussé ; les laisser en `type="number"`
 * faisait dépendre la virgule de la langue de l'APPAREIL — là où elle n'est pas le séparateur
 * décimal, le champ numérique rend « 12,5 » VIDE, donc un prix de 0 €, sans un mot.
 *
 * Le texte vit ICI ; le parent reçoit la valeur LUE (`valeurTransmise`), ou "" pour un champ vidé,
 * dans la forme d'un événement (`e.target.value`) : les gestionnaires existants s'y branchent tels
 * quels. Une saisie ILLISIBLE n'est pas transmise — le parent garde la dernière valeur lisible — et
 * le champ s'encadre en rouge en disant comment l'écrire. Une valeur changée par ailleurs remplace
 * le texte, sauf s'il la dit déjà (`texteAJour`).
 */
export default function ChampMontant({ value, onChange, exemple = "12,50", className = "inp", style, ...props }) {
  const [texte, setTexte] = useState(() => montantEnSaisie(value));
  useEffect(() => { setTexte((t) => texteAJour(t, value)); }, [value]);
  const illisible = valeurTransmise(texte) === null;
  return (
    <input className={className} inputMode="decimal" autoComplete="off" value={texte}
      aria-invalid={illisible || undefined}
      title={illisible ? `Illisible : écrivez-le par exemple ${exemple}.` : undefined}
      style={illisible ? { ...style, borderColor: "var(--ember1)" } : style}
      onChange={(e) => {
        setTexte(e.target.value);
        const v = valeurTransmise(e.target.value);
        if (v !== null) onChange({ target: { value: v } });
      }}
      {...props} />
  );
}
