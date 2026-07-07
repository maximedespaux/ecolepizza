// Rendu d'un document généré → DOCX rempli (modèle réel + données du dossier).
// Logique partagée par la route de téléchargement et le moteur de signature.
import { prisma } from "@/lib/db";
import { renderDocx } from "./generate";
import { templateFileFor, templateExists, loadTemplate } from "./template-files";
import { assembleVariables, type Financement } from "./rules";
import { ECOLE_PIZZA } from "@/lib/ecole-pizza/organisme";

export type ProduceResult =
  | { ok: false; error: string; status: number }
  | { ok: true; docx: Buffer; base: string; doc: Awaited<ReturnType<typeof loadDoc>> };

async function loadDoc(id: string) {
  return prisma.generatedDocument.findUnique({
    where: { id },
    include: {
      enrollment: {
        include: { learner: { include: { company: true } }, session: { include: { program: true } } },
      },
    },
  });
}

export async function produceDocx(id: string): Promise<ProduceResult> {
  const doc = await loadDoc(id);
  if (!doc || !doc.enrollment) return { ok: false, error: "Document introuvable", status: 404 };

  const program = doc.enrollment.session.program;
  const l = doc.enrollment.learner;

  const filename = templateFileFor(doc.type, {
    financement: doc.enrollment.financement, rsCode: program.rsCode, jours: program.jours, hygiene: program.hygiene,
  });
  if (!filename || !templateExists(filename)) {
    return { ok: false, error: `Aucun modèle disponible pour « ${doc.type} »`, status: 404 };
  }

  // Données de fusion recalculées en direct depuis le dossier (toujours à jour).
  const merge = assembleVariables({
    organisme: ECOLE_PIZZA,
    stagiaire: {
      civilite: l.civilite, nom: l.nom, prenom: l.prenom,
      adresse: l.adresse, codePostal: l.codePostal, ville: l.ville,
      telephone: l.telephone, email: l.email, dateNaissance: l.dateNaissance,
      financement: doc.enrollment.financement as Financement,
    },
    formation: {
      code: program.code, titre: program.titre, jours: program.jours, heures: program.heures,
      prix: Number(program.prix), public: program.public ?? undefined, objectifs: program.objectifs ?? undefined,
      deroule: program.deroule ?? undefined, dureeDetail: program.dureeDetail ?? undefined,
      hygiene: program.hygiene, rsCode: program.rsCode,
    },
    entreprise: l.company
      ? { nom: l.company.nom, siret: l.company.siret, civRepresentant: l.company.civRepresentant, nomRepresentant: l.company.nomRepresentant }
      : null,
    annee: doc.enrollment.session.annee,
    semaine: doc.enrollment.session.semaine,
  });

  let docx: Buffer;
  try {
    docx = renderDocx(loadTemplate(filename), merge as unknown as Record<string, unknown>);
  } catch (e) {
    return { ok: false, error: "Rendu du document impossible: " + String(e), status: 500 };
  }

  const base = `${doc.numberPrefix ? doc.numberPrefix + ". " : ""}${doc.type} - ${program.titre} - ${l.nom}${l.prenom ? " " + l.prenom : ""}`;
  return { ok: true, docx, base, doc };
}
