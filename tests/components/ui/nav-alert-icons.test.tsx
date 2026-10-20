import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import {
  getAlertLabels,
  getAlertsSpokenText,
  sortAlerts,
  type NavAlert,
} from "@/components/ui/nav-alert-icons";
import NavItem from "@/components/ui/nav-item";
import { TooltipProvider } from "@/components/ui/tooltip";

const SYNC: NavAlert = { kind: "sync-problem" };
const OVERDUE: NavAlert = { kind: "overdue-invoice" };

describe("sortAlerts", () => {
  it("puts New Requests before a sync problem", () => {
    const sorted = sortAlerts([SYNC, { kind: "new-requests", count: 3 }]);

    expect(sorted.map((alert) => alert.kind)).toEqual([
      "new-requests",
      "sync-problem",
    ]);
  });

  it("puts Overdue Invoices last, after New Requests and a sync problem", () => {
    const sorted = sortAlerts([
      OVERDUE,
      SYNC,
      { kind: "new-requests", count: 3 },
    ]);

    expect(sorted.map((alert) => alert.kind)).toEqual([
      "new-requests",
      "sync-problem",
      "overdue-invoice",
    ]);
  });
});

describe("getAlertLabels", () => {
  it("counts a single New Request in the singular", () => {
    expect(getAlertLabels([{ kind: "new-requests", count: 1 }])).toEqual([
      "1 New Request",
    ]);
  });

  it("counts several New Requests in the plural, then the sync problem", () => {
    expect(getAlertLabels([SYNC, { kind: "new-requests", count: 3 }])).toEqual([
      "3 New Requests",
      "Sync problem",
    ]);
  });

  it("lists Overdue Invoices last", () => {
    expect(
      getAlertLabels([OVERDUE, SYNC, { kind: "new-requests", count: 3 }]),
    ).toEqual(["3 New Requests", "Sync problem", "Overdue Invoices"]);
  });
});

describe("getAlertsSpokenText", () => {
  it("keeps New Requests capitalised and lowercases the sync problem", () => {
    expect(
      getAlertsSpokenText([SYNC, { kind: "new-requests", count: 3 }]),
    ).toBe(", 3 New Requests, sync problem");
  });

  it("speaks one New Request alone", () => {
    expect(getAlertsSpokenText([{ kind: "new-requests", count: 1 }])).toBe(
      ", 1 New Request",
    );
  });

  it("keeps Overdue Invoices capitalised, last", () => {
    expect(
      getAlertsSpokenText([OVERDUE, { kind: "new-requests", count: 3 }, SYNC]),
    ).toBe(", 3 New Requests, sync problem, Overdue Invoices");
  });
});

describe("a sidebar nav item with New Requests", () => {
  function render(alerts: NavAlert[]): string {
    return renderToStaticMarkup(
      <MemoryRouter>
        <TooltipProvider>
          <NavItem to="/admin/clients/acme" label="Acme Corp" alerts={alerts} />
        </TooltipProvider>
      </MemoryRouter>,
    );
  }

  it("names the row with the count and the sync problem", () => {
    const html = render([{ kind: "new-requests", count: 3 }, SYNC]);

    expect(html).toContain(
      'aria-label="Acme Corp, 3 New Requests, sync problem"',
    );
  });

  it("shows the count beside the inbox icon", () => {
    const html = render([{ kind: "new-requests", count: 3 }]);

    expect(html).toMatch(/lucide-inbox[\s\S]*>3<\/span>/);
  });

  it("shows the receipt icon, with no count, after inbox and sync", () => {
    const html = render([OVERDUE, SYNC, { kind: "new-requests", count: 3 }]);

    expect(html).toMatch(
      /lucide-inbox[\s\S]*lucide-refresh-cw-off[\s\S]*lucide-receipt/,
    );
    expect(html).toContain(
      'aria-label="Acme Corp, 3 New Requests, sync problem, Overdue Invoices"',
    );
  });
});
