import { ContentStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { QueueContentItem } from "./content-queries";
import { buildQueueSections, getSemanticWorkflowDecision } from "./content-workflow-view-model";

function makeQueueItem(
  overrides: Partial<QueueContentItem> = {},
): QueueContentItem {
  return {
    id: "item-1",
    title: "Queue item",
    copy: "A".repeat(180),
    currentStatus: ContentStatus.IMPORTED,
    planningSnapshot: {
      workflow: {
        operationalStatus: "READY_TO_PUBLISH",
      },
    },
    designRequests: [],
    statusEvents: [],
    assets: [],
    queueMappingAvailability: "AVAILABLE",
    queueActiveRouteLabel: null,
    contentType: "STATIC_POST",
    sourceLocale: "en",
    translationRequired: false,
    latestImportAt: new Date("2026-04-23T10:00:00.000Z"),
    updatedAt: new Date("2026-04-23T10:00:00.000Z"),
    importReceipts: [],
    sourceLinks: [],
    profile: "YANN",
    ...overrides,
  } as unknown as QueueContentItem;
}

describe("content-workflow-view-model queue/card state alignment", () => {
  it("maps READY_TO_PUBLISH to PA with blue semantics", () => {
    const item = makeQueueItem();

    expect(getSemanticWorkflowDecision(item)).toMatchObject({
      statusKey: "READY_TO_PUBLISH",
      visibleStatusLabel: "PA",
      nextActionLabel: "Post to LinkedIn",
      baseVisualFamily: "blue",
    });
  });

  it("routes READY_TO_PUBLISH items into the PA lane", () => {
    const item = makeQueueItem();

    const decorated = buildQueueSections([item]).flatMap((section) => section.items);

    expect(decorated).toHaveLength(1);
    expect(decorated[0]).toMatchObject({
      lane: "IN_PROGRESS",
      nextActionLabel: "Post to LinkedIn",
    });
  });
});
