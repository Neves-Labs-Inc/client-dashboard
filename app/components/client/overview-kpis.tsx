import { Suspense } from "react";
import { Await } from "react-router";
import InvoiceStatusIcon from "@/components/ui/invoice-status-icon";
import SkeletonGroup from "@/components/ui/skeleton-group";
import SummaryRow from "@/components/ui/summary-row";
import SummaryTile from "@/components/ui/summary-tile";
import SummaryTileSkeleton from "@/components/ui/summary-tile-skeleton";
import { useClientPaths } from "@/hooks/use-client-paths";
import type { ProjectSummary } from "@/lib/client-projects/client-projects";
import { getProjectKpis } from "@/lib/client-projects/client-project-rules";
import type { InvoiceSummary } from "@/lib/invoices/invoices";
import { formatMoney } from "@/lib/money";

const UNAVAILABLE = <span className="text-fg-2">—</span>;

type OverviewKpisProps = {
  // Null when the Projects couldn't load (the panel owns the error).
  projects: Promise<ProjectSummary[] | null>;
  // Null when the summary couldn't load.
  invoiceSummary: Promise<InvoiceSummary | null>;
};

// Each tile streams from its own promise, so a slow or failed one never
// holds or blanks the others. SummaryRow wraps each child, so each is one
// element.
export default function OverviewKpis({
  projects,
  invoiceSummary,
}: OverviewKpisProps): React.ReactNode {
  return (
    <SummaryRow label="Summary">
      <ProjectTile label="Active projects" projects={projects} />
      <ProjectTile label="On track" projects={projects} />
      <InvoiceTile label="Open balance" summary={invoiceSummary} />
      <InvoiceTile label="Overdue" summary={invoiceSummary} />
    </SummaryRow>
  );
}

type StreamedTileProps<T> = {
  label: string;
  promise: Promise<T | null>;
  children: (resolved: T | null) => React.ReactNode;
};

function StreamedTile<T>({
  label,
  promise,
  children,
}: StreamedTileProps<T>): React.ReactNode {
  return (
    <Suspense
      fallback={
        <SkeletonGroup label={label}>
          <SummaryTileSkeleton />
        </SkeletonGroup>
      }
    >
      <Await resolve={promise} errorElement={children(null)}>
        {children}
      </Await>
    </Suspense>
  );
}

function ProjectTile({
  label,
  projects,
}: {
  label: "Active projects" | "On track";
  projects: Promise<ProjectSummary[] | null>;
}): React.ReactNode {
  const paths = useClientPaths();

  return (
    <StreamedTile label={label} promise={projects}>
      {(summaries) => {
        const kpis = summaries && getProjectKpis(summaries);
        if (label === "Active projects") {
          return (
            <SummaryTile
              label={label}
              value={kpis ? kpis.active : UNAVAILABLE}
              srValue={kpis ? undefined : "unavailable"}
              href={paths.projects}
            />
          );
        }
        return (
          <SummaryTile
            label={label}
            value={kpis ? `${kpis.onTrack}/${kpis.active}` : UNAVAILABLE}
            srValue={
              kpis
                ? `${kpis.onTrack} of ${kpis.active} active Projects`
                : "unavailable"
            }
          />
        );
      }}
    </StreamedTile>
  );
}

function InvoiceTile({
  label,
  summary,
}: {
  label: "Open balance" | "Overdue";
  summary: Promise<InvoiceSummary | null>;
}): React.ReactNode {
  const paths = useClientPaths();

  return (
    <StreamedTile label={label} promise={summary}>
      {(resolved) => {
        if (label === "Open balance") {
          return (
            <SummaryTile
              label={label}
              value={
                resolved ? formatMoney(resolved.openBalanceCents) : UNAVAILABLE
              }
              srValue={resolved ? undefined : "unavailable"}
              href={paths.invoices}
            />
          );
        }
        const count = resolved?.overdueCount ?? 0;
        let value: React.ReactNode = count;
        if (!resolved) {
          value = UNAVAILABLE;
        } else if (count > 0) {
          value = (
            <span className="inline-flex h-7 items-center gap-1.5 align-top text-off">
              <InvoiceStatusIcon status="OVERDUE" size={16} />
              {count}
            </span>
          );
        }
        return (
          <SummaryTile
            label={label}
            value={value}
            srValue={resolved ? undefined : "unavailable"}
          />
        );
      }}
    </StreamedTile>
  );
}
