export const MOCK_CONTENT_ITEMS = {
  canvaReady: {
    kind: "canva-ready",
    title: "E2E Canva Ready",
  },
  nbReady: {
    kind: "nb-ready",
    title: "E2E Nano Banana Ready",
  },
  designReadyCanva: {
    kind: "design-ready-canva",
    title: "E2E Canva Design Ready",
  },
  designReadyNb: {
    kind: "design-ready-nb",
    title: "E2E Nano Banana Design Ready",
  },
  designFailedCanva: {
    kind: "design-failed-canva",
    title: "E2E Canva Design Failed",
  },
  designFailedExhaustedCanva: {
    kind: "design-failed-exhausted-canva",
    title: "E2E Canva Design Exhausted",
  },
  readyToPost: {
    kind: "ready-to-post",
    title: "E2E Ready To Post",
  },
} as const;

export type MockSeedKind = typeof MOCK_CONTENT_ITEMS[keyof typeof MOCK_CONTENT_ITEMS]["kind"];
