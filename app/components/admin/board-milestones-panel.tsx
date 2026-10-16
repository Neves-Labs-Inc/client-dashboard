import DateText from "@/components/ui/date-text";
import EmptyState from "@/components/ui/empty-state";
import Panel from "@/components/ui/panel";
import ProgressBar from "@/components/ui/progress-bar";
import type { Status } from "@/components/ui/status-icon";
import { BOARD_DETAIL_COPY } from "@/lib/board-detail";
import type { BoardMilestone } from "@/lib/board-sync/board-sync";
import { parseDateOnly } from "@/lib/format-date";
import { cn } from "@/lib/utils";

type BoardMilestonesPanelProps = {
  milestones: BoardMilestone[];
  // The Project's latest health, as the Client's bars show it.
  tone: Status;
};

// Below md: name | done/total, then the bar, then the due date. From md one
// line: name | bar | done/total | due.
export default function BoardMilestonesPanel({
  milestones,
  tone,
}: BoardMilestonesPanelProps): React.ReactNode {
  return (
    <Panel title="Milestones">
      {milestones.length === 0 ? (
        <EmptyState>{BOARD_DETAIL_COPY.noMilestones}</EmptyState>
      ) : (
        <ul>
          {milestones.map((milestone) => (
            <li
              key={milestone.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-1.5 border-t border-line px-3 py-2 first:border-t-0 md:grid-cols-[minmax(0,3fr)_minmax(120px,2fr)_56px_88px] md:items-center md:gap-x-3 lg:grid-cols-[minmax(0,1fr)_minmax(140px,240px)_56px_88px]"
            >
              <span className="col-start-1 row-start-1 text-[13px]/5 wrap-anywhere text-fg md:col-auto md:row-auto">
                {milestone.title}
              </span>
              <ProgressBar
                percent={milestone.progress.percent}
                tone={tone}
                label={`${milestone.title} progress`}
                className="col-span-full row-start-2 md:col-span-1 md:row-auto"
              />
              <span className="col-start-2 row-start-1 text-right font-mono text-[13px]/5 text-fg tabular-nums md:col-auto md:row-auto">
                {milestone.progress.done}/{milestone.progress.total}
                <span className="sr-only"> Tasks done</span>
              </span>
              <span
                className={cn(
                  "col-span-full row-start-3 font-mono text-xs/4 text-fg-2 md:col-span-1 md:row-auto",
                  milestone.dueDate === null && "max-md:hidden",
                )}
              >
                {milestone.dueDate !== null && (
                  <>
                    due <DateText date={parseDateOnly(milestone.dueDate)} />
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
