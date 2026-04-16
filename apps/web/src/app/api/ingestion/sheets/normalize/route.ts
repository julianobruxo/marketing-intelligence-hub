import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { importContentItem } from "@/modules/content-intake/application/import-content-item";
import { safeNormalizeSheetRow } from "@/modules/content-intake/application/normalize-sheet-row";
import { logEvent } from "@/shared/logging/logger";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const normalization = safeNormalizeSheetRow(payload);
    const ingestionResult = await importContentItem(normalization.normalizedPayload);

    return NextResponse.json(
      {
        sheetProfileKey: normalization.profile.key,
        worksheetSelection: normalization.worksheetSelectionResult,
        normalizedPayload: normalization.normalizedPayload,
        ingestionResult,
      },
      {
        status:
          ingestionResult.mode === "PREVIEW"
            ? 200
            : ingestionResult.status === "REJECTED"
              ? 422
              : ingestionResult.duplicate
                ? 200
                : 202,
      },
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Invalid sheet normalization request",
          issues: error.issues,
        },
        { status: 400 },
      );
    }

    logEvent("error", "Failed to normalize sheet row", {
      error: error instanceof Error ? error.message : "unknown_error",
    });

    return NextResponse.json(
      {
        error: "Unable to normalize sheet row",
      },
      { status: 500 },
    );
  }
}
