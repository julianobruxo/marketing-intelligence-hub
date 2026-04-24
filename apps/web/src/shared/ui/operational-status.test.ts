import { describe, expect, it } from "vitest";
import { formatOperationalLabel, getQueueStatePresentation } from "./operational-status";

describe("operational-status queue/card presentation", () => {
  it("maps operational queue states to the approved product labels", () => {
    expect(formatOperationalLabel("WAITING_FOR_COPY")).toBe("BLOCKED");
    expect(formatOperationalLabel("READY_FOR_DESIGN")).toBe("DESIGN");
    expect(formatOperationalLabel("READY_TO_PUBLISH")).toBe("PA");
    expect(formatOperationalLabel("POSTED")).toBe("POSTED");
  });

  it("preserves non-queue labels outside the operational quartet", () => {
    expect(formatOperationalLabel("TRANSLATION_READY")).toBe("Review Translation");
    expect(formatOperationalLabel("DESIGN_READY")).toBe("Approve Design");
  });

  it("collapses workflow states into queue/card presentation families", () => {
    expect(getQueueStatePresentation("BLOCKED")).toEqual({ label: "BLOCKED", tone: "amber" });
    expect(getQueueStatePresentation("READY_FOR_DESIGN")).toEqual({ label: "DESIGN", tone: "violet" });
    expect(getQueueStatePresentation("READY_TO_PUBLISH")).toEqual({ label: "PA", tone: "blue" });
    expect(getQueueStatePresentation("POSTED")).toEqual({ label: "POSTED", tone: "emerald" });
    expect(getQueueStatePresentation("DESIGN_READY")).toEqual({ label: "DESIGN", tone: "violet" });
  });
});
