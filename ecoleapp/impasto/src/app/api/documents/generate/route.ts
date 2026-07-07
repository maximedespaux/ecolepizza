import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ECOLE_PIZZA } from "@/lib/ecole-pizza/organisme";
import { assembleVariables, sessionDates, type Financement } from "@/lib/documents/rules";
import { documentSetFor } from "@/lib/documents/templates";
import { buildFileName } from "@/lib/documents/generate";
import { computeConformite } from "@/lib/documents/conformite";

async function getOrganizationId(_req: NextRequest) { return "org-ecole-pizza"; }

// On génère TOUJOURS à partir d'une session programmée (Sessions & planning /
// Calendrier). `sessionId` est la voie recommandée ; l'ancien couple
// programId+semaine reste accepté (trouve la session, ne la crée que si absente).
const Input = z.object({
  learnerId: z.string().min(1),
  sessionId: z.string().optional(),
  programId: z.string().optional(),
  annee: z.coerce.number().int().min(2020).max(2100).default(new Date().getFullYear()),
  semaine: z.coerce.number().int().min(1).max(53).optional(),
}).refine((d) => d.sessionId || (d.programId && d.semaine), {
  message: "Sélectionnez une session programmée (ou une formation + semaine).",
});

export async function POST(req: NextRequest) {
  const organizationId = await getOrganizationId(req);
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON invalide" }, { status: 400 }); }
  const parsed = Input.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Validation échouée" }, { status: 422 });
  const { learnerId, sessionId } = parsed.data;

  const learner = await prisma.learner.findUnique({ where: { id: learnerId }, include: { company: true } });
  if (!learner) return NextResponse.json({ error: "Stagiaire introuvable" }, { status: 404 });

  // Résolution de la session programmée.
  let session = sessionId
    ? await prisma.trainingSession.findFirst({ where: { id: sessionId, organizationId }, include: { program: true } })
    : await prisma.trainingSession.findFirst({ where: { organizationId, programId: parsed.data.programId, annee: parsed.data.annee, semaine: parsed.data.semaine }, include: { program: true } });

  // Repli : ancienne voie programId+semaine sans session existante → on la crée.
  if (!session && parsed.data.programId && parsed.data.semaine) {
    const prog = await prisma.trainingProgram.findUnique({ where: { id: parsed.data.programId } });
    if (!prog) return NextResponse.json({ error: "Formation introuvable" }, { status: 404 });
    const { debut, fin } = sessionDates(parsed.data.annee, parsed.data.semaine, prog.jours);
    session = await prisma.trainingSession.create({
      data: { organizationId, programId: prog.id, annee: parsed.data.annee, semaine: parsed.data.semaine, dateDebut: debut, dateFin: fin },
      include: { program: true },
    });
  }
  if (!session) return NextResponse.json({ error: "Session programmée introuvable. Planifiez-la d'abord dans le Calendrier." }, { status: 404 });

  const program = session.program;
  const annee = session.annee;
  const semaine = session.semaine;

  // Inscription (dossier)
  const financement = learner.financement as Financement;
  let enrollment = await prisma.enrollment.findUnique({
    where: { learnerId_sessionId: { learnerId, sessionId: session.id } },
  });
  if (!enrollment) {
    // Nouveau dossier → entre dans le pipeline à « Documents envoyés »
    // (devis/contrat à signer, acompte à recevoir avant « Inscrit »).
    enrollment = await prisma.enrollment.create({
      data: { learnerId, sessionId: session.id, financement, prix: program.prix, crmStage: "DEVIS_ENVOYE" },
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
