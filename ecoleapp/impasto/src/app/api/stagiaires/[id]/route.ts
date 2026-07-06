import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const Patch = z.object({
  civilite: z.string().optional(), nom: z.string().min(1).optional(), prenom: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")), telephone: z.string().optional(),
  ville: z.string().optional(), financement: z.enum(["PARTICULIER", "PROFESSIONNEL"]).optional(), opco: z.string().optional(),
  // Formation réalisée + suivi (carte / recontact)
  niveauRealise: z.string().optional(), aRecontacter: z.boolean().optional(), departement: z.string().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: unknown; try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invalide" }, { status: 400 }); }
  const parsed = Patch.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation échouée", details: parsed.error.flatten() }, { status: 422 });
  const data = {
    ...parsed.data,
    email: parsed.data.email === "" ? undefined : parsed.data.email,
    // "" (champ vidé) → null pour signifier « formation à compléter ».
    niveauRealise: parsed.data.niveauRealise === "" ? null : parsed.data.niveauRealise,
  };
  const learner = await prisma.learner.update({ where: { id }, data });
  await prisma.auditLog.create({ data: { organizationId: learner.organizationId, action: "learner.update", entity: "Learner", entityId: id } });
  return NextResponse.json({ data: learner });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await prisma.enrollment.deleteMany({ where: { learnerId: id } });
  const learner = await prisma.learner.delete({ where: { id } });
  await prisma.auditLog.create({ data: { organizationId: learner.organizationId, action: "learner.delete", entity: "Learner", entityId: id } });
  return NextResponse.json({ ok: true });
}
