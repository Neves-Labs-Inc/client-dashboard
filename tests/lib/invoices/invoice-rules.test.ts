import { describe, expect, it } from "vitest";
import {
  getDefaultDueDate,
  getDisplayStatus,
  getToday,
  type InvoiceDraft,
  isOverdue,
  parseAmount,
  validateInvoiceDraft,
  validatePaidDate,
} from "@/lib/invoices/invoice-rules";

const TODAY = "2026-10-19";
const PROJECT_ID = "0199f0a0-0000-7000-8000-000000000001";
const VALID_DRAFT: InvoiceDraft = {
  issueDate: "2026-10-01",
  dueDate: "2026-10-31",
  projectId: null,
  memo: "",
  lineItems: [{ description: "Design work", amount: "1,250.00" }],
};

function validate(
  draft: Partial<InvoiceDraft>,
  projectIds: string[] = [],
): ReturnType<typeof validateInvoiceDraft> {
  return validateInvoiceDraft({ ...VALID_DRAFT, ...draft }, projectIds, TODAY);
}

function getFieldErrors(
  draft: Partial<InvoiceDraft>,
  projectIds: string[] = [],
): Record<string, string> {
  const validation = validate(draft, projectIds);
  return validation.isValid ? {} : validation.fieldErrors;
}

describe("getToday", () => {
  it("is the New York date, a day behind UTC between UTC and New York midnight", () => {
    expect(getToday(new Date("2026-10-20T02:00:00Z"))).toBe("2026-10-19");
    expect(getToday(new Date("2026-10-20T04:00:00Z"))).toBe("2026-10-20");
  });

  it("follows New York's winter offset", () => {
    expect(getToday(new Date("2026-01-15T04:59:00Z"))).toBe("2026-01-14");
    expect(getToday(new Date("2026-01-15T05:00:00Z"))).toBe("2026-01-15");
  });
});

describe("getDefaultDueDate", () => {
  it("is 30 calendar days after the issue date", () => {
    expect(getDefaultDueDate("2026-10-01")).toBe("2026-10-31");
  });

  it("crosses month, leap-day and year ends", () => {
    expect(getDefaultDueDate("2028-02-10")).toBe("2028-03-11");
    expect(getDefaultDueDate("2026-12-15")).toBe("2027-01-14");
  });

  it("is empty for an empty or malformed issue date, so the drawer can clear the due date", () => {
    expect(getDefaultDueDate("")).toBe("");
    expect(getDefaultDueDate("2026-02-30")).toBe("");
  });
});

describe("isOverdue and getDisplayStatus", () => {
  it("is not Overdue on the due date itself", () => {
    expect(isOverdue("OPEN", TODAY, TODAY)).toBe(false);
    expect(getDisplayStatus("OPEN", TODAY, TODAY)).toBe("OPEN");
  });

  it("is Overdue when Open and due before today", () => {
    expect(isOverdue("OPEN", "2026-10-18", TODAY)).toBe(true);
    expect(getDisplayStatus("OPEN", "2026-10-18", TODAY)).toBe("OVERDUE");
  });

  it("never makes a Paid or Void Invoice Overdue", () => {
    expect(getDisplayStatus("PAID", "2026-01-01", TODAY)).toBe("PAID");
    expect(getDisplayStatus("VOID", "2026-01-01", TODAY)).toBe("VOID");
  });
});

describe("parseAmount", () => {
  it.each([
    ["1,250.00", 125_000],
    [" 1250 ", 125_000],
    ["0.1", 10],
    ["0.29", 29],
    ["19.99", 1_999],
    ["-300.5", -30_050],
    ["1,000,000.00", 100_000_000],
  ])("reads %j as %i cents", (text, cents) => {
    expect(parseAmount(text)).toEqual({ isValid: true, cents });
  });

  it("calls blank text empty", () => {
    expect(parseAmount("   ")).toEqual({ isValid: false, error: "empty" });
  });

  it.each(["abc", "1.234", "$5", "1e3", "+5", ".5", "5.", "1 000"])(
    "refuses %j as malformed",
    (text) => {
      expect(parseAmount(text)).toEqual({ isValid: false, error: "format" });
    },
  );
});

