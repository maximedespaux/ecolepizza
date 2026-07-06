import { prisma } from "@/lib/db";
import Link from "next/link";
import DashboardGreeting from "@/components/DashboardGreeting";
import AnimatedNumber from "@/components/ui/AnimatedNumber";
import { CRM_STAGES, CRM_LABEL, colorOf, frDate, sessionRange } from "@/components/calendrier/shared";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  "enrollment.create": "Inscription ajoutée", "enrollment.update": "Dossier mis à jour", "enrollment.delete": "Inscription retirée",
  "session.create": "Session planifiée", "session.update": "Session modifiée", "session.delete": "Session supprimée",
  "documents.generate": "Documents générés", "document.generate": "Documents générés", "learner.create": "Stagiaire ajouté",
  "learner.update": "Stagiaire modifié", "learner.delete": "Stagiaire supprimé", "program.update": "Formation modifiée",
};

function ago(d: Date): string {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  const m = Math.floor(s / 60); if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60); if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}

const RED_GRAD = "linear-gradient(135deg,var(--ember1),var(--ember2))";

export default async function DashboardPage() {
  const organizationId = "org-ecole-pizza";
  const [org, nbStagiaires, nbFormations, nbSessions, , nbInscriptions, upcoming, pipeline, recent] =
    await Promise.all([
      prisma.organization.findUnique({ where: { id: organizationId } }),
      prisma.learner.count({ where: { organizationId } }),
      prisma.trainingProgram.count({ where: { organizationId } }),
      prisma.trainingSession.count({ where: { organizationId } }),
      prisma.partner.count({ where: { organizationId } }),
      prisma.enrollment.count({ where: { session: { organizationId } } }),
      prisma.trainingSession.findMany({
        where: { organizationId }, include: { program: true, _count: { select: { enrollments: true } } },
        orderBy: [{ annee: "asc" }, { semaine: "asc" }], take: 5,
      }),
      prisma.enrollment.groupBy({ by: ["crmStage"], where: { session: { organizationId } }, _count: { _all: true } }),
      prisma.auditLog.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 6 }),
    ]);

  const pipeMap: Record<string, number> = {};
  for (const p of pipeline) pipeMap[p.crmStage] = p._count._all;
  const pipeStages = CRM_STAGES.filter((s) => (pipeMap[s.value] ?? 0) > 0);
  const pipeMax = Math.max(1, ...pipeStages.map((s) => pipeMap[s.value] ?? 0));

  return (
    <div className="space-y-5 font-sans">
      {/* Hero marine */}
      <div className="relative overflow-hidden rounded-3xl p-7 md:p-8 text-white shadow-xl bg-[linear-gradient(135deg,var(--navy),var(--navy-dark))]">
        <div className="pointer-events-none absolute -top-24 -right-16 h-72 w-72 rounded-full blur-3xl bg-[radial-gradient(circle,rgba(220,62,55,.4),transparent_70%)]" />
        <div className="pointer-events-none absolute -bottom-24 left-10 h-60 w-60 rounded-full blur-3xl bg-[radial-gradient(circle,rgba(240,86,79,.22),transparent_70%)]" />
        <div className="relative">
          <div className="text-[11px] font-extrabold uppercase tracking-[.18em] text-white/70">Secrétariat · {org?.sigle}</div>
          <div className="[&>h1]:font-display [&>h1]:text-3xl [&>h1]:md:text-4xl [&>h1]:font-extrabold [&>h1]:mt-2">
            <DashboardGreeting />
          </div>
          <p className="text-white/80 text-sm mt-2 max-w-2xl">{org?.raisonSociale} — SIRET {org?.siret} · NDA {org?.nda} · Certifié Qualiopi.</p>
          <div className="flex flex-wrap gap-2 mt-4">
            <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">✓ Qualiopi actif</span>
            <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">{nbInscriptions} inscription(s)</span>
            <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">{nbSessions} session(s)</span>
          </div>
          <Link href="/documents" className="mt-5 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold text-white shadow-lg transition hover:-translate-y-0.5" style={{ background: RED_GRAD }}>
            ⎙ Générer des documents
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Stagiaires" val={nbStagiaires} href="/stagiaires" />
        <Kpi label="Inscriptions" val={nbInscriptions} href="/calendrier" />
        <Kpi label="Sessions" val={nbSessions} href="/calendrier" />
        <Kpi label="Formations" val={nbFormations} href="/formations" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Colonne gauche */}
        <div className="space-y-4">
          <Card title="Prochaines sessions" moreHref="/calendrier" moreLabel="Calendrier →">
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted">Aucune session planifiée.</p>
            ) : upcoming.map((s) => {
              const r = sessionRange(s);
              return (
                <Link key={s.id} href="/calendrier" className="flex items-center gap-3 py-2.5 border-b border-line-soft last:border-0 transition hover:translate-x-0.5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white text-[10px] font-bold" style={{ background: colorOf(s.program.code) }}>{s.program.code}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-ink truncate">{s.program.titre}</span>
                    <span className="block text-xs text-muted">{frDate(r.start)} · Sem. {s.semaine} · {s._count.enrollments} inscrit(s)</span>
                  </span>
                </Link>
              );
            })}
          </Card>

          <Card title="Activité récente">
            {recent.length === 0 ? (
              <p className="text-sm text-muted">Aucune activité pour l&apos;instant.</p>
            ) : recent.map((a) => (
              <div key={a.id} className="flex items-center gap-2.5 py-2 border-b border-line-soft last:border-0 text-[13px]">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: RED_GRAD }} />
                <span className="flex-1 text-ink">{ACTION_LABEL[a.action] ?? a.action}</span>
                <span className="text-xs text-dim">{ago(a.createdAt)}</span>
              </div>
            ))}
          </Card>
        </div>

        {/* Colonne droite */}
        <div className="space-y-4">
          <Card title="Pipeline commercial" moreHref="/calendrier" moreLabel="Détail →">
            {pipeStages.length === 0 ? (
              <p className="text-sm text-muted">Aucune inscription à suivre.</p>
            ) : pipeStages.map((s) => {
              const n = pipeMap[s.value] ?? 0;
              return (
                <div key={s.value} className="flex items-center gap-3 mb-2.5 last:mb-0">
                  <span className="text-xs font-semibold text-muted w-28 shrink-0">{CRM_LABEL[s.value]}</span>
                  <div className="flex-1 h-2 rounded-full bg-surface-3 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(n / pipeMax) * 100}%`, background: RED_GRAD }} />
                  </div>
                  <b className="text-sm text-navy w-5 text-right">{n}</b>
                </div>
              );
            })}
          </Card>

          <Card title="Accès rapides">
            <div className="grid gap-2.5">
              {[
                ["/stagiaires", "☺ Ajouter un stagiaire"],
                ["/calendrier", "🗓 Planifier une session"],
                ["/documents", "⎙ Générer un devis / contrat"],
                ["/partenaires", "🤝 Gérer les partenaires"],
                ["/suivi", "▤ Vérifier la conformité Qualiopi"],
              ].map(([href, label]) => (
                <Link key={href} href={href} className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-sm font-medium text-ink transition hover:border-navy hover:bg-surface">
                  {label}
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, val, href }: { label: string; val: number; href: string }) {
  return (
    <Link href={href} className="group rounded-2xl border border-line bg-surface p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-navy">
      <div className="text-[13px] text-muted">{label}</div>
      <div className="mt-2 font-display text-3xl font-extrabold text-navy tabular-nums transition-colors group-hover:text-ember">
        <AnimatedNumber value={val} />
      </div>
      <div className="mt-1.5 text-xs font-semibold text-ember opacity-0 transition group-hover:opacity-100">Voir →</div>
    </Link>
  );
}

function Card({ title, moreHref, moreLabel, children }: { title: string; moreHref?: string; moreLabel?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-base font-bold text-navy">{title}</h3>
        {moreHref && <Link href={moreHref} className="text-xs font-semibold text-ember hover:underline">{moreLabel}</Link>}
      </div>
      {children}
    </div>
  );
}
