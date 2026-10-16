import { useState } from "react";
import DevButtonsPanel from "@/components/dev/dev-buttons-panel";
import DevFieldsPanel from "@/components/dev/dev-fields-panel";
import DevHealthPanel from "@/components/dev/dev-health-panel";
import DevOverlaysPanel from "@/components/dev/dev-overlays-panel";
import DevShell from "@/components/dev/dev-shell";
import DevStatesPanel from "@/components/dev/dev-states-panel";
import DevSummaryPanel from "@/components/dev/dev-summary-panel";
import DevTaskStatusPanel from "@/components/dev/dev-task-status-panel";
import DevTablePanels from "@/components/dev/dev-table-panels";
import DevThemePanel from "@/components/dev/dev-theme-panel";
import Button from "@/components/ui/button";
import PageHeader from "@/components/ui/page-header";
import { toast } from "@/lib/toast";

// Dev only: routes.ts leaves this out of production builds. No Route types, so
// typegen doesn't depend on whether the route is registered.
export function meta(): { title: string }[] {
  return [{ title: "Components · Neves Labs dev" }];
}

export default function DevComponents(): React.ReactNode {
  const [highlightTick, setHighlightTick] = useState(0);
  const replayHighlight = (): void => setHighlightTick((tick) => tick + 1);

  return (
    <DevShell>
      <PageHeader
        breadcrumb={[{ label: "Dev" }, { label: "Components" }]}
        title="Components"
        action={
          <Button variant="primary" onClick={() => toast("Changes saved")}>
            Show toast
          </Button>
        }
      />
      <DevButtonsPanel />
      <DevFieldsPanel />
      <div className="grid gap-4 xl:grid-cols-2">
        <DevTablePanels
          highlightTick={highlightTick}
          onReplayHighlight={replayHighlight}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <DevOverlaysPanel onClientCreated={replayHighlight} />
        <DevThemePanel />
      </div>
      <DevStatesPanel />
      <DevHealthPanel />
      <DevSummaryPanel />
      <DevTaskStatusPanel />
    </DevShell>
  );
}
