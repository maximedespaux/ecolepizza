import { colorOf } from "../lib/format.js";

/**
 * L'EN-TÊTE D'UNE SESSION DANS UNE SEMAINE — badge de formation, intitulé, effectif.
 *
 * POURQUOI UN COMPOSANT POUR TROIS LIGNES. Parce que ces trois lignes ont menti en production.
 * Notation recevait des sessions passées par `grouperParSemaine`, donc NORMALISÉES par
 * `lib/sessions.js` — qui expose l'intitulé sous `titre`. La carte, écrite à la main, lisait
 * `session.title` : `undefined`, et le repli « Session » s'affichait à la place du nom de la
 * formation. Relevé le 2026-09-17 : « NIV1H Session 1 inscrit(s) », « RS7404 Session 4
 * inscrit(s) ». Le défaut datait de la création de l'écran, et ne se voyait pas parce que le
 * repli avait l'air voulu.
 *
 * C'est exactement le problème que la lib existe pour résoudre — deux API, deux orthographes —
 * resurgi dans le balisage. Le Pipeline allait recopier la même carte, donc le même défaut.
 * L'en-tête lit la forme normalisée ICI, une fois ; les écrans ne la relisent plus.
 *
 * @param {{ session: { code: string|null, titre: string|null, inscrits: number } }} props
 *        une session telle que la rend `grouperParSemaine`, jamais une ligne brute d'API.
 */
export default function EnTeteSession({ session }) {
  return (
    <>
      {session.code && (
        <span className="badge n mono" style={{ background: colorOf(session.code), color: "#fff", borderColor: "transparent" }}>
          {session.code}
        </span>
      )}
      {" "}{session.titre || "Session"}
      <span className="arch-count">{session.inscrits} inscrit(s)</span>
    </>
  );
}
