import Panel from "@/components/ui/panel";
import StatusIcon, { type Status } from "@/components/ui/status-icon";
import { BOARD_DETAIL_COPY, getFieldsMeta } from "@/lib/board-detail";
import type { BoardDetail, FieldCheck } from "@/lib/board-sync/board-sync";
import { cn } from "@/lib/utils";

const CHECK_DISPLAY: Record<
  FieldCheck,
  { status: Status; label: string; textClass: string }
> = {
  present: {
    status: "ok",
    label: BOARD_DETAIL_COPY.present,
    textClass: "text-fg",
  },
  missing: {
    status: "off",
    label: BOARD_DETAIL_COPY.missing,
    textClass: "text-fg",
  },
  "issue-field": {
    status: "off",
    label: BOARD_DETAIL_COPY.issueField,
    textClass: "text-fg",
  },
  "not-checked": {
    status: "idle",
    label: BOARD_DETAIL_COPY.notChecked,
    textClass: "text-fg-2",
  },
};

// The board fields the sync reads: present, missing, an issue field, or not
// checked yet (never synced).
export default function BoardRequiredFieldsPanel({
  fieldChecks,
}: {
  fieldChecks: BoardDetail["fieldChecks"];
}): React.ReactNode {
  return (
    <Panel title="Required fields" meta={getFieldsMeta(fieldChecks)}>
      <ul>
        {fieldChecks.map(({ field, check }) => {
          const display = CHECK_DISPLAY[check];
          return (
            <li
              key={field}
              className="flex min-h-10 items-center justify-between gap-3 border-t border-line px-3 py-2 text-[13px]/5 first:border-t-0"
            >
              <span className="text-fg">{field}</span>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 whitespace-nowrap",
                  display.textClass,
                )}
              >
                <StatusIcon status={display.status} size={12} />
                {display.label}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
