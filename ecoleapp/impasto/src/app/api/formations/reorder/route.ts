// PUT /api/formations/reorder — réordonner les formations (glisser-déposer).
// Corps : { ids: string[] } dans le nouvel ordre → ordre = position dans la liste.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const ORG = "org-ecole-pizza";
const Input = z.object({ ids: z.array(z.string()).min(1) });

export async function PUT(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invalide" }, { status: 400 }); }
  const parsed = Input.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Liste d'identifiants requise" }, { status: 422 });

  const { ids } = parsed.data;
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.trainingProgram.updateMany({ where: { id, organizationId: ORG }, data: { ordre: index } }),
    ),
  );
  await prisma.auditLog.create({ data: { organizationId: ORG, action: "program.reorder", entity: "TrainingProgram", metadata: { ordre: ids } } });
  return NextResponse.json({ ok: true });
}
