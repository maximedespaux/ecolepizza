// API REST — Session de formation (une).
// GET    /api/sessions/[id]   → détail + stagiaires inscrits
// PATCH  /api/sessions/[id]   → statut, ou déplacer (annee/semaine → dates recalculées)
// DELETE /api/sessions/[id]   → annuler/supprimer (bloqué si des stagiaires sont inscrits)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SessionStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sessionDates } from "@/lib/documents/rules";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await prisma.trainingSession.findUnique({
    where: { id },
    include: {
      program: true,
      enrollments: {
        include: { learner: { include: { company: true } } },
        orderBy: { createdAt: "asc" },
      },
      _count: { select: { enrollments: true } },
    },
  });
  if (!session) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
  return NextResponse.json({ data: session });
}

const Patch = z.object({
  status: z.nativeEnum(SessionStatus).optional(),
  annee: z.coerce.number().int().min(2020).max(2100).optional(),
  semaine: z.coerce.number().int().min(1).max(53).optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invalide" }, { status: 400 }); }
  const parsed = Patch.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation échouée", details: parsed.error.flatten() }, { status: 422 });

  const current = await prisma.trainingSession.findUnique({ where: { id }, include: { program: true } });
  if (!current) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });

  const data: Prisma.TrainingSessionUpdateInput = {};
  if (parsed.data.status !== undefined) data.status = parsed.data.status;

  // Déplacement : si on change la semaine et/ou l'année, on recalcule les dates.
  const annee = parsed.data.annee ?? current.annee;
  const semaine = parsed.data.semaine ?? current.semaine;
  if (parsed.data.annee !== undefined || parsed.data.semaine !== undefined) {
    const { debut, fin } = sessionDates(annee, semaine, current.program.jours);
    data.annee = annee;
    data.semaine = semaine;
    data.dateDebut = debut;
    data.dateFin = fin;
  }

  const session = await prisma.trainingSession.update({ where: { id }, data, include: { program: true } });
  await prisma.auditLog.create({
    data: { organizationId: session.organizationId, action: "session.update", entity: "TrainingSession", entityId: id },
  });
  return NextResponse.json({ data: session });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await prisma.trainingSession.findUnique({
    where: { id },
    include: { _count: { select: { enrollments: true } } },
  });
  if (!session) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });

  if (session._count.enrollments > 0) {
    return NextResponse.json(
      { error: "Des stagiaires sont inscrits. Retirez-les d'abord, ou passez la session en « Annulée »." },
      { status: 409 },
    );
  }

  await prisma.trainingSession.delete({ where: { id } });
  await prisma.auditLog.create({
    data: { organizationId: session.organizationId, action: "session.delete", entity: "TrainingSession", entityId: id },
  });
  return NextResponse.json({ ok: true });
}
