import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/modules/auth/application/auth-service";
import { getNBResultImage } from "@/modules/design-orchestration/infrastructure/nb-result-store";
import { logEvent } from "@/shared/logging/logger";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ requestId: string; variationId: string }> },
) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { requestId, variationId } = await params;
  const image = getNBResultImage(requestId, variationId);

  if (!image) {
    logEvent("warn", "[NB] Result image not found", {
      requestId,
      variationId,
    });

    return NextResponse.json({ error: "Image result not found." }, { status: 404 });
  }

  const mimeType = image.mimeType || "image/png";
  const body = Buffer.from(image.imageBase64, "base64");

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": mimeType,
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
    },
  });
}
