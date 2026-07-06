import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { sessionDates } from "@/lib/documents/rules";

async function getOrganizationId(_req: NextRequest) { return "org-ecole-pizza"; }

const SessionInput = z.object({
  programId: z.string().min(1),
  annee: z.coerce.number().int().min(2020).max(2100),
  semaine: z.coerce.number().int().min(1).max(53),
});

export async function GET(req: NextRequest) {
  const organizationId = await getOrganizationId(req);
  const data = await prisma.trainingSession.findMany({
    where: { organizationId },
    include: { program: true, _count: { select: { enrollments: true } } },
    orderBy: [{ annee: "asc" }, { semaine: "asc" }],
  });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const organizationId = await getOrganizationId(req);
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invalide" }, { status: 400 }); }
  const parsed = SessionInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation échouée", details: parsed.error.flatten() }, { status: 422 });

  const program = await prisma.trainingProgram.findUnique({ where: { id: parsed.data.programId } });
  if (!program) return NextResponse.json({ error: "Formation introuvable" }, { status: 404 });

  const { debut, fin } = sessionDates(parsed.data.annee, parsed.data.semaine, program.jours);
  const session = await prisma.trainingSession.create({
    data: { organizationId, programId: program.id, annee: parsed.data.annee, semaine: parsed.data.semaine, dateDebut: debut, dateFin: fin },
  });
  await prisma.auditLog.create({ data: { organizationId, action: "session.create", entity: "TrainingSession", entityId: session.id } });
  return NextResponse.json({ data: session }, { status: 201 });
}
