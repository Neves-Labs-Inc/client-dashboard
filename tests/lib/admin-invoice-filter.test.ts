import { describe, expect, it } from "vitest";
import {
  getFilterBarSearch,
  INVOICE_FILTER_COPY,
  type InvoiceListForm,
  parseInvoiceListFilter,
  syncInvoiceDraft,
  toInvoiceListSearch,
} from "@/lib/admin-invoice-filter";

const CLIENT_ID = "0199f0a0-0000-7000-8000-000000000001";
const UNKNOWN_CLIENT_ID = "0199f0a0-0000-7000-8000-000000000002";
const KNOWN = { clientIds: [CLIENT_ID], years: [2026, 2025] };

const NO_FILTER_FORM: InvoiceListForm = {
  status: "all",
  clientId: null,
  issued: "any",
  from: "",
  to: "",
  q: "",
};

function parse(search: string): ReturnType<typeof parseInvoiceListFilter> {
  return parseInvoiceListFilter(new URLSearchParams(search), KNOWN);
}

describe("parseInvoiceListFilter", () => {
  it("applies no filter when no param is set", () => {
    expect(parse("")).toEqual({
      applied: {},
      form: NO_FILTER_FORM,
      rangeError: null,
    });
  });

  it("reads each status, Open including Overdue", () => {
    expect(parse("status=open").applied).toEqual({ status: "OPEN" });
    expect(parse("status=overdue").applied).toEqual({ status: "OVERDUE" });
    expect(parse("status=paid").applied).toEqual({ status: "PAID" });
    expect(parse("status=void")).toMatchObject({
      applied: { status: "VOID" },
      form: { status: "void" },
    });
  });

  it("treats an unknown status as All", () => {
    expect(parse("status=OPEN")).toMatchObject({
      applied: {},
      form: { status: "all" },
    });
    expect(parse("status=draft").applied).toEqual({});
  });

  it("reads a known Client, and ignores an unknown or non-UUID one", () => {
    expect(parse(`client=${CLIENT_ID}`)).toMatchObject({
      applied: { clientId: CLIENT_ID },
      form: { clientId: CLIENT_ID },
    });
    expect(parse(`client=${UNKNOWN_CLIENT_ID}`)).toMatchObject({
      applied: {},
      form: { clientId: null },
    });
    expect(parse("client=nope").applied).toEqual({});
  });

  it("trims the number search and cuts it to 20 characters", () => {
    expect(parse("q=%20%20nl-0042%20")).toMatchObject({
      applied: { numberQuery: "nl-0042" },
      form: { q: "nl-0042" },
    });
    expect(parse(`q=${"1234567890".repeat(3)}`)).toMatchObject({
      applied: { numberQuery: "12345678901234567890" },
      form: { q: "12345678901234567890" },
    });
    expect(parse("q=%20%20").applied).toEqual({});
  });

  it("reads a known year as Jan 1 through Dec 31", () => {
    expect(parse("issued=2025")).toMatchObject({
      applied: { issuedFrom: "2025-01-01", issuedTo: "2025-12-31" },
      form: { issued: "2025", from: "", to: "" },
    });
  });

  it("treats an unknown or malformed year as Any time", () => {
    expect(parse("issued=2019")).toMatchObject({
      applied: {},
      form: { issued: "any" },
    });
    expect(parse("issued=26").applied).toEqual({});
    expect(parse("issued=2026.0").applied).toEqual({});
  });

  it("reads a custom range, with either bound optional", () => {
    expect(parse("issued=custom&from=2026-03-01&to=2026-03-31")).toEqual({
      applied: { issuedFrom: "2026-03-01", issuedTo: "2026-03-31" },
      form: {
        ...NO_FILTER_FORM,
        issued: "custom",
        from: "2026-03-01",
        to: "2026-03-31",
      },
      rangeError: null,
    });
    expect(parse("issued=custom&from=2026-03-01").applied).toEqual({
      issuedFrom: "2026-03-01",
    });
    expect(parse("issued=custom&from=&to=2026-03-31").applied).toEqual({
      issuedTo: "2026-03-31",
    });
    expect(parse("issued=custom").applied).toEqual({});
  });

  it("allows a one-day range", () => {
    expect(parse("issued=custom&from=2026-03-01&to=2026-03-01")).toMatchObject({
      applied: { issuedFrom: "2026-03-01", issuedTo: "2026-03-01" },
      rangeError: null,
    });
  });

  it("drops a bad or impossible date bound", () => {
    expect(parse("issued=custom&from=2026-02-30&to=2026-03-31")).toMatchObject({
      applied: { issuedTo: "2026-03-31" },
      form: { from: "", to: "2026-03-31" },
    });
    expect(parse("issued=custom&from=03/01/2026").applied).toEqual({});
    expect(parse("issued=custom&to=2026-3-1").applied).toEqual({});
  });

  it("ignores from and to without issued=custom", () => {
    expect(parse("from=2026-03-01&to=2026-03-31")).toMatchObject({
      applied: {},
      form: { issued: "any", from: "", to: "" },
    });
    expect(parse("issued=2025&from=2025-03-01")).toMatchObject({
      applied: { issuedFrom: "2025-01-01", issuedTo: "2025-12-31" },
      form: { from: "" },
    });
  });

  it("drops both bounds when From is after To, keeping what was typed and the other filters", () => {
    expect(
      parse("issued=custom&from=2026-04-01&to=2026-03-31&status=paid"),
    ).toEqual({
      applied: { status: "PAID" },
      form: {
        ...NO_FILTER_FORM,
        status: "paid",
        issued: "custom",
        from: "2026-04-01",
        to: "2026-03-31",
      },
      rangeError: INVOICE_FILTER_COPY.rangeError,
    });
    expect(INVOICE_FILTER_COPY.rangeError).toBe(
      "From must be on or before To.",
    );
  });

  it("never reads the drawer toggle as a filter", () => {
    expect(parse("new=invoice")).toEqual(parse(""));
  });

  it("combines every filter", () => {
    expect(
      parse(`status=overdue&client=${CLIENT_ID}&issued=2026&q=42`).applied,
    ).toEqual({
      status: "OVERDUE",
      clientId: CLIENT_ID,
      issuedFrom: "2026-01-01",
      issuedTo: "2026-12-31",
      numberQuery: "42",
    });
  });
});

