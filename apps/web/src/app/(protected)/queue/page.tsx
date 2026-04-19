import { buildQueueSections } from "@/modules/content-catalog/application/content-workflow-view-model";
import { listQueueContentItems } from "@/modules/content-catalog/application/content-queries";
import { QueueTable } from "./queue-table";

export default async function QueuePage() {
  const contentItems = await listQueueContentItems();
  const sections = buildQueueSections(contentItems);
  const totalItems = sections.reduce((sum, section) => sum + section.count, 0);
  const activeLanes = sections.filter((section) => section.count > 0).length;

  return (
    <div className="space-y-3">
      <section className="app-surface-panel overflow-hidden rounded-[26px] px-5 py-4 dark:border-[rgba(88,108,186,0.34)] dark:bg-[linear-gradient(145deg,rgba(12,17,37,0.96),rgba(10,14,31,0.92))] dark:shadow-[0_24px_64px_-46px_rgba(48,59,134,0.58)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7B93BC] dark:text-[#8996B7]">
              Marketing Intelligence Hub
            </p>
            <h1 className="mt-1.5 text-[1.85rem] font-semibold tracking-[-0.04em] text-[#1F2E57] dark:text-slate-100 sm:text-[2.15rem]">
              Queue
            </h1>
            <p className="mt-1 text-sm text-[#5E749B] dark:text-[#8D9AB8]">
              Live workflow handoffs, action queues, and closed work.
            </p>
          </div>

          <div className="app-control-pill rounded-[20px] px-3.5 py-3 dark:border-[rgba(101,119,190,0.38)] dark:bg-[linear-gradient(180deg,rgba(30,37,70,0.88),rgba(21,28,56,0.84))]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7D95BE] dark:text-[#8A96B3]">
              Backlog
            </p>
            <div className="mt-1.5 flex items-end gap-1.5">
              <span className="text-[1.9rem] font-semibold tracking-[-0.04em] text-[#1F2E57] dark:text-slate-100">{totalItems}</span>
              <span className="pb-0.5 text-xs text-[#5E749B] dark:text-[#8D9AB8]">items</span>
            </div>
            <p className="mt-0.5 text-[11px] text-[#5E749B] dark:text-[#8D9AB8]">
              {activeLanes} active {activeLanes === 1 ? "lane" : "lanes"}
            </p>
          </div>
        </div>
      </section>

      <QueueTable sections={sections} totalItems={totalItems} />
    </div>
  );
}
