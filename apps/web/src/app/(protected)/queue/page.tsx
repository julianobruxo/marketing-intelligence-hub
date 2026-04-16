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
    </div>
  );
}
