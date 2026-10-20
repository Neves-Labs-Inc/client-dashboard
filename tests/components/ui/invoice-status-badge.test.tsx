import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import InvoiceStatusBadge, {
  type InvoiceDisplayStatus,
} from "@/components/ui/invoice-status-badge";
import Money from "@/components/ui/money";

const LABELS: [InvoiceDisplayStatus, string][] = [
  ["OPEN", "Open"],
  ["PAID", "Paid"],
  ["OVERDUE", "Overdue"],
  ["VOID", "Void"],
];

describe("the invoice status badge", () => {
  it.each(LABELS)("shows the word for %s", (status, label) => {
    const html = renderToStaticMarkup(<InvoiceStatusBadge status={status} />);

    expect(html).toContain(`>${label}</span>`);
  });

  it.each(LABELS)("hides the %s icon from assistive tech", (status) => {
    const html = renderToStaticMarkup(<InvoiceStatusBadge status={status} />);

    expect(html).toContain('<svg viewBox="0 0 16 16"');
    expect(html).toContain('aria-hidden="true"');
  });

  it("draws Void with a dashed border and no fill", () => {
    const html = renderToStaticMarkup(<InvoiceStatusBadge status="VOID" />);

    expect(html).toContain("border-dashed");
    expect(html).toContain("bg-transparent");
  });
});

describe("money", () => {
  it("renders the formatted amount in tabular mono", () => {
    const html = renderToStaticMarkup(<Money cents={-5000} />);

    expect(html).toContain("-$50.00");
    expect(html).toContain("font-mono");
    expect(html).toContain("tabular-nums");
  });
});
