// POST /api/comptabilite/depenses — enregistrer une dépense (poste de gestion).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { EXPENSE_CATEGORIES } from "@/lib/compta/targets";

const ORG = "org-ecole-pizza";

const Input = z.object({
  libelle: z.string().trim().min(1, "Le libellé est requis"),
  categorie: z.enum(EXPENSE_CATEGORIES),
  montantHT: z.coerce.number().nonnegative("Montant invalide"),
  date: z.string().optional(),
  fournisseurId: z.string().optional(),
  note: z.string().optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invalide" }, { status: 400 }); }
  const parsed = Input.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Validation échouée" }, { status: 422 });
  const d = parsed.data;

  const expense = await prisma.expense.create({
    data: {
      organizationId: ORG, libelle: d.libelle, categorie: d.categorie,
      montantHT: new Prisma.Decimal(d.montantHT), date: d.date ? new Date(d.date) : new Date(),
      fournisseurId: d.fournisseurId || null, note: d.note || null,
    },
  });
  await prisma.auditLog.create({ data: { organizationId: ORG, action: "expense.create", entity: "Expense", entityId: expense.id, metadata: { categorie: d.categorie, montantHT: d.montantHT } } });
  return NextResponse.json({ data: expense }, { status: 201 });
}
