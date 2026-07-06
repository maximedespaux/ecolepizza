// API REST — Formations (catalogue).
// GET  /api/formations   → liste
// POST /api/formations   → créer une formation (code unique par organisme)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

const ORG = "org-ecole-pizza";

export async function GET(_req: NextRequest) {
  const data = await prisma.trainingProgram.findMany({ where: { organizationId: ORG }, orderBy: { prix: "desc" } });
  return NextResponse.json({ data });
}

const CreateInput = z.object({
  code: z.string().trim().min(1, "Le code est requis").max(20),
  titre: z.string().trim().min(1, "L'intitulé est requis"),
  prix: z.coerce.number().nonnegative().default(0),
  jours: z.coerce.number().int().min(1).default(1),
  heures: z.coerce.number().int().min(1).default(7),
  public: z.string().optional(),
  objectifs: z.string().optional(),
  deroule: z.string().optional(),
  hygiene: z.boolean().optional(),
  rsCode: z.string().optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invalide" }, { status: 400 }); }
  const parsed = CreateInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Validation échouée" }, { status: 422 });
  const d = parsed.data;
  try {
    const program = await prisma.trainingProgram.create({
      data: {
        organizationId: ORG, code: d.code.toUpperCase(), titre: d.titre,
        prix: new Prisma.Decimal(d.prix), jours: d.jours, heures: d.heures,
        public: d.public || null, objectifs: d.objectifs || null, deroule: d.deroule || null,
        hygiene: d.hygiene ?? false, rsCode: d.rsCode?.trim() || null,
      },
    });
    await prisma.auditLog.create({ data: { organizationId: ORG, action: "program.create", entity: "TrainingProgram", entityId: program.id } });
    return NextResponse.json({ data: program }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: `Le code « ${d.code.toUpperCase()} » existe déjà.` }, { status: 409 });
    }
    return NextResponse.json({ error: "Création impossible" }, { status: 500 });
  }
}
