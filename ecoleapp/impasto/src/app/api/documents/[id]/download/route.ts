// GET /api/documents/[id]/download
// Rend le vrai document Word rempli (modèle École Pizza + données du dossier)
// et le renvoie en téléchargement (.docx). PDF possible plus tard via Gotenberg.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { renderDocx } from "@/lib/documents/generate";
import { templateFileFor, templateExists, loadTemplate } from "@/lib/documents/template-files";
import { assembleVariables, type Financement } from "@/lib/documents/rules";
import { ECOLE_PIZZA } from "@/lib/ecole-pizza/organisme";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const doc = await prisma.generatedDocument.findUnique({
    where: { id },
    include: {
      enrollment: {
        include: {
          learner: { include: { company: true } },
          session: { include: { program: true } },
        },
      },
    },
  });
  if (!doc || !doc.enrollment) return NextResponse.json({ error: "Document introuvable" }, { status: 404 });

  const program = doc.enrollment.session.program;
  const filename = templateFileFor(doc.type, {
    financement: doc.enrollment.financement,
    rsCode: program.rsCode,
    jours: program.jours,
    hygiene: program.hygiene,
  });
  if (!filename || !templateExists(filename)) {
    return NextResponse.json({ error: `Aucun modèle disponible pour « ${doc.type} »` }, { status: 404 });
  }

  // Données de fusion recalculées EN DIRECT depuis le dossier (toujours à jour,
  // contrairement au mergeData figé enregistré à la création du document).
  const l = doc.enrollment.learner;
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

  let rendered: Buffer;
  try {
    rendered = renderDocx(loadTemplate(filename), merge as unknown as Record<string, unknown>);
  } catch (e) {
    return NextResponse.json({ error: "Rendu du document impossible", detail: String(e) }, { status: 500 });
  }

  // Nom de fichier lisible : n° · type · FORMATION · stagiaire (le nom de la
  // formation remplace l'ancien « Annexe N »).
  const outName =
    `${doc.numberPrefix ? doc.numberPrefix + ". " : ""}${doc.type} - ${program.titre} - ${l.nom}${l.prenom ? " " + l.prenom : ""}.docx`;

  return new NextResponse(new Uint8Array(rendered), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(outName)}`,
    },
  });
}
