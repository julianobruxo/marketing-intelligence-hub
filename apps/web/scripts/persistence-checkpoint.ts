import "dotenv/config";
import { ApprovalDecision, ApprovalStage, ContentStatus, NoteType, TranslationStatus } from "@prisma/client";
import { importContentItem } from "../src/modules/content-intake/application/import-content-item";
import { normalizeSheetRow } from "../src/modules/content-intake/application/normalize-sheet-row";
import { getPrisma } from "../src/shared/lib/prisma";

async function main() {
  const prisma = getPrisma();

  const baseRequest = {
    version: 1 as const,
    orchestrator: "MANUAL" as const,
    sheetProfileKey: "zazmic-brazil-monthly-linkedin",
    source: {
      spreadsheetId: "zazmic-brazil-smm-plan",
      spreadsheetName: "SMM Plan | Zazmic Brazil",
      worksheetId: "apr-2026",
      worksheetName: "Apr 2026",
      rowId: "row-42",
      rowNumber: 42,
      headerRowNumber: 11,
      headers: [
        "Date",
        "Campaign",
        "Linkedin",
        "Portuguese version",
        "Link IMG",
        "Content Deadline",
        "Published",
        "Link to the post",
      ],
      rowValues: [
        "04/15/26",
        "Browser risk awareness",
        "Browser activity is where most teams unknowingly expose company data every single day.",
        "A atividade no navegador e onde muitos times expoem dados da empresa todos os dias.",
        "https://drive.google.com/drive/folders/browser-risk-awareness",
        "04/12/26",
        "No",
        "",
      ],
    },
    worksheetSelection: {
      targetMonth: "2026-04",
      availableWorksheets: [
        { worksheetId: "apr-2026", worksheetName: "Apr 2026" },
        { worksheetId: "may-2026", worksheetName: "May 2026" },
      ],
    },
    contentHints: {
      profile: "SHAWN" as const,
      contentType: "STATIC_POST" as const,
      locale: "en",
      translationRequired: true,
    },
  };

  const previewNormalization = normalizeSheetRow({
    ...baseRequest,
    mode: "PREVIEW",
    source: {
      ...baseRequest.source,
      rowVersion: "2026-04-15T12:00:00.000Z",
    },
  });

  const previewFirst = await importContentItem(previewNormalization.normalizedPayload);
  const previewDuplicate = await importContentItem(previewNormalization.normalizedPayload);
  const previewReceipt = await prisma.importReceipt.findUniqueOrThrow({
    where: {
      idempotencyKey_mode: {
        idempotencyKey: previewNormalization.normalizedPayload.idempotencyKey,
        mode: "PREVIEW",
      },
    },
  });

  const commitNormalization = normalizeSheetRow({
    ...baseRequest,
    mode: "COMMIT",
    source: {
      ...baseRequest.source,
      rowVersion: "2026-04-15T12:00:00.000Z",
    },
  });

  const commitFirst = await importContentItem(commitNormalization.normalizedPayload);
  const commitDuplicate = await importContentItem(commitNormalization.normalizedPayload);

  const reprocessNormalization = normalizeSheetRow({
    ...baseRequest,
    mode: "COMMIT",
    source: {
      ...baseRequest.source,
      rowVersion: "2026-04-16T12:00:00.000Z",
      rowValues: [
        "04/15/26",
        "Browser risk awareness",
        "Browser activity is where most teams unknowingly expose company data, extensions, and sensitive workflows every single day.",
        "A atividade no navegador e onde muitos times expoem dados, extensoes e fluxos sensiveis todos os dias.",
        "https://drive.google.com/drive/folders/browser-risk-awareness-v2",
        "04/12/26",
        "No",
        "",
      ],
    },
  });

  const reprocessCommit = await importContentItem(reprocessNormalization.normalizedPayload);

  const committedItem = await prisma.contentItem.findUniqueOrThrow({
    where: {
      canonicalKey: reprocessNormalization.normalizedPayload.content.canonicalKey,
    },
    include: {
      sourceLinks: true,
      importReceipts: {
        orderBy: { processedAt: "asc" },
      },
    },
  });

  const existingNotes = await prisma.workflowNote.count({
    where: { contentItemId: committedItem.id },
  });

  if (existingNotes === 0) {
    const alina = await prisma.user.findUniqueOrThrow({
      where: { email: process.env.SEED_ALINA_EMAIL ?? "alina@zazmic.com" },
    });

    await prisma.workflowNote.create({
      data: {
        contentItemId: committedItem.id,
        authorId: alina.id,
        type: NoteType.COMMENT,
        body: "Persistence checkpoint note for the committed content item.",
      },
    });
  }

  const existingApprovals = await prisma.approvalRecord.count({
    where: { contentItemId: committedItem.id },
  });

  if (existingApprovals === 0) {
    const alina = await prisma.user.findUniqueOrThrow({
      where: { email: process.env.SEED_ALINA_EMAIL ?? "alina@zazmic.com" },
    });

    await prisma.approvalRecord.create({
      data: {
        contentItemId: committedItem.id,
        actorId: alina.id,
        stage: ApprovalStage.PUBLISH,
        decision: ApprovalDecision.APPROVED,
        note: "Persistence checkpoint approval.",
      },
    });

    await prisma.contentItem.update({
      where: { id: committedItem.id },
      data: {
        currentStatus: ContentStatus.CONTENT_APPROVED,
        translationStatus: TranslationStatus.REQUESTED,
      },
    });
  }

  const persistedWorkflow = await prisma.contentItem.findUniqueOrThrow({
    where: { id: committedItem.id },
    include: {
      notes: true,
      approvals: true,
      statusEvents: true,
      sourceLinks: true,
      importReceipts: {
        orderBy: { processedAt: "asc" },
      },
    },
  });

  console.log(
    JSON.stringify(
      {
        preview: {
        first: previewFirst,
        duplicate: previewDuplicate,
        persistedReceipt: {
          id: previewReceipt.id,
          mode: previewReceipt.mode,
          status: previewReceipt.status,
          contentItemId: previewReceipt.contentItemId,
        },
      },
        commit: {
          first: commitFirst,
          duplicate: commitDuplicate,
          reprocess: reprocessCommit,
        },
        rowLink: persistedWorkflow.sourceLinks.map((link) => ({
          spreadsheetId: link.spreadsheetId,
          worksheetId: link.worksheetId,
          rowId: link.rowId,
          contentItemId: link.contentItemId,
          rowVersion: link.rowVersion,
        })),
        importReceipts: persistedWorkflow.importReceipts.map((receipt) => ({
          idempotencyKey: receipt.idempotencyKey,
          mode: receipt.mode,
          status: receipt.status,
          contentItemId: receipt.contentItemId,
        })),
        workflowPersistence: {
          contentItemId: persistedWorkflow.id,
          currentStatus: persistedWorkflow.currentStatus,
          notes: persistedWorkflow.notes.length,
          approvals: persistedWorkflow.approvals.length,
          statusEvents: persistedWorkflow.statusEvents.length,
        },
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await getPrisma().$disconnect();
  } catch {}
  process.exit(1);
});
