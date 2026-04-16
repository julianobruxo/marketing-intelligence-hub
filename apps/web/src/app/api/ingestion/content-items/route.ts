import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { importContentItem } from "@/modules/content-intake/application/import-content-item";
import { logEvent } from "@/shared/logging/logger";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const result = await importContentItem(payload);
    const status =
      result.mode === "PREVIEW"
        ? 200
        : result.duplicate
          ? 200
          : result.status === "REJECTED"
            ? 422
            : 202;

    return NextResponse.json(result, {
      status,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      logEvent("warn", "Rejected invalid ingestion payload", {
        issues: error.issues,
      });

      return NextResponse.json(
        {
          error: "Invalid ingestion payload",
          issues: error.issues,
        },
        { status: 400 },
      );
    }

    logEvent("error", "Failed to ingest content payload", {
      error: error instanceof Error ? error.message : "unknown_error",
    });

    return NextResponse.json(
      {
        error: "Unable to process ingestion payload",
      },
      { status: 500 },
    );
  }
}