describe("toInvoiceListSearch", () => {
  it("is empty when no filter is set", () => {
    expect(toInvoiceListSearch(NO_FILTER_FORM)).toBe("");
  });

  it("writes only the set filters", () => {
    expect(
      toInvoiceListSearch({ ...NO_FILTER_FORM, status: "open", q: "42" }),
    ).toBe("?status=open&q=42");
    expect(
      toInvoiceListSearch({ ...NO_FILTER_FORM, clientId: CLIENT_ID }),
    ).toBe(`?client=${CLIENT_ID}`);
  });

  it("writes from and to only for a custom range, leaving out an empty bound", () => {
    expect(
      toInvoiceListSearch({
        ...NO_FILTER_FORM,
        issued: "2025",
        from: "2025-03-01",
        to: "2025-03-31",
      }),
    ).toBe("?issued=2025");
    expect(
      toInvoiceListSearch({
        ...NO_FILTER_FORM,
        issued: "custom",
        from: "",
        to: "2026-03-31",
      }),
    ).toBe("?issued=custom&to=2026-03-31");
  });

  it("round-trips through parseInvoiceListFilter", () => {
    const forms: InvoiceListForm[] = [
      NO_FILTER_FORM,
      {
        status: "overdue",
        clientId: CLIENT_ID,
        issued: "custom",
        from: "2026-01-01",
        to: "2026-03-31",
        q: "nl-0042 & 50%",
      },
      { ...NO_FILTER_FORM, status: "void", issued: "2026" },
    ];

    for (const form of forms) {
      expect(parse(toInvoiceListSearch(form)).form).toEqual(form);
    }
  });
});

describe("getFilterBarSearch", () => {
  const DRAFT: InvoiceListForm = {
    status: "all",
    clientId: null,
    issued: "custom",
    from: "2026-01-01",
    to: "2026-03-31",
    q: "42",
  };

  it("drops the typed dates when a year is picked, keeping the typed number", () => {
    expect(getFilterBarSearch(DRAFT, { issued: "2025" }, "all")).toBe(
      "?issued=2025&q=42",
    );
  });

  it("keeps the dates for a custom range", () => {
    expect(getFilterBarSearch(DRAFT, {}, "all")).toBe(
      "?issued=custom&from=2026-01-01&to=2026-03-31&q=42",
    );
  });

  it("applies on the given status tab, not the draft's", () => {
    expect(
      getFilterBarSearch(
        { ...DRAFT, status: "all" },
        { clientId: CLIENT_ID, issued: "any" },
        "overdue",
      ),
    ).toBe(`?status=overdue&client=${CLIENT_ID}&q=42`);
  });

  it("is empty when the change clears the last filter", () => {
    expect(
      getFilterBarSearch(
        { ...DRAFT, issued: "any", q: "" },
        { clientId: null },
        "all",
      ),
    ).toBe("");
  });
});

describe("syncInvoiceDraft", () => {
  const APPLIED: InvoiceListForm = {
    status: "open",
    clientId: null,
    issued: "any",
    from: "",
    to: "",
    q: "",
  };
  const TYPED = { ...APPLIED, q: "00" };

  it("keeps what was typed while the applied filter stays the same", () => {
    const state = { draft: TYPED, seededSearch: "?status=open" };

    expect(syncInvoiceDraft(state, APPLIED)).toBe(state);
  });

  it("re-seeds the controls from a new applied filter (a tab, Clear filters)", () => {
    const state = { draft: TYPED, seededSearch: "?status=open" };
    const cleared = { ...APPLIED, status: "all" as const };

    expect(syncInvoiceDraft(state, cleared)).toEqual({
      draft: cleared,
      seededSearch: "",
    });
  });
});
