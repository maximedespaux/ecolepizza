// PUT /api/comptabilite/cibles — enregistrer les cibles de gestion (% du CA) éditables.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { EXPENSE_CATEGORIES, mergeTargets } from "@/lib/compta/targets";

const ORG = "org-ecole-pizza";

const pct = z.coerce.number().min(0).max(100);
const Input = z.object({
  targets: z.object(Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c, pct.optional()]))).partial(),
  dividendeCible: pct.optional(),
});

export async function PUT(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invalide" }, { status: 400 }); }
  const parsed = Input.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Validation échouée" }, { status: 422 });

  const targets = mergeTargets(parsed.data.targets);
  const dividendeCible = parsed.data.dividendeCible ?? 10;

  const saved = await prisma.accountingSettings.upsert({
    where: { organizationId: ORG },
    update: { targets, dividendeCible: new Prisma.Decimal(dividendeCible) },
    create: { organizationId: ORG, targets, dividendeCible: new Prisma.Decimal(dividendeCible) },
  });
  await prisma.auditLog.create({ data: { organizationId: ORG, action: "accountingsettings.update", entity: "AccountingSettings", entityId: saved.id, metadata: { targets, dividendeCible } } });
  return NextResponse.json({ data: { ...saved, dividendeCible: Number(saved.dividendeCible) } });
}
