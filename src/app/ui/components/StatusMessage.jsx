/**
 * Message d'état sous un en-tête de page.
 *
 * status : { type: "success" | "error" | "info", message: string } | null
 *
 * `info` a été ajouté parce qu'il était DÉJÀ UTILISÉ (EntrepriseDetail affiche
 * « Chargement… » avec ce type) : le composant ne connaissait que « error » et « le reste »,
 * si bien qu'un chargement en cours s'affichait en vert, exactement comme une confirmation
 * de réussite. Un message neutre doit se lire comme neutre.
 */
function StatusMessage({ status }) {
  if (!status) return null;
  const type = status.type === "error" ? "err" : status.type === "info" ? "info" : "ok";
  const isError = type === "err";
  return (
    <div
      className={`status ${type}`}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
    >
      {status.message}
    </div>
  );
}

export default StatusMessage;
