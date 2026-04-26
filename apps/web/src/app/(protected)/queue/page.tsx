import { getCurrentSession } from "@/modules/auth/application/auth-service";
import { buildQueueSections } from "@/modules/content-catalog/application/content-workflow-view-model";
import { listQueueContentItems } from "@/modules/content-catalog/application/content-queries";
import { QueueTable } from "./queue-table";

export default async function QueuePage() {
  const session = await getCurrentSession();
  const contentItems = await listQueueContentItems();
  const sections = buildQueueSections(contentItems);
  const totalItems = sections.reduce((sum, section) => sum + section.count, 0);
  const activeLanes = sections.filter((section) => section.count > 0).length;
  const canClearQueue = session?.roles.includes("ADMIN") ?? false;

  return (
    <div className="space-y-3" data-testid="queue-page">
      <section className="app-surface-panel relative overflow-hidden rounded-[14px] px-6 py-5 dark:border-[rgba(255,255,255,0.06)] dark:bg-[#13111f] dark:shadow-none">
        <div className="pointer-events-none absolute inset-0 dark:bg-[radial-gradient(ellipse_at_20%_60%,rgba(100,70,220,0.18)_0%,transparent_65%)]" aria-hidden="true" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9ca3af] dark:text-[rgba(255,255,255,0.35)]">
              Marketing Intelligence Hub
            </p>
            <h1 className="mt-1.5 text-[2.5rem] font-extrabold tracking-[-0.03em] text-[#0f172a] dark:text-white sm:text-[2.5rem]">
              Queue
            </h1>
            <p className="mt-1 text-sm text-[#6b7280] dark:text-[rgba(255,255,255,0.45)]">
              Live workflow handoffs, action queues, and closed work.
            </p>
          </div>

          <div className="rounded-[12px] border border-[rgba(200,210,240,0.7)] px-5 py-4 dark:border-[rgba(255,255,255,0.10)] dark:bg-transparent">
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#9ca3af] dark:text-[rgba(255,255,255,0.35)]">
              Backlog
            </p>
            <div className="mt-1.5 flex items-end gap-1.5">
              <span className="text-[2rem] font-bold tracking-[-0.03em] text-[#0f172a] dark:text-white">{totalItems}</span>
              <span className="pb-0.5 text-xs text-[#6b7280] dark:text-[rgba(255,255,255,0.45)]">items</span>
            </div>
            <p className="mt-0.5 text-[11px] text-[#6b7280] dark:text-[rgba(255,255,255,0.45)]">
              {activeLanes} active {activeLanes === 1 ? "lane" : "lanes"}
            </p>
          </div>
        </div>
      </section>

      <QueueTable sections={sections} canClearQueue={canClearQueue} />
    </div>
  );
}
