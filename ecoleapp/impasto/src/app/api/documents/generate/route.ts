import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ECOLE_PIZZA } from "@/lib/ecole-pizza/organisme";
import { assembleVariables, sessionDates, type Financement } from "@/lib/documents/rules";
import { documentSetFor } from "@/lib/documents/templates";
import { buildFileName } from "@/lib/documents/generate";
import { computeConformite } from "@/lib/documents/conformite";

async function getOrganizationId(_req: NextRequest) { return "org-ecole-pizza"; }

const Input = z.object({
  learnerId: z.string().min(1),
  programId: z.string().min(1),
  annee: z.coerce.number().int().min(2020).max(2100).default(new Date().getFullYear()),
  semaine: z.coerce.number().int().min(1).max(53),
});

export async function POST(req: NextRequest) {
  const organizationId = await getOrganizationId(req);
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invalide" }, { status: 400 }); }
  const parsed = Input.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation échouée", details: parsed.error.flatten() }, { status: 422 });
  const { learnerId, programId, annee, semaine } = parsed.data;

  const [learner, program] = await Promise.all([
    prisma.learner.findUnique({ where: { id: learnerId }, include: { company: true } }),
    prisma.trainingProgram.findUnique({ where: { id: programId } }),
  ]);
  if (!learner || !program) return NextResponse.json({ error: "Stagiaire ou formation introuvable" }, { status: 404 });

  // Session (trouver ou créer)
  let session = await prisma.trainingSession.findFirst({ where: { organizationId, programId, annee, semaine } });
  if (!session) {
    const { debut, fin } = sessionDates(annee, semaine, program.jours);
    session = await prisma.trainingSession.create({
      data: { organizationId, programId, annee, semaine, dateDebut: debut, dateFin: fin },
    });
  }

  // Inscription (dossier)
  const financement = learner.financement as Financement;
  let enrollment = await prisma.enrollment.findUnique({
    where: { learnerId_sessionId: { learnerId, sessionId: session.id } },
  });
  if (!enrollment) {
    enrollment = await prisma.enrollment.create({
      data: { learnerId, sessionId: session.id, financement, prix: program.prix, crmStage: "INSCRIT" },
    });
  }

  // Variables de fusion (communes au dossier)
  const mergeData = assembleVariables({
    organisme: ECOLE_PIZZA,
    stagiaire: {
      civilite: learner.civilite, nom: learner.nom, prenom: learner.prenom,
      adresse: learner.adresse, codePostal: learner.codePostal, ville: learner.ville,
      telephone: learner.telephone, email: learner.email, dateNaissance: learner.dateNaissance,
      financement,
    },
    formation: {
      code: program.code, titre: program.titre, jours: program.jours, heures: program.heures,
      prix: Number(program.prix), public: program.public ?? undefined, objectifs: program.objectifs ?? undefined,
      deroule: program.deroule ?? undefined, dureeDetail: program.dureeDetail ?? undefined,
      hygiene: program.hygiene, rsCode: program.rsCode,
    },
    entreprise: learner.company
      ? { nom: learner.company.nom, siret: learner.company.siret, civRepresentant: learner.company.civRepresentant, nomRepresentant: learner.company.nomRepresentant }
      : null,
    annee, semaine,
  });

  // Jeu de documents 1 → N
  const set = documentSetFor({ hygiene: program.hygiene, rsCode: program.rsCode, jours: program.jours, financement });
  for (const d of set) {
    const existing = await prisma.generatedDocument.findFirst({ where: { enrollmentId: enrollment.id, type: d.type as never } });
    if (existing) continue;
    await prisma.generatedDocument.create({
      data: {
        organizationId, enrollmentId: enrollment.id, type: d.type as never,
        status: "GENERE", numberPrefix: String(d.num),
        fileName: buildFileName(String(d.num), d.label, learner.nom, learner.prenom ?? undefined),
        mergeData,
      },
    });
  }

  // Conformité + statut CRM
  const docs = await prisma.generatedDocument.findMany({ where: { enrollmentId: enrollment.id } });
  const set2 = documentSetFor({ hygiene: program.hygiene, rsCode: program.rsCode, jours: program.jours, financement });
  const signableTypes = new Set(set2.filter((d) => d.signable).map((d) => d.type));
  const conformite = computeConformite(docs.map((x) => ({ signable: signableTypes.has(x.type), status: x.status })));
  await prisma.enrollment.update({ where: { id: enrollment.id }, data: { conformite } });
  await prisma.auditLog.create({ data: { organizationId, action: "documents.generate", entity: "Enrollment", entityId: enrollment.id, metadata: { count: set.length } } });

  return NextResponse.json({ data: { enrollmentId: enrollment.id, documents: docs.length } }, { status: 201 });
}
