import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "marketing-intelligence-hub",
    pipeline: "pipeline-1",
  });
}
