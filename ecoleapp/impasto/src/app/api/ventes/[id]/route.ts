// DELETE /api/ventes/[id]  — supprimer une vente de matériel.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const ORG = "org-ecole-pizza";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sale = await prisma.materialSale.findUnique({ where: { id } });
  if (!sale) return NextResponse.json({ error: "Vente introuvable" }, { status: 404 });
  await prisma.materialSale.delete({ where: { id } });
  await prisma.auditLog.create({ data: { organizationId: ORG, action: "materialsale.delete", entity: "MaterialSale", entityId: id } });
  return NextResponse.json({ ok: true });
}
