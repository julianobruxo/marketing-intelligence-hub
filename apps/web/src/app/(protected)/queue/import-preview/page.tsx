import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function ImportPreviewPage() {
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <Badge className="rounded-full bg-slate-950 px-3 py-1 text-white hover:bg-slate-950 dark:bg-indigo-500/25 dark:text-[#C8D1FF]">
          Drive-first import
        </Badge>
        <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-slate-950 dark:text-slate-100">
          Drive scan, staging, and queue ingestion now live on the import surface.
        </h1>
        <p className="max-w-3xl text-base leading-7 text-slate-600 dark:text-[#95A7CB]">
          Spreadsheet rows are discovered from the configured Drive folder, staged in the platform, and then moved
          into the Workflow Queue when selected.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          "Scan Drive for spreadsheets from the configured folder and subfolders.",
          "Select one or more spreadsheet records for staged import.",
          "Review staged spreadsheets before sending valid rows to the queue.",
          "Copy stays read-only inside the app; the spreadsheet remains the source of truth.",
        ].map((point) => (
          <div key={point} className="app-surface-panel rounded-2xl p-5 text-sm leading-6 text-slate-700 dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(16,23,47,0.86)] dark:text-[#D0D9F8]">
            {point}
          </div>
        ))}
      </section>

      <section className="app-surface-panel rounded-[28px] p-5 dark:border-[rgba(88,108,186,0.3)] dark:bg-[rgba(16,23,47,0.86)]">
        <p className="text-sm leading-7 text-slate-600 dark:text-[#95A7CB]">
          The older worksheet-first checkpoint has been retired. Use the import surface for Drive discovery,
          spreadsheet staging, and queue ingestion.
        </p>
        <div className="mt-4">
          <Button asChild style={{ backgroundColor: "#E8584A", color: "white" }}>
            <Link href="/import">Open Import</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
