import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const ORG_ID = "org-ecole-pizza";

export async function GET() {
  const org = await prisma.organization.findUnique({ where: { id: ORG_ID } });
  return NextResponse.json({ data: org });
}

const Patch = z.object({
  raisonSociale: z.string().optional(), sigle: z.string().optional(), responsable: z.string().optional(),
  siret: z.string().optional(), nda: z.string().optional(), nafApe: z.string().optional(),
  adresse: z.string().optional(), codePostal: z.string().optional(), ville: z.string().optional(),
  telephone: z.string().optional(), email: z.string().optional(), juridiction: z.string().optional(),
});

export async function PATCH(req: NextRequest) {
  let body: unknown; try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invalide" }, { status: 400 }); }
  const parsed = Patch.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation échouée" }, { status: 422 });
  const org = await prisma.organization.update({ where: { id: ORG_ID }, data: parsed.data });
  await prisma.auditLog.create({ data: { organizationId: ORG_ID, action: "organization.update", entity: "Organization", entityId: ORG_ID } });
  return NextResponse.json({ data: org });
}
