// API — Comptabilité / Performance (sous-onglet). Récapitulatif annuel + comparaison N-1 :
// CA, nombre de stagiaires, ticket moyen, stagiaires moyens/session, marge, dépenses par poste.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { EXPENSE_CATEGORIES, CATEGORY_LABELS, type ExpenseCategory } from "@/lib/compta/targets";

const ORG = "org-ecole-pizza";
const num = (v: unknown) => (v == null ? 0 : Number(v));
const yearRange = (annee: number) => ({ gte: new Date(Date.UTC(annee, 0, 1)), lt: new Date(Date.UTC(annee + 1, 0, 1)) });

async function computeYear(annee: number) {
  const range = yearRange(annee);
  const [enrollments, sales, extras, expenses, nbSessions] = await Promise.all([
    prisma.enrollment.findMany({ where: { session: { organizationId: ORG, annee } }, select: { prix: true, learnerId: true } }),
    prisma.materialSale.findMany({ where: { organizationId: ORG, date: range }, select: { montant: true, quantite: true } }),
    prisma.revenueExtra.findMany({ where: { organizationId: ORG, date: range }, select: { montant: true } }),
    prisma.expense.findMany({ where: { organizationId: ORG, date: range }, select: { categorie: true, montantHT: true } }),
    prisma.trainingSession.count({ where: { organizationId: ORG, annee } }),
  ]);

  const caInscriptions = enrollments.reduce((s, e) => s + num(e.prix), 0);
  const caMateriel = sales.reduce((s, v) => s + num(v.montant) * v.quantite, 0);
  const caExtra = extras.reduce((s, r) => s + num(r.montant), 0);
  const caTotal = caInscriptions + caMateriel + caExtra;

  const nbInscriptions = enrollments.length;
  const nbStagiaires = new Set(enrollments.map((e) => e.learnerId)).size; // stagiaires distincts
  const ticketMoyen = nbInscriptions ? Math.round(caInscriptions / nbInscriptions) : 0;
  const stagiairesMoyens = nbSessions ? Math.round((nbInscriptions / nbSessions) * 10) / 10 : 0;

  const postes: Record<string, number> = {};
  for (const c of EXPENSE_CATEGORIES) postes[c] = 0;
  for (const e of expenses) postes[e.categorie as ExpenseCategory] += num(e.montantHT);
  const depensesTotal = Object.values(postes).reduce((s, v) => s + v, 0);
  const marge = caTotal - depensesTotal;

  return { annee, caTotal, caInscriptions, caMateriel, caExtra, nbInscriptions, nbStagiaires, nbSessions, ticketMoyen, stagiairesMoyens, depensesTotal, marge, postes };
}

export async function GET(req: NextRequest) {
  const annee = Number(req.nextUrl.searchParams.get("annee")) || new Date().getFullYear();
  const [current, previous] = await Promise.all([computeYear(annee), computeYear(annee - 1)]);

  const postesLabels = EXPENSE_CATEGORIES.map((c) => ({ categorie: c, label: CATEGORY_LABELS[c] }));

  return NextResponse.json({ data: { annee, anneePrec: annee - 1, current, previous, postesLabels } });
}
