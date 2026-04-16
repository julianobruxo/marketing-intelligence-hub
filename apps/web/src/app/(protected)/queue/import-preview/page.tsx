import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const sampleRequest = {
  version: 1,
  mode: "PREVIEW",
  orchestrator: "MANUAL",
  sheetProfileKey: "zazmic-brazil-monthly-linkedin",
  source: {
    spreadsheetId: "zazmic-brazil-smm-plan",
    spreadsheetName: "SMM Plan | Zazmic Brazil",
    worksheetId: "apr-2026",
    worksheetName: "Apr 2026",
    rowId: "row-17",
    rowNumber: 17,
    rowVersion: "2026-04-15T12:00:00.000Z",
    headerRowNumber: 11,
    headers: [
      "Date",
      "Linkedin",
      "Portuguese version",
      "Link IMG",
      "Content Deadline",
      "Published",
      "Link to the post",
    ],
    rowValues: [
      "04/08/26",
      "Your team spends 71% of their work time in a browser. But is it protected?",
      "Seu time passa 71% do tempo de trabalho em um navegador. Mas ele esta protegido?",
      "https://drive.google.com/drive/folders/example-browser-gap",
      "04/06/26",
      "Yes",
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
    profile: "SHAWN",
    contentType: "STATIC_POST",
    locale: "en",
    translationRequired: true,
  },
};

export default function ImportPreviewPage() {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <Badge className="rounded-full bg-sky-600 px-3 py-1 text-white hover:bg-sky-600">
          Persistence checkpoint
        </Badge>
        <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-slate-950">
          Preview and commit share one normalization flow before anything reaches Canva.
        </h1>
        <p className="max-w-4xl text-base leading-7 text-slate-600">
          This slice keeps phase 1 inside Pipeline #1 and proves the persistence-backed flow for
          normalized Google Sheets imports before any design adapter work begins.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          "Preview persists a preview receipt but does not create or mutate a canonical content item.",
          "Commit persists an import receipt and creates or updates the canonical content item.",
          "The source row is linked to the content item through spreadsheet, worksheet, and row identity.",
          "Reprocessing works by changing rowVersion or idempotency input while keeping the same source row identity.",
          "Notes, approvals, and status events live only in app-owned tables after import.",
        ].map((point) => (
          <Card key={point} className="border-slate-200 bg-white/95 shadow-sm">
            <CardContent className="p-5 text-sm leading-6 text-slate-700">{point}</CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-slate-200 bg-white/95 shadow-sm">
          <CardHeader>
            <CardDescription>Example normalization request</CardDescription>
            <CardTitle>POST /api/ingestion/sheets/normalize</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-2xl bg-slate-950 p-5 text-xs leading-6 text-slate-100">
              {JSON.stringify(sampleRequest, null, 2)}
            </pre>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-slate-200 bg-white/95 shadow-sm">
            <CardHeader>
              <CardDescription>Mode switch</CardDescription>
              <CardTitle>Preview vs commit</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-slate-700">
              <p>
                Use <code>mode: &quot;PREVIEW&quot;</code> to validate worksheet selection, header mapping,
                row qualification, and title derivation with a persisted preview receipt only.
              </p>
              <p>
                Change to <code>mode: &quot;COMMIT&quot;</code> to create or update the canonical content
                item and link it to the Google Sheets row in the database.
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white/95 shadow-sm">
            <CardHeader>
              <CardDescription>Where to inspect persistence</CardDescription>
              <CardTitle>Database-backed entities</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-slate-700">
              <p>
                Preview and commit receipts persist in <code>ImportReceipt</code>.
              </p>
              <p>
                Canonical items persist in <code>ContentItem</code>.
              </p>
              <p>
                Row linkage persists in <code>ContentSourceLink</code>.
              </p>
              <p>
                Workflow persistence lives in <code>WorkflowNote</code>, <code>ApprovalRecord</code>,
                and <code>StatusEvent</code>.
              </p>
              <Link href="/queue" className="font-medium text-sky-700 underline underline-offset-4">
                Back to queue
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
