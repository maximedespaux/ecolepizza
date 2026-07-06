import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { documentSetFor } from "@/lib/documents/templates";
import { computeConformite } from "@/lib/documents/conformite";

const Patch = z.object({ status: z.enum(["A_FAIRE", "GENERE", "ENVOYE", "CONSULTE", "SIGNE", "ARCHIVE"]) });

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invalide" }, { status: 400 }); }
  const parsed = Patch.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Statut invalide" }, { status: 422 });

  const doc = await prisma.generatedDocument.update({
    where: { id }, data: { status: parsed.data.status },
    include: { enrollment: { include: { session: { include: { program: true } } } } },
  });

  // Recalcul de la conformité du dossier
  const program = doc.enrollment.session.program;
  const set = documentSetFor({
    hygiene: program.hygiene, rsCode: program.rsCode, jours: program.jours,
    financement: doc.enrollment.financement as "PARTICULIER" | "PROFESSIONNEL",
  });
  const signable = new Set(set.filter((d) => d.signable).map((d) => d.type));
  const docs = await prisma.generatedDocument.findMany({ where: { enrollmentId: doc.enrollmentId } });
  const conformite = computeConformite(docs.map((x) => ({ signable: signable.has(x.type), status: x.status })));
  await prisma.enrollment.update({ where: { id: doc.enrollmentId }, data: { conformite } });

  return NextResponse.json({ data: doc });
}
