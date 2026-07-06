// API REST — Inscriptions (Enrollment).
// GET  /api/enrollments                → liste (filtres ?sessionId= / ?learnerId=)
// POST /api/enrollments                → inscrire un stagiaire à une session
//
// NOTE : l'auth sera branchée en Phase « Rôles ». Tant que la session NextAuth
// n'est pas câblée, getOrganizationId() retombe sur l'organisme de démo.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma, Financement, CrmStage } from "@prisma/client";
import { prisma } from "@/lib/db";

async function getOrganizationId(_req: NextRequest): Promise<string> {
  return "org-ecole-pizza";
}

export async function GET(req: NextRequest) {
  const organizationId = await getOrganizationId(req);
  const sessionId = req.nextUrl.searchParams.get("sessionId")?.trim() || undefined;
  const learnerId = req.nextUrl.searchParams.get("learnerId")?.trim() || undefined;

  const data = await prisma.enrollment.findMany({
    where: { session: { organizationId }, sessionId, learnerId },
    include: {
      learner: { include: { company: true } },
      session: { include: { program: true } },
      _count: { select: { documents: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ data });
}

const CreateInput = z.object({
  learnerId: z.string().min(1),
  sessionId: z.string().min(1),
  companyId: z.string().optional(),
  financement: z.nativeEnum(Financement).optional(),
  prix: z.coerce.number().nonnegative().optional(),
  acompte: z.coerce.number().nonnegative().optional(),
  crmStage: z.nativeEnum(CrmStage).optional(),
});

export async function POST(req: NextRequest) {
  const organizationId = await getOrganizationId(req);
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invalide" }, { status: 400 }); }
  const parsed = CreateInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation échouée", details: parsed.error.flatten() }, { status: 422 });
  const input = parsed.data;

  // La session doit exister et appartenir à l'organisme.
  const session = await prisma.trainingSession.findFirst({
    where: { id: input.sessionId, organizationId },
    include: { program: true },
  });
  if (!session) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });

  // Le stagiaire doit exister et appartenir à l'organisme.
  const learner = await prisma.learner.findFirst({ where: { id: input.learnerId, organizationId } });
  if (!learner) return NextResponse.json({ error: "Stagiaire introuvable" }, { status: 404 });

  // Pas de double inscription (contrainte @@unique learner+session).
  const existing = await prisma.enrollment.findUnique({
    where: { learnerId_sessionId: { learnerId: input.learnerId, sessionId: input.sessionId } },
  });
  if (existing) return NextResponse.json({ error: "Ce stagiaire est déjà inscrit à cette session" }, { status: 409 });

  const enrollment = await prisma.enrollment.create({
    data: {
      learnerId: input.learnerId,
      sessionId: input.sessionId,
      companyId: input.companyId ?? learner.companyId ?? undefined,
      financement: input.financement ?? learner.financement,
      prix: input.prix != null ? new Prisma.Decimal(input.prix) : session.program.prix,
      acompte: input.acompte != null ? new Prisma.Decimal(input.acompte) : undefined,
      crmStage: input.crmStage ?? CrmStage.INSCRIT,
    },
    include: { learner: { include: { company: true } } },
  });

  await prisma.auditLog.create({
    data: { organizationId, action: "enrollment.create", entity: "Enrollment", entityId: enrollment.id },
  });
  return NextResponse.json({ data: enrollment }, { status: 201 });
}
