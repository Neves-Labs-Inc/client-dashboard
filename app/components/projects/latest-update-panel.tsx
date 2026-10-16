import StatusUpdateBody from "@/components/projects/status-update-body";
import StatusUpdateMeta from "@/components/projects/status-update-meta";
import DateText from "@/components/ui/date-text";
import EmptyState from "@/components/ui/empty-state";
import Panel from "@/components/ui/panel";
import type { StatusUpdateView } from "@/lib/client-projects/client-projects";

type LatestUpdatePanelProps = {
  latest: StatusUpdateView | null;
};

export default function LatestUpdatePanel({
  latest,
}: LatestUpdatePanelProps): React.ReactNode {
  return (
    <Panel
      title="Latest update"
      meta={
        latest && (
          <>
            Posted <DateText date={latest.createdAt} />
          </>
        )
      }
    >
      {latest ? (
        <div className="flex flex-col gap-3 px-3 py-3">
          <StatusUpdateMeta
            health={latest.health}
            startDate={latest.startDate}
            targetDate={latest.targetDate}
          />
          <StatusUpdateBody body={latest.body} />
        </div>
      ) : (
        <EmptyState>No Status Update yet.</EmptyState>
      )}
    </Panel>
  );
}
