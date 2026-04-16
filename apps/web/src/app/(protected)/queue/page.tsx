import Link from "next/link";
import { MoveUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buildQueueSections } from "@/modules/content-catalog/application/content-workflow-view-model";
import { listQueueContentItems } from "@/modules/content-catalog/application/content-queries";
import { QueueTable } from "./queue-table";

export default async function QueuePage() {
  const contentItems = await listQueueContentItems();
  const sections = buildQueueSections(contentItems);
  const totalItems = sections.reduce((sum, section) => sum + section.count, 0);

  return (
    <div className="space-y-4">
      <QueueTable sections={sections} totalItems={totalItems} />

      <Card
        size="sm"
        className="border-dashed border-slate-300 bg-white/90 shadow-[0_18px_46px_rgba(15,23,42,0.04)]"
      >
        <CardHeader className="pb-2">
          <CardDescription>Import checkpoint</CardDescription>
          <CardTitle className="text-base text-slate-950">
            Preview, commit, and row tracing stay available beneath the queue
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="max-w-2xl text-sm leading-6 text-slate-600">
            Normalized Sheets payloads still enter through the
            persistence-backed checkpoint that supports preview, commit, and
            reprocessing.
          </p>
          <Button
            asChild
            size="sm"
            className="rounded-xl bg-slate-950 text-white hover:bg-slate-800"
          >
            <Link href="/queue/import-preview">
              Open import checkpoint
              <MoveUpRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
