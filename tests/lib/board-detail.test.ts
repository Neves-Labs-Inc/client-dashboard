import { afterEach, describe, expect, it, vi } from "vitest";
import type { FieldCheck } from "@/lib/board-sync/board-sync";
import { getFieldsMeta, getWarningLine, isHttpsUrl } from "@/lib/board-detail";

describe("getFieldsMeta", () => {
  const check = (field: FieldCheck) => ({
    field: "Client note" as const,
    check: field,
  });

  it("counts missing and issue fields together as 'to fix'", () => {
    expect(
      getFieldsMeta([check("issue-field"), check("missing"), check("present")]),
    ).toBe("2 to fix");
  });

  it("counts only missing fields as 'missing'", () => {
    expect(getFieldsMeta([check("missing"), check("present")])).toBe(
      "1 missing",
    );
  });

  it("shows nothing when every field is present or not checked", () => {
    expect(getFieldsMeta([check("present"), check("present")])).toBeUndefined();
    expect(getFieldsMeta([check("not-checked")])).toBeUndefined();
  });
});

describe("getWarningLine", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("names a missing field", () => {
    expect(
      getWarningLine({ kind: "missing-field", field: "Client note" }),
    ).toBe("Missing field: Client note");
  });

  it("names a field that is an issue field and how to fix it", () => {
    expect(
      getWarningLine({ kind: "issue-field", field: "Client visibility" }),
    ).toBe("Client visibility is an issue field; add it as a project field");
  });

  it("lists a Milestone's due dates on their own days", () => {
    // formatDate drops the year only within the current year, so pin "now".
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-01T12:00:00Z"));

    expect(
      getWarningLine({
        kind: "milestone-date-mismatch",
        title: "Beta launch",
        dueDates: ["2026-11-14", "2026-11-21"],
      }),
    ).toBe(
      "Milestone 'Beta launch' has different due dates across repos: Nov 14, Nov 21",
    );
  });

  it("counts unreadable items, singular and plural", () => {
    expect(getWarningLine({ kind: "unreadable-items", count: 1 })).toBe(
      "1 item couldn't be read",
    );
    expect(getWarningLine({ kind: "unreadable-items", count: 3 })).toBe(
      "3 items couldn't be read",
    );
  });
});

describe("isHttpsUrl", () => {
  it("accepts an https URL", () => {
    expect(isHttpsUrl("https://github.com/orgs/neves-labs/projects/7")).toBe(
      true,
    );
  });

  it("refuses other schemes and malformed URLs", () => {
    expect(isHttpsUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpsUrl("http://github.com/orgs/neves-labs/projects/7")).toBe(
      false,
    );
    expect(isHttpsUrl("not a url")).toBe(false);
  });
});
