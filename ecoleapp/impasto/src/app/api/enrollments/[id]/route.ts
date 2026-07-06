// API REST — Inscription (une).
// PATCH  /api/enrollments/[id]   → faire avancer l'étape CRM, financement, prix, acompte
// DELETE /api/enrollments/[id]   → retirer l'inscription (bloqué si documents/factures liés)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma, Financement, CrmStage } from "@prisma/client";
import { prisma } from "@/lib/db";

const Patch = z.object({
  crmStage: z.nativeEnum(CrmStage).optional(),
  financement: z.nativeEnum(Financement).optional(),
  prix: z.coerce.number().nonnegative().optional(),
  acompte: z.coerce.number().nonnegative().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invalide" }, { status: 400 }); }
  const parsed = Patch.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation échouée", details: parsed.error.flatten() }, { status: 422 });

  const data: Prisma.EnrollmentUpdateInput = {};
  if (parsed.data.crmStage !== undefined) data.crmStage = parsed.data.crmStage;
  if (parsed.data.financement !== undefined) data.financement = parsed.data.financement;
  if (parsed.data.prix !== undefined) data.prix = new Prisma.Decimal(parsed.data.prix);
  if (parsed.data.acompte !== undefined) data.acompte = new Prisma.Decimal(parsed.data.acompte);

  const enrollment = await prisma.enrollment.update({
    where: { id },
    data,
    include: { learner: { include: { company: true } }, session: { include: { program: true } } },
  });

  await prisma.auditLog.create({
    data: { organizationId: enrollment.session.organizationId, action: "enrollment.update", entity: "Enrollment", entityId: id },
  });
  return NextResponse.json({ data: enrollment });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const enrollment = await prisma.enrollment.findUnique({
    where: { id },
    include: { session: true, _count: { select: { documents: true, invoices: true, signatures: true } } },
  });
  if (!enrollment) return NextResponse.json({ error: "Inscription introuvable" }, { status: 404 });

  // Garde-fou : on ne supprime pas une inscription qui a déjà des documents/factures/signatures.
  const c = enrollment._count;
  if (c.documents > 0 || c.invoices > 0 || c.signatures > 0) {
    return NextResponse.json(
      { error: "Suppression bloquée : des documents, factures ou signatures sont liés à cette inscription." },
      { status: 409 },
    );
  }

  // Les notes internes (EnrollmentNote) sont supprimées avec l'inscription.
  await prisma.$transaction([
    prisma.enrollmentNote.deleteMany({ where: { enrollmentId: id } }),
    prisma.enrollment.delete({ where: { id } }),
  ]);

  await prisma.auditLog.create({
    data: { organizationId: enrollment.session.organizationId, action: "enrollment.delete", entity: "Enrollment", entityId: id },
  });
  return NextResponse.json({ ok: true });
}
