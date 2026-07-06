// API REST — Stagiaires (point 18). Scopée à l'organisme de l'utilisateur connecté.
// GET  /api/stagiaires        → liste
// POST /api/stagiaires        → création
//
// NOTE : l'auth est branchée en Phase 1 (NextAuth). Tant que la session n'est pas
// câblée, getOrganizationId() retombe sur l'organisme de démo.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

async function getOrganizationId(_req: NextRequest): Promise<string> {
  // TODO Phase 1 : récupérer depuis la session NextAuth (auth()).
  return "org-ecole-pizza";
}

const LearnerInput = z.object({
  civilite: z.string().optional(),
  nom: z.string().min(1, "Le nom est requis"),
  prenom: z.string().optional(),
  email: z.string().email().optional(),
  telephone: z.string().optional(),
  ville: z.string().optional(),
  financement: z.enum(["PARTICULIER", "PROFESSIONNEL"]).default("PARTICULIER"),
  companyId: z.string().optional(),
  opco: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const organizationId = await getOrganizationId(req);
  const q = req.nextUrl.searchParams.get("q")?.trim();

  const learners = await prisma.learner.findMany({
    where: {
      organizationId,
      ...(q
        ? { OR: [{ nom: { contains: q, mode: "insensitive" } }, { prenom: { contains: q, mode: "insensitive" } }, { ville: { contains: q, mode: "insensitive" } }] }
        : {}),
    },
    include: { company: true, enrollments: { include: { session: { include: { program: true } } } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: learners });
}

export async function POST(req: NextRequest) {
  const organizationId = await getOrganizationId(req);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide" }, { status: 400 });
  }

  const parsed = LearnerInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation échouée", details: parsed.error.flatten() }, { status: 422 });
  }

  const learner = await prisma.learner.create({
    data: { organizationId, ...parsed.data },
  });

  await prisma.auditLog.create({
    data: {
      organizationId, action: "learner.create", entity: "Learner",
      entityId: learner.id, metadata: { nom: learner.nom },
    },
  });

  return NextResponse.json({ data: learner }, { status: 201 });
}