describe("validateInvoiceDraft", () => {
  it("accepts a valid draft, trimming text and turning an empty memo to null", () => {
    const validation = validate(
      {
        projectId: PROJECT_ID,
        memo: "   ",
        lineItems: [
          { description: "  Design work ", amount: "1,250.00" },
          { description: "Credit", amount: "-250" },
        ],
      },
      [PROJECT_ID],
    );

    expect(validation).toEqual({
      isValid: true,
      draft: {
        issueDate: "2026-10-01",
        dueDate: "2026-10-31",
        projectId: PROJECT_ID,
        memo: null,
        lineItems: [
          { description: "Design work", amountCents: 125_000 },
          { description: "Credit", amountCents: -25_000 },
        ],
      },
    });
  });

  it("requires the issue and due dates, a malformed one counting as missing", () => {
    expect(getFieldErrors({ issueDate: "", dueDate: "2026-02-30" })).toEqual({
      issueDate: "Enter an issue date.",
      dueDate: "Enter a due date.",
    });
  });

  it("treats year 0000, which Postgres rejects, as a missing date", () => {
    expect(
      getFieldErrors({ issueDate: "0000-01-01", dueDate: "0000-01-31" }),
    ).toEqual({
      issueDate: "Enter an issue date.",
      dueDate: "Enter a due date.",
    });
    expect(validatePaidDate("0000-01-01", "2026-10-01", TODAY)).toBe(
      "Enter the paid date.",
    );
  });

  it("refuses an issue date after today, and allows today", () => {
    expect(getFieldErrors({ issueDate: "2026-10-20" })).toEqual({
      issueDate: "The issue date can't be in the future.",
    });
    expect(validate({ issueDate: TODAY }).isValid).toBe(true);
  });

  it("refuses a due date before the issue date, and allows the same day", () => {
    expect(getFieldErrors({ dueDate: "2026-09-30" })).toEqual({
      dueDate: "The due date can't be before the issue date.",
    });
    expect(validate({ dueDate: "2026-10-01" }).isValid).toBe(true);
  });

  it("requires one to fifty Line Items", () => {
    const line = { description: "Design work", amount: "10" };

    expect(getFieldErrors({ lineItems: [] })).toEqual({
      lineItems: "Add at least one line item.",
    });
    expect(getFieldErrors({ lineItems: Array(51).fill(line) })).toEqual({
      lineItems: "Keep it to 50 line items.",
    });
    expect(validate({ lineItems: Array(50).fill(line) }).isValid).toBe(true);
  });

  it("puts description errors on their line", () => {
    expect(
      getFieldErrors({
        lineItems: [
          { description: "Design work", amount: "10" },
          { description: "  ", amount: "10" },
          { description: "a".repeat(201), amount: "10" },
        ],
      }),
    ).toEqual({
      "lineItems.1.description": "Describe this line.",
      "lineItems.2.description": "Keep the description under 200 characters.",
    });
    expect(
      validate({ lineItems: [{ description: "a".repeat(200), amount: "10" }] })
        .isValid,
    ).toBe(true);
  });

  it("puts amount errors on their line", () => {
    expect(
      getFieldErrors({
        lineItems: [
          { description: "Design work", amount: "5000" },
          { description: "Empty", amount: " " },
          { description: "Malformed", amount: "12.345" },
          { description: "Zero", amount: "0.00" },
          { description: "Too big", amount: "1,000,000.01" },
          { description: "Too small", amount: "-1000000.01" },
        ],
      }),
    ).toEqual({
      "lineItems.1.amount": "Enter an amount.",
      "lineItems.2.amount": "Enter an amount like 1,250.00.",
      "lineItems.3.amount": "The amount can't be zero.",
      "lineItems.4.amount": "Keep each amount under $1,000,000.",
      "lineItems.5.amount": "Keep each amount under $1,000,000.",
    });
  });

  it("requires a total above zero once every amount reads", () => {
    expect(
      getFieldErrors({
        lineItems: [
          { description: "Work", amount: "100" },
          { description: "Credit", amount: "-100" },
        ],
      }),
    ).toEqual({ total: "The total must be more than $0.00." });
    expect(
      getFieldErrors({ lineItems: [{ description: "Credit", amount: "-5" }] }),
    ).toEqual({ total: "The total must be more than $0.00." });
  });

  it("allows 2,000 memo characters and refuses more", () => {
    expect(validate({ memo: "m".repeat(2000) }).isValid).toBe(true);
    expect(getFieldErrors({ memo: "m".repeat(2001) })).toEqual({
      memo: "Keep the memo under 2,000 characters.",
    });
  });

  it("counts an emoji as one character, as Postgres does", () => {
    expect(validate({ memo: "😀".repeat(2000) }).isValid).toBe(true);
  });

  it("accepts no Project or one of the Client's, and refuses any other", () => {
    expect(validate({ projectId: "" }).isValid).toBe(true);
    expect(getFieldErrors({ projectId: PROJECT_ID }, [])).toEqual({
      projectId: "Choose a project from the list.",
    });
  });
});

describe("validatePaidDate", () => {
  const ISSUE_DATE = "2026-10-01";

  it("accepts the issue date through today", () => {
    expect(validatePaidDate(ISSUE_DATE, ISSUE_DATE, TODAY)).toBeNull();
    expect(validatePaidDate(TODAY, ISSUE_DATE, TODAY)).toBeNull();
  });

  it("refuses a missing, early or future paid date", () => {
    expect(validatePaidDate("", ISSUE_DATE, TODAY)).toBe(
      "Enter the paid date.",
    );
    expect(validatePaidDate("not-a-date", ISSUE_DATE, TODAY)).toBe(
      "Enter the paid date.",
    );
    expect(validatePaidDate("2026-09-30", ISSUE_DATE, TODAY)).toBe(
      "The paid date can't be before the issue date.",
    );
    expect(validatePaidDate("2026-10-20", ISSUE_DATE, TODAY)).toBe(
      "The paid date can't be in the future.",
    );
  });
});
