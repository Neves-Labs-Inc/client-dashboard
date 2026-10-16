import { Suspense } from "react";
import { Await } from "react-router";
import SkeletonGroup from "@/components/ui/skeleton-group";
import SummaryRow from "@/components/ui/summary-row";
import SummaryRowSkeleton from "@/components/ui/summary-row-skeleton";
import SummaryTile from "@/components/ui/summary-tile";
import type { ProjectSummary } from "@/lib/client-projects/client-projects";
import { getProjectKpis } from "@/lib/client-projects/client-project-rules";

const PROJECTS_PATH = "/projects";
const TILE_COUNT = 2;
const UNAVAILABLE = <span className="text-fg-2">—</span>;

type OverviewKpisProps = {
  // Null when the Projects couldn't load (the panel owns the error).
  projects: Promise<ProjectSummary[] | null>;
};

export default function OverviewKpis({
  projects,
}: OverviewKpisProps): React.ReactNode {
  return (
    <Suspense
      fallback={
        <SkeletonGroup label="summary">
          <SummaryRowSkeleton count={TILE_COUNT} />
        </SkeletonGroup>
      }
    >
      <Await resolve={projects} errorElement={<Tiles summaries={null} />}>
        {(resolved) => <Tiles summaries={resolved} />}
      </Await>
    </Suspense>
  );
}

function Tiles({
  summaries,
}: {
  summaries: ProjectSummary[] | null;
}): React.ReactNode {
  const kpis = summaries && getProjectKpis(summaries);

  return (
    <SummaryRow label="Summary">
      <SummaryTile
        label="Active projects"
        value={kpis ? kpis.active : UNAVAILABLE}
        srValue={kpis ? undefined : "unavailable"}
        href={PROJECTS_PATH}
      />
      <SummaryTile
        label="On track"
        value={kpis ? `${kpis.onTrack}/${kpis.active}` : UNAVAILABLE}
        srValue={
          kpis
            ? `${kpis.onTrack} of ${kpis.active} active Projects`
            : "unavailable"
        }
      />
    </SummaryRow>
  );
}
