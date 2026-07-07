// API REST — Formation (une).
// PATCH  /api/formations/[id]   → modifier (y compris le code)
// DELETE /api/formations/[id]   → supprimer (bloqué si des sessions existent)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

const Patch = z.object({
  code: z.string().trim().min(1).max(20).optional(),
  titre: z.string().min(1).optional(),
  prix: z.coerce.number().optional(),
  jours: z.coerce.number().int().optional(),
  heures: z.coerce.number().int().optional(),
  public: z.string().optional(),
  objectifs: z.string().optional(),
  deroule: z.string().optional(),
  hygiene: z.boolean().optional(),
  rsCode: z.string().optional(),
  actif: z.boolean().optional(),
  image: z.string().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: unknown; try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invalide" }, { status: 400 }); }
  const parsed = Patch.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation échouée" }, { status: 422 });

  const data: Prisma.TrainingProgramUpdateInput = { ...parsed.data };
  if (parsed.data.code !== undefined) data.code = parsed.data.code.toUpperCase();
  if (parsed.data.prix !== undefined) data.prix = new Prisma.Decimal(parsed.data.prix);
  if (parsed.data.rsCode !== undefined) data.rsCode = parsed.data.rsCode.trim() || null;
  if (parsed.data.image !== undefined) data.image = parsed.data.image.trim() || null;

  try {
    const program = await prisma.trainingProgram.update({ where: { id }, data });
    await prisma.auditLog.create({ data: { organizationId: program.organizationId, action: "program.update", entity: "TrainingProgram", entityId: id } });
    return NextResponse.json({ data: program });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "Ce code de formation est déjà utilisé." }, { status: 409 });
    }
    return NextResponse.json({ error: "Mise à jour impossible" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const program = await prisma.trainingProgram.findUnique({
    where: { id }, include: { _count: { select: { sessions: true } } },
  });
  if (!program) return NextResponse.json({ error: "Formation introuvable" }, { status: 404 });
  if (program._count.sessions > 0) {
    return NextResponse.json(
      { error: `Impossible : ${program._count.sessions} session(s) utilisent cette formation. Supprimez-les d'abord, ou désactivez la formation.` },
      { status: 409 },
    );
  }
  await prisma.trainingProgram.delete({ where: { id } });
  await prisma.auditLog.create({ data: { organizationId: program.organizationId, action: "program.delete", entity: "TrainingProgram", entityId: id } });
  return NextResponse.json({ ok: true });
}
