// DELETE /api/comptabilite/revenus/[id] — supprimer un produit divers.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const ORG = "org-ecole-pizza";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const revenu = await prisma.revenueExtra.findUnique({ where: { id } });
  if (!revenu) return NextResponse.json({ error: "Produit introuvable" }, { status: 404 });
  await prisma.revenueExtra.delete({ where: { id } });
  await prisma.auditLog.create({ data: { organizationId: ORG, action: "revenueextra.delete", entity: "RevenueExtra", entityId: id } });
  return NextResponse.json({ ok: true });
}
