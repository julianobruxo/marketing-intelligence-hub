import { DesignProvider, Prisma } from "@prisma/client";
import { notFound } from "next/navigation";
import { getPrisma } from "@/shared/lib/prisma";
import { logEvent } from "@/shared/logging/logger";

const queueContentItemArgs = Prisma.validator<Prisma.ContentItemDefaultArgs>()({
  include: {
    sourceLinks: {
      orderBy: { createdAt: "desc" },
      take: 1,
    },
    designRequests: {
      orderBy: [{ attemptNumber: "desc" }, { updatedAt: "desc" }],
      take: 1,
      include: {
        profileMapping: true,
      },
    },
    importReceipts: {
      orderBy: { receivedAt: "desc" },
      take: 1,
    },
    statusEvents: {
      orderBy: { createdAt: "desc" },
      take: 1,
    },
    assets: {
      orderBy: [{ slideIndex: "asc" }, { createdAt: "desc" }],
      take: 1,
    },
  },
});

const contentItemDetailArgs = Prisma.validator<Prisma.ContentItemDefaultArgs>()({
  include: {
    sourceLinks: {
      orderBy: { createdAt: "desc" },
    },
    importReceipts: {
      include: {
        importedBy: true,
      },
      orderBy: { receivedAt: "desc" },
    },
    notes: {
      include: {
        author: true,
      },
      orderBy: { createdAt: "desc" },
    },
    approvals: {
      include: {
        actor: true,
      },
      orderBy: { createdAt: "desc" },
    },
    statusEvents: {
      orderBy: { createdAt: "desc" },
    },
    designRequests: {
      orderBy: [{ attemptNumber: "desc" }, { createdAt: "desc" }],
      include: {
        profileMapping: true,
      },
    },
    assets: {
      orderBy: [{ slideIndex: "asc" }, { createdAt: "asc" }],
    },
  },
});

type BaseQueueContentItem = Prisma.ContentItemGetPayload<typeof queueContentItemArgs>;
type BaseContentItemDetail = Prisma.ContentItemGetPayload<typeof contentItemDetailArgs>;
export type QueueContentItem = BaseQueueContentItem & {
  queueMappingAvailability: "AVAILABLE" | "MISSING";
  queueActiveRouteLabel: string | null;
  queueActiveRouteProvider: DesignProvider | null;
};
export type ActiveTemplateMapping = {
  id: string;
  profile: BaseContentItemDetail["profile"];
  contentType: BaseContentItemDetail["contentType"];
  locale: string;
  designProvider: DesignProvider;
  externalTemplateId: string;
  displayName: string;
  isActive: boolean;
};
export type ContentItemDetail = BaseContentItemDetail & {
  activeTemplateMappings: ActiveTemplateMapping[];
};

export async function listQueueContentItems(): Promise<QueueContentItem[]> {
  const prisma = getPrisma();
  const items = await prisma.contentItem.findMany({
    ...queueContentItemArgs,
    orderBy: [{ latestImportAt: "desc" }, { updatedAt: "desc" }],
  });

  logEvent("info", "[TRACE_IMPORT_QUEUE][QUEUE_QUERY] raw-items", {
    count: items.length,
    itemIds: items.map((item) => item.id),
    canonicalKeys: items.map((item) => item.canonicalKey),
    latestImportAt: items.map((item) => ({
      id: item.id,
      latestImportAt: item.latestImportAt?.toISOString() ?? null,
      updatedAt: item.updatedAt.toISOString(),
    })),
  });

  if (items.length === 0) {
    return [];
  }

  const uniqueRouteKeys = new Map<
    string,
    { profile: BaseQueueContentItem["profile"]; contentType: BaseQueueContentItem["contentType"]; locale: string }
  >();

  for (const item of items) {
    const key = `${item.profile}:${item.contentType}:${item.sourceLocale.toLowerCase()}`;
    if (!uniqueRouteKeys.has(key)) {
      uniqueRouteKeys.set(key, {
        profile: item.profile,
        contentType: item.contentType,
        locale: item.sourceLocale.toLowerCase(),
      });
    }
  }

  const mappings = await prisma.profileTemplateMapping.findMany({
    where: {
      isActive: true,
      OR: Array.from(uniqueRouteKeys.values()).map((routeKey) => ({
        profile: routeKey.profile,
        contentType: routeKey.contentType,
        locale: routeKey.locale,
      })),
    },
    orderBy: [{ designProvider: "asc" }, { displayName: "asc" }],
  });

  const mappingByKey = new Map<
    string,
    {
      label: string;
      provider: DesignProvider;
    }
  >();

  for (const mapping of mappings) {
    const key = `${mapping.profile}:${mapping.contentType}:${mapping.locale.toLowerCase()}`;
    if (!mappingByKey.has(key)) {
      mappingByKey.set(key, {
        label: mapping.displayName,
        provider: mapping.designProvider,
      });
    }
  }

  const queueItems = items.map((item) => {
    const mapping = mappingByKey.get(
      `${item.profile}:${item.contentType}:${item.sourceLocale.toLowerCase()}`,
    );

    return {
      ...item,
      queueMappingAvailability: mapping ? ("AVAILABLE" as const) : ("MISSING" as const),
      queueActiveRouteLabel: mapping?.label ?? null,
      queueActiveRouteProvider: mapping?.provider ?? null,
    };
  });

  logEvent("info", "[TRACE_IMPORT_QUEUE][QUEUE_QUERY] returned-items", {
    count: queueItems.length,
    itemIds: queueItems.map((item) => item.id),
    canonicalKeys: queueItems.map((item) => item.canonicalKey),
  });

  return queueItems;
}

export async function getContentItemDetail(contentItemId: string): Promise<ContentItemDetail> {
  const prisma = getPrisma();
  const item = await prisma.contentItem.findUnique({
    where: { id: contentItemId },
    ...contentItemDetailArgs,
  });

  if (!item) {
    notFound();
  }

  const activeTemplateMappings = await prisma.profileTemplateMapping.findMany({
    where: {
      profile: item.profile,
      contentType: item.contentType,
      locale: item.sourceLocale,
      isActive: true,
    },
    orderBy: [{ designProvider: "asc" }, { displayName: "asc" }],
  });

  return {
    ...item,
    activeTemplateMappings,
  };
}
