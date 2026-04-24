import { describe, expect, it } from "vitest";

import { deriveTitleFromPlanningFields, yannKronbergPlanningProfile } from "./sheet-profiles";

describe("deriveTitleFromPlanningFields", () => {
  it("always prefers campaignLabel when it is present", () => {
    const result = deriveTitleFromPlanningFields(
      {
        campaignLabel: "OpenClaw Security Guide",
        copyEnglish: "LinkedIn\n\nThis should not win",
      },
      yannKronbergPlanningProfile,
    );

    expect(result).toEqual({
      title: "OpenClaw Security Guide",
      strategy: "EXPLICIT_MAPPED_FIELD",
      sourceField: "campaignLabel",
    });
  });

  it("accepts any non-empty campaignLabel including short generic-looking values", () => {
    const result = deriveTitleFromPlanningFields(
      {
        campaignLabel: "FREE article",
      },
      yannKronbergPlanningProfile,
    );

    expect(result).toEqual({
      title: "FREE article",
      strategy: "EXPLICIT_MAPPED_FIELD",
      sourceField: "campaignLabel",
    });
  });

  it("falls back to plannedDate when Title is absent — brief and copy are not used", () => {
    const result = deriveTitleFromPlanningFields(
      {
        plannedDate: "2026-04-23",
        copyEnglish: "This should be ignored",
      },
      yannKronbergPlanningProfile,
    );

    expect(result).toEqual({
      title: "Post — 2026-04-23",
      strategy: "HEURISTIC_LAST_RESORT",
      sourceField: "plannedDate",
    });
  });

  it("falls back to contentDeadline when plannedDate is absent", () => {
    const result = deriveTitleFromPlanningFields(
      {
        contentDeadline: "2026-04-24",
      },
      yannKronbergPlanningProfile,
    );

    expect(result).toEqual({
      title: "Post — 2026-04-24",
      strategy: "HEURISTIC_LAST_RESORT",
      sourceField: "contentDeadline",
    });
  });

  it("returns null when no operational title field is available", () => {
    const result = deriveTitleFromPlanningFields(
      {
        copyEnglish: "Ignored for title derivation in the operational flow",
      },
      yannKronbergPlanningProfile,
    );

    expect(result).toBeNull();
  });
});
