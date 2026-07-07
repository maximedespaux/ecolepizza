// POST /api/comptabilite/revenus — enregistrer un produit divers (commission, subvention…).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

const ORG = "org-ecole-pizza";

const Input = z.object({
  libelle: z.string().trim().min(1, "Le libellé est requis"),
  categorie: z.enum(["COMMISSION", "SUBVENTION", "AUTRE"]).default("COMMISSION"),
  montant: z.coerce.number().nonnegative("Montant invalide"),
  date: z.string().optional(),
  note: z.string().optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invalide" }, { status: 400 }); }
  const parsed = Input.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Validation échouée" }, { status: 422 });
  const d = parsed.data;

  const revenu = await prisma.revenueExtra.create({
    data: {
      organizationId: ORG, libelle: d.libelle, categorie: d.categorie,
      montant: new Prisma.Decimal(d.montant), date: d.date ? new Date(d.date) : new Date(), note: d.note || null,
    },
  });
  await prisma.auditLog.create({ data: { organizationId: ORG, action: "revenueextra.create", entity: "RevenueExtra", entityId: revenu.id, metadata: { categorie: d.categorie, montant: d.montant } } });
  return NextResponse.json({ data: revenu }, { status: 201 });
}
