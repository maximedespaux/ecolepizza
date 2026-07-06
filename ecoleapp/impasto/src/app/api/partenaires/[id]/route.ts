import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const Patch = z.object({
  nom: z.string().min(1).optional(),
  categorie: z.enum(["FARINE","MATERIEL","FOUR","CHARCUTERIE","FROMAGE","CONSERVE","DISTRIBUTION","AUTRE"]).optional(),
  contactNom: z.string().optional(), contactEmail: z.string().email().optional().or(z.literal("")),
  contactTel: z.string().optional(), ville: z.string().optional(),
  remisePct: z.coerce.number().optional(), notes: z.string().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: unknown; try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invalide" }, { status: 400 }); }
  const parsed = Patch.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation échouée" }, { status: 422 });
  const data = { ...parsed.data, contactEmail: parsed.data.contactEmail === "" ? undefined : parsed.data.contactEmail };
  const partner = await prisma.partner.update({ where: { id }, data });
  return NextResponse.json({ data: partner });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await prisma.partner.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
