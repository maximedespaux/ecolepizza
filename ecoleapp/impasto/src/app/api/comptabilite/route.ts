// API — Comptabilité / Gestion (module A). Tableau de gestion, pas de compta légale.
// GET /api/comptabilite?annee=2026 → CA (inscriptions + matériel + extra),
// dépenses par poste (% du CA vs cible, couleur, conseil), marge et dividendes.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  EXPENSE_CATEGORIES, CATEGORY_LABELS, mergeTargets, statutFor, conseilFor,
  DEFAULT_DIVIDENDE_CIBLE, type ExpenseCategory,
} from "@/lib/compta/targets";

const ORG = "org-ecole-pizza";
const num = (v: unknown) => (v == null ? 0 : Number(v));

// Bornes [1er janv. année ; 1er janv. année+1[ pour filtrer par date.
const yearRange = (annee: number) => ({
  gte: new Date(Date.UTC(annee, 0, 1)),
  lt: new Date(Date.UTC(annee + 1, 0, 1)),
});

export async function GET(req: NextRequest) {
  const annee = Number(req.nextUrl.searchParams.get("annee")) || new Date().getFullYear();
  const range = yearRange(annee);

  const [enrollments, sales, extras, expenses, settings, sessionYears] = await Promise.all([
    prisma.enrollment.findMany({ where: { session: { organizationId: ORG, annee } }, select: { prix: true } }),
    prisma.materialSale.findMany({ where: { organizationId: ORG, date: range }, select: { montant: true, quantite: true } }),
    prisma.revenueExtra.findMany({ where: { organizationId: ORG, date: range }, orderBy: { date: "desc" } }),
    prisma.expense.findMany({ where: { organizationId: ORG, date: range }, orderBy: { date: "desc" } }),
    prisma.accountingSettings.findUnique({ where: { organizationId: ORG } }),
    prisma.trainingSession.findMany({ where: { organizationId: ORG }, select: { annee: true }, distinct: ["annee"] }),
  ]);

  // --- Chiffre d'affaires (3 sources, sans double-comptage) ---
  const caInscriptions = enrollments.reduce((s, e) => s + num(e.prix), 0);
  const caMateriel = sales.reduce((s, v) => s + num(v.montant) * v.quantite, 0);
  const caExtra = extras.reduce((s, r) => s + num(r.montant), 0);
  const ca = caInscriptions + caMateriel + caExtra;

  // --- Postes de dépense ---
  const targets = mergeTargets(settings?.targets as Record<string, unknown> | null);
  const totauxParPoste: Record<ExpenseCategory, number> = {
    MATIERES_PREMIERES: 0, SALAIRES: 0, LOYER: 0, MARKETING: 0, ENERGIE: 0, DIVERS: 0,
  };
  for (const e of expenses) totauxParPoste[e.categorie as ExpenseCategory] += num(e.montantHT);

  const postes = EXPENSE_CATEGORIES.map((cat) => {
    const total = totauxParPoste[cat];
    const pct = ca > 0 ? Math.round((total / ca) * 1000) / 10 : 0;
    const cible = targets[cat];
    const statut = statutFor(pct, cible);
    return { categorie: cat, label: CATEGORY_LABELS[cat], total, pct, cible, statut, conseil: conseilFor(cat, statut, pct, cible) };
  });

  const totalDepenses = postes.reduce((s, p) => s + p.total, 0);
  const marge = ca - totalDepenses;
  const margePct = ca > 0 ? Math.round((marge / ca) * 1000) / 10 : 0;
  const dividendeCible = num(settings?.dividendeCible) || DEFAULT_DIVIDENDE_CIBLE;

  // Dividendes — vue réaliste : on ne peut jamais distribuer plus que la marge.
  const dividendeVise = Math.max(0, Math.round(ca * (dividendeCible / 100))); // ambition
  const dividendePossible = Math.max(0, Math.round(marge));                    // marge disponible
  const dividendeRealiste = Math.min(dividendeVise, dividendePossible);        // ce qui est distribuable
  const partRealistePct = ca > 0 ? Math.round((dividendeRealiste / ca) * 1000) / 10 : 0;
  const dividendeStatut = marge <= 0 ? "impossible" : dividendePossible >= dividendeVise ? "atteignable" : "partiel";
  const dividendeMessage =
    marge <= 0
      ? "Aucune distribution possible : les dépenses dépassent le CA. Réduisez d'abord les postes en rouge."
      : dividendePossible >= dividendeVise
        ? `Objectif atteignable : la marge couvre les ${dividendeCible}% visés.`
        : `Distribution réaliste plafonnée par la marge (${dividendeRealiste.toLocaleString("fr-FR")} € sur ${dividendeVise.toLocaleString("fr-FR")} € visés).`;

  const annees = Array.from(new Set([annee, new Date().getFullYear(), ...sessionYears.map((s) => s.annee)])).sort((a, b) => b - a);

  return NextResponse.json({
    data: {
      annee,
      ca: { total: ca, inscriptions: caInscriptions, materiel: caMateriel, extra: caExtra },
      postes, totalDepenses,
      marge, margePct,
      dividendeCible, dividendeVise, dividendePossible, dividendeRealiste, partRealistePct, dividendeStatut, dividendeMessage,
      targets,
      depenses: expenses.map((e) => ({ ...e, montantHT: num(e.montantHT) })),
      revenus: extras.map((r) => ({ ...r, montant: num(r.montant) })),
      annees,
    },
  });
}
