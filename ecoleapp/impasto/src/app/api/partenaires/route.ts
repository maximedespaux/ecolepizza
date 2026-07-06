import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

async function getOrganizationId(_req: NextRequest) { return "org-ecole-pizza"; }

const PartnerInput = z.object({
  nom: z.string().min(1, "Le nom est requis"),
  categorie: z.enum(["FARINE", "MATERIEL", "FOUR", "CHARCUTERIE", "FROMAGE", "CONSERVE", "DISTRIBUTION", "AUTRE"]).default("AUTRE"),
  contactNom: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactTel: z.string().optional(),
  siteWeb: z.string().optional(),
  ville: z.string().optional(),
  remisePct: z.coerce.number().optional(),
  notes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const organizationId = await getOrganizationId(req);
  const cat = req.nextUrl.searchParams.get("categorie") ?? undefined;
  const partners = await prisma.partner.findMany({
    where: { organizationId, ...(cat ? { categorie: cat as never } : {}) },
    include: { contracts: true },
    orderBy: { nom: "asc" },
  });
  return NextResponse.json({ data: partners });
}

export async function POST(req: NextRequest) {
  const organizationId = await getOrganizationId(req);
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invalide" }, { status: 400 }); }
  const parsed = PartnerInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation échouée", details: parsed.error.flatten() }, { status: 422 });

  const { contactEmail, ...rest } = parsed.data;
  const partner = await prisma.partner.create({
    data: { organizationId, ...rest, contactEmail: contactEmail || undefined },
  });
  await prisma.auditLog.create({ data: { organizationId, action: "partner.create", entity: "Partner", entityId: partner.id } });
  return NextResponse.json({ data: partner }, { status: 201 });
}
