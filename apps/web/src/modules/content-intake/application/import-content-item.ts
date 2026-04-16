import { createHash } from "node:crypto";
import {
  ContentStatus,
  ImportReceiptStatus,
  Prisma,
  ContentProfile,
  TranslationStatus,
  UpstreamSystem,
} from "@prisma/client";
import { getPrisma } from "@/shared/lib/prisma";
import { logEvent } from "@/shared/logging/logger";
import {
  contentIngestionPayloadSchema,
  type ContentIngestionPayload,
} from "../domain/ingestion-contract";

function buildFingerprint(payload: ContentIngestionPayload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function toJsonValue(payload: ContentIngestionPayload): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue;
}

function buildQualificationError(payload: ContentIngestionPayload) {
  const reasons = payload.normalization.rowQualification.reasons;
  return reasons.length > 0 ? reasons.join(" | ") : "Row was not qualified for import.";
}

export async function importContentItem(rawPayload: unknown) {
  const payload = contentIngestionPayloadSchema.parse(rawPayload);
  const fingerprint = buildFingerprint(payload);
  const payloadJson = toJsonValue(payload);
  const prisma = getPrisma();

  const existingReceipt = await prisma.importReceipt.findUnique({
    where: {
      idempotencyKey_mode: {
        idempotencyKey: payload.idempotencyKey,
        mode: payload.mode,
      },
    },
  });

  const existingSourceLink = await prisma.contentSourceLink.findUnique({
    where: {
      upstreamSystem_spreadsheetId_worksheetId_rowId: {
        upstreamSystem: UpstreamSystem.GOOGLE_SHEETS,
        spreadsheetId: payload.source.spreadsheetId,
        worksheetId: payload.source.worksheetId,
        rowId: payload.source.rowId,
      },
    },
  });

  if (payload.mode === "PREVIEW") {
    if (!existingReceipt) {
      const previewStatus =
        payload.normalization.rowQualification.disposition === "QUALIFIED"
          ? ImportReceiptStatus.PROCESSED
          : ImportReceiptStatus.REJECTED;

      const previewReceipt = await prisma.importReceipt.create({
        data: {
          idempotencyKey: payload.idempotencyKey,
          mode: payload.mode,
          orchestrator: payload.orchestrator,
          upstreamSystem: UpstreamSystem.GOOGLE_SHEETS,
          sheetProfileKey: payload.normalization.sheetProfileKey,
          sheetProfileVersion: payload.normalization.sheetProfileVersion,
          status: previewStatus,
          payloadVersion: payload.version,
          fingerprint,
          payload: payloadJson,
          errorCode:
            previewStatus === ImportReceiptStatus.REJECTED
              ? payload.normalization.rowQualification.disposition
              : null,
          errorMessage:
            previewStatus === ImportReceiptStatus.REJECTED
              ? buildQualificationError(payload)
              : null,
          processedAt: new Date(),
        },
      });

      return {
        mode: payload.mode,
        duplicate: false,
        receiptId: previewReceipt.id,
        sheetProfileKey: payload.normalization.sheetProfileKey,
        disposition: payload.normalization.rowQualification.disposition,
        reasons: payload.normalization.rowQualification.reasons,
        wouldCreate: !existingSourceLink,
        wouldUpdate: Boolean(existingSourceLink),
        existingContentItemId: existingSourceLink?.contentItemId ?? null,
        titleDerivation: payload.normalization.titleDerivation,
        metadataPolicy:
          "publishedFlag and publishedPostUrl stay as source metadata only and cannot override app-owned workflow state.",
      };
    }

    return {
      mode: payload.mode,
      duplicate: true,
      receiptId: existingReceipt.id,
      sheetProfileKey: payload.normalization.sheetProfileKey,
      disposition: payload.normalization.rowQualification.disposition,
      reasons: payload.normalization.rowQualification.reasons,
      wouldCreate: !existingSourceLink,
      wouldUpdate: Boolean(existingSourceLink),
      existingContentItemId: existingSourceLink?.contentItemId ?? null,
      titleDerivation: payload.normalization.titleDerivation,
      metadataPolicy:
        "publishedFlag and publishedPostUrl stay as source metadata only and cannot override app-owned workflow state.",
    };
  }

  if (existingReceipt) {
    return {
      mode: payload.mode,
      duplicate: true,
      receiptId: existingReceipt.id,
      contentItemId: existingReceipt.contentItemId,
      status: existingReceipt.status,
    };
  }

  if (payload.normalization.rowQualification.disposition !== "QUALIFIED") {
    const rejectedReceipt = await prisma.importReceipt.create({
      data: {
        idempotencyKey: payload.idempotencyKey,
        mode: payload.mode,
        orchestrator: payload.orchestrator,
        upstreamSystem: UpstreamSystem.GOOGLE_SHEETS,
        sheetProfileKey: payload.normalization.sheetProfileKey,
        sheetProfileVersion: payload.normalization.sheetProfileVersion,
        status: ImportReceiptStatus.REJECTED,
        payloadVersion: payload.version,
        fingerprint,
        payload: payloadJson,
        errorCode: payload.normalization.rowQualification.disposition,
        errorMessage: buildQualificationError(payload),
        processedAt: new Date(),
      },
    });

    return {
      mode: payload.mode,
      duplicate: false,
      receiptId: rejectedReceipt.id,
      status: rejectedReceipt.status,
      disposition: payload.normalization.rowQualification.disposition,
      reasons: payload.normalization.rowQualification.reasons,
    };
  }

  const result = await prisma.$transaction(async (tx) => {
    const sourceLink = await tx.contentSourceLink.findUnique({
      where: {
        upstreamSystem_spreadsheetId_worksheetId_rowId: {
          upstreamSystem: UpstreamSystem.GOOGLE_SHEETS,
          spreadsheetId: payload.source.spreadsheetId,
          worksheetId: payload.source.worksheetId,
          rowId: payload.source.rowId,
        },
      },
    });

    const title = payload.normalization.titleDerivation.title || payload.content.title;

    const contentItem = sourceLink
      ? await tx.contentItem.update({
          where: { id: sourceLink.contentItemId },
          data: {
            canonicalKey: payload.content.canonicalKey,
            profile: payload.content.profile as ContentProfile,
            contentType: payload.content.contentType,
            title,
            copy: payload.content.copy,
            sourceLocale: payload.content.locale,
            translationRequired: payload.content.translationRequired,
            translationStatus: payload.content.translationRequired
              ? TranslationStatus.REQUESTED
              : TranslationStatus.NOT_REQUIRED,
            planningSnapshot: payloadJson,
            latestImportAt: new Date(payload.triggeredAt),
            sourceLinks: {
              updateMany: {
                where: {
                  upstreamSystem: UpstreamSystem.GOOGLE_SHEETS,
                  spreadsheetId: payload.source.spreadsheetId,
                  worksheetId: payload.source.worksheetId,
                  rowId: payload.source.rowId,
                },
                data: {
                  sheetProfileKey: payload.normalization.sheetProfileKey,
                  sheetProfileVersion: payload.normalization.sheetProfileVersion,
                  worksheetName: payload.source.worksheetName,
                  rowNumber: payload.source.rowNumber,
                  rowVersion: payload.source.rowVersion,
                  lastFingerprint: fingerprint,
                },
              },
            },
          },
        })
      : await tx.contentItem.create({
          data: {
            canonicalKey: payload.content.canonicalKey,
            profile: payload.content.profile as ContentProfile,
            contentType: payload.content.contentType,
            title,
            copy: payload.content.copy,
            sourceLocale: payload.content.locale,
            translationRequired: payload.content.translationRequired,
            translationStatus: payload.content.translationRequired
              ? TranslationStatus.REQUESTED
              : TranslationStatus.NOT_REQUIRED,
            currentStatus: ContentStatus.IMPORTED,
            planningSnapshot: payloadJson,
            latestImportAt: new Date(payload.triggeredAt),
            sourceLinks: {
              create: {
                upstreamSystem: UpstreamSystem.GOOGLE_SHEETS,
                sheetProfileKey: payload.normalization.sheetProfileKey,
                sheetProfileVersion: payload.normalization.sheetProfileVersion,
                spreadsheetId: payload.source.spreadsheetId,
                worksheetId: payload.source.worksheetId,
                worksheetName: payload.source.worksheetName,
                rowId: payload.source.rowId,
                rowNumber: payload.source.rowNumber,
                rowVersion: payload.source.rowVersion,
                lastFingerprint: fingerprint,
              },
            },
            statusEvents: {
              create: {
                toStatus: ContentStatus.IMPORTED,
                note: "Imported from normalized orchestration contract.",
              },
            },
          },
        });

    const receipt = await tx.importReceipt.create({
      data: {
        idempotencyKey: payload.idempotencyKey,
        mode: payload.mode,
        orchestrator: payload.orchestrator,
        upstreamSystem: UpstreamSystem.GOOGLE_SHEETS,
        sheetProfileKey: payload.normalization.sheetProfileKey,
        sheetProfileVersion: payload.normalization.sheetProfileVersion,
        status: ImportReceiptStatus.PROCESSED,
        payloadVersion: payload.version,
        fingerprint,
        payload: payloadJson,
        contentItemId: contentItem.id,
        processedAt: new Date(),
      },
    });

    return {
      mode: payload.mode,
      duplicate: false,
      receiptId: receipt.id,
      contentItemId: contentItem.id,
      status: receipt.status,
    };
  });

  logEvent("info", "Processed normalized content ingestion payload", {
    idempotencyKey: payload.idempotencyKey,
    contentItemId: result.contentItemId,
    orchestrator: payload.orchestrator,
    sheetProfileKey: payload.normalization.sheetProfileKey,
  });

  return result;
}
