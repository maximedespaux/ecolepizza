import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const SCORE: Record<string, [string, string]> = {
  VERT: ["g", "Complet"], ORANGE: ["a", "À compléter"], ROUGE: ["r", "Incomplet"],
};

export default async function SuiviPage() {
  const organizationId = "org-ecole-pizza";
  const enrollments = await prisma.enrollment.findMany({
    where: { session: { organizationId } },
    include: { learner: true, session: { include: { program: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <div className="pagehead">
        <div><div className="eyebrow">Conformité</div><h1>Suivi Qualiopi</h1>
          <p className="lead">État de complétude des dossiers. Score de conformité : vert (complet), orange (non bloquant), rouge (pièces obligatoires manquantes).</p></div>
      </div>
      {enrollments.length === 0 ? (
        <div className="empty"><div className="big">▤</div><h3>Aucun dossier à suivre</h3></div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table>
            <thead><tr><th>Stagiaire</th><th>Formation</th><th>Session</th><th>Étape CRM</th><th>Conformité</th></tr></thead>
            <tbody>
              {enrollments.map((e) => {
                const [cls, lab] = SCORE[e.conformite] ?? ["n", e.conformite];
                return (
                  <tr key={e.id}>
                    <td><b>{e.learner.nom} {e.learner.prenom}</b></td>
                    <td>{e.session.program.titre}</td>
                    <td className="mono">{e.session.annee} · SEM {e.session.semaine}</td>
                    <td><span className="badge n">{e.crmStage}</span></td>
                    <td><span className={"badge " + cls}>{lab}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
