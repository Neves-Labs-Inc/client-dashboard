import { describe, expect, it } from "vitest";
import { getInvoicesBackPath } from "@/lib/admin-invoices";

describe("the global Invoice detail's back path", () => {
  it("restores the list search the row link carried", () => {
    expect(getInvoicesBackPath({ fromListSearch: "?status=open&q=42" })).toBe(
      "/admin/invoices?status=open&q=42",
    );
  });

  it("is the plain list on a direct visit", () => {
    expect(getInvoicesBackPath(null)).toBe("/admin/invoices");
    expect(getInvoicesBackPath({ fromInvoiceId: "x" })).toBe("/admin/invoices");
  });

  it("is the plain list for an unfiltered list", () => {
    expect(getInvoicesBackPath({ fromListSearch: "" })).toBe("/admin/invoices");
  });

  it("ignores anything but a search, so the link stays on the list", () => {
    expect(getInvoicesBackPath({ fromListSearch: "//evil.test" })).toBe(
      "/admin/invoices",
    );
    expect(getInvoicesBackPath({ fromListSearch: "/x" })).toBe(
      "/admin/invoices",
    );
    expect(getInvoicesBackPath({ fromListSearch: 42 })).toBe("/admin/invoices");
  });
});
