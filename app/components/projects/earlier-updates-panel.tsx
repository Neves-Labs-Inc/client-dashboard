import StatusUpdateBody from "@/components/projects/status-update-body";
import StatusUpdateMeta from "@/components/projects/status-update-meta";
import DateText from "@/components/ui/date-text";
import Panel from "@/components/ui/panel";
import type { StatusUpdateView } from "@/lib/client-projects/client-projects";

type EarlierUpdatesPanelProps = {
  // Newest first.
  earlier: StatusUpdateView[];
};

// The timeline under the latest update; absent when there's nothing earlier.
export default function EarlierUpdatesPanel({
  earlier,
}: EarlierUpdatesPanelProps): React.ReactNode {
  if (earlier.length === 0) return null;

  const count = `${earlier.length} ${earlier.length === 1 ? "update" : "updates"}`;

  return (
    <Panel title="Earlier updates" meta={count}>
      <ol className="flex flex-col gap-5 px-3 py-3">
        {earlier.map((update) => (
          <li
            key={update.id}
            className="relative pl-5 before:absolute before:top-2 before:-bottom-5 before:left-1 before:w-px before:-translate-x-1/2 before:bg-line last:before:bottom-0"
          >
            <span
              aria-hidden="true"
              className="absolute top-1.5 left-0 size-2 rounded-[1px] bg-line-strong"
            />
            <h3 className="text-xs/4 font-medium text-fg">
              <DateText date={update.createdAt} />
            </h3>
            <div className="mt-1.5 empty:hidden">
              <StatusUpdateMeta
                health={update.health}
                startDate={update.startDate}
                targetDate={update.targetDate}
              />
            </div>
            <StatusUpdateBody body={update.body} className="mt-2" />
          </li>
        ))}
      </ol>
    </Panel>
  );
}
