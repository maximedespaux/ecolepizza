import { prisma } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  const organizationId = "org-ecole-pizza";
  const sessions = await prisma.trainingSession.findMany({
    where: { organizationId },
    include: { program: true, _count: { select: { enrollments: true } } },
    orderBy: [{ annee: "asc" }, { semaine: "asc" }],
  });

  const fr = (d: Date | null) => d ? new Date(d).toLocaleDateString("fr-FR", { timeZone: "UTC" }) : "—";

  return (
    <>
      <div className="pagehead">
        <div><div className="eyebrow">Secrétariat</div><h1>Sessions & planning</h1>
          <p className="lead">Sessions par année / semaine. Les dates sont calculées automatiquement depuis le numéro de semaine.</p></div>
        <Link className="btn primary" href="/formations">+ Planifier (via formation)</Link>
      </div>

      {sessions.length === 0 ? (
        <div className="empty"><div className="big">▦</div><h3>Aucune session</h3><p>Créez une session depuis une formation.</p></div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table>
            <thead><tr><th>Semaine</th><th>Formation</th><th>Dates</th><th>Stagiaires</th><th>Statut</th></tr></thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td className="mono">{s.annee} · SEM {s.semaine}</td>
                  <td><b>{s.program.titre}</b></td>
                  <td>{fr(s.dateDebut)} → {fr(s.dateFin)}</td>
                  <td>{s._count.enrollments}</td>
                  <td><span className="badge n">{s.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
