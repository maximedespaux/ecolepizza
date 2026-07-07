// DELETE /api/comptabilite/depenses/[id] — supprimer une dépense.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const ORG = "org-ecole-pizza";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const expense = await prisma.expense.findUnique({ where: { id } });
  if (!expense) return NextResponse.json({ error: "Dépense introuvable" }, { status: 404 });
  await prisma.expense.delete({ where: { id } });
  await prisma.auditLog.create({ data: { organizationId: ORG, action: "expense.delete", entity: "Expense", entityId: id } });
  return NextResponse.json({ ok: true });
}
