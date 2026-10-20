import { describe, expect, it } from "vitest";
import {
  getRefusalBanner,
  getRefusalCopy,
  getStatusIntents,
} from "@/lib/admin-invoice-status";

describe("getStatusIntents", () => {
  it("offers Mark paid and Void on an Open or Overdue Invoice", () => {
    expect(getStatusIntents("OPEN", false)).toEqual(["paid", "void"]);
    expect(getStatusIntents("OVERDUE", false)).toEqual(["paid", "void"]);
  });

  it("offers only Revert on a Paid Invoice, never Void", () => {
    expect(getStatusIntents("PAID", false)).toEqual(["revert"]);
  });

  it("offers nothing on a Void Invoice", () => {
    expect(getStatusIntents("VOID", false)).toEqual([]);
  });

  it("offers nothing on an archived Client's Invoice, whatever its status", () => {
    for (const status of ["OPEN", "OVERDUE", "PAID", "VOID"] as const) {
      expect(getStatusIntents(status, true)).toEqual([]);
    }
  });
});

describe("getRefusalCopy", () => {
  it("says a Mark paid's Invoice is no longer Open", () => {
    expect(getRefusalCopy("paid", "not-open")).toBe(
      "This Invoice is no longer Open.",
    );
  });

  it("says only an Open Invoice can be voided", () => {
    expect(getRefusalCopy("void", "not-open")).toBe(
      "Only an Open Invoice can be voided.",
    );
  });

  it("says a Revert's Invoice is no longer Paid", () => {
    expect(getRefusalCopy("revert", "not-paid")).toBe(
      "This Invoice is no longer Paid.",
    );
  });

  it("says an archived Client's Invoices are read-only, for every change", () => {
    for (const intent of ["paid", "revert", "void"] as const) {
      expect(getRefusalCopy(intent, "archived")).toBe(
        "This Client is archived; its Invoices are read-only.",
      );
    }
  });
});

describe("getRefusalBanner", () => {
  const ARCHIVED = "This Client is archived; its Invoices are read-only.";

  it("drops the archived refusal where the archived note already says it", () => {
    expect(getRefusalBanner(ARCHIVED, true)).toBeNull();
  });

  it("keeps the archived refusal where no note says it", () => {
    expect(getRefusalBanner(ARCHIVED, false)).toBe(ARCHIVED);
  });

  it("keeps any other refusal beside the archived note", () => {
    expect(getRefusalBanner("This Invoice is no longer Open.", true)).toBe(
      "This Invoice is no longer Open.",
    );
  });

  it("shows nothing without a refusal", () => {
    expect(getRefusalBanner(null, true)).toBeNull();
  });
});
