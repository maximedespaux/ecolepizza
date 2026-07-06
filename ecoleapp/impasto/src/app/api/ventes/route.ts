// API REST — Ventes de matériel.
// GET  /api/ventes   → liste + statistiques (total, par catégorie)
// POST /api/ventes   → enregistrer une vente
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

const ORG = "org-ecole-pizza";

export async function GET() {
  const sales = await prisma.materialSale.findMany({ where: { organizationId: ORG }, orderBy: { date: "desc" } });
  let total = 0;
  const byCategorie: Record<string, number> = {};
  for (const s of sales) {
    const m = Number(s.montant) * s.quantite;
    total += m;
    byCategorie[s.categorie] = (byCategorie[s.categorie] ?? 0) + m;
  }
  return NextResponse.json({
    data: sales.slice(0, 100),
    stats: { total, count: sales.length, byCategorie },
  });
}

const CreateInput = z.object({
  produit: z.string().trim().min(1, "Le produit est requis"),
  categorie: z.string().trim().min(1).default("Autre"),
  quantite: z.coerce.number().int().min(1).default(1),
  montant: z.coerce.number().nonnegative(),
  date: z.string().optional(),
  learnerId: z.string().optional(),
  learnerNom: z.string().optional(),
  note: z.string().optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invalide" }, { status: 400 }); }
  const parsed = CreateInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Validation échouée" }, { status: 422 });
  const d = parsed.data;

  const sale = await prisma.materialSale.create({
    data: {
      organizationId: ORG, produit: d.produit, categorie: d.categorie, quantite: d.quantite,
      montant: new Prisma.Decimal(d.montant), date: d.date ? new Date(d.date) : new Date(),
      learnerId: d.learnerId || null, learnerNom: d.learnerNom || null, note: d.note || null,
    },
  });
  await prisma.auditLog.create({ data: { organizationId: ORG, action: "materialsale.create", entity: "MaterialSale", entityId: sale.id, metadata: { montant: d.montant, produit: d.produit } } });
  return NextResponse.json({ data: sale }, { status: 201 });
}
