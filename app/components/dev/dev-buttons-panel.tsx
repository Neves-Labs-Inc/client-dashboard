import { Plus, X } from "lucide-react";
import { useState } from "react";
import Button from "@/components/ui/button";
import IconButton from "@/components/ui/icon-button";
import Panel from "@/components/ui/panel";

const VARIANTS = ["primary", "secondary", "ghost", "destructive"] as const;
const SAVE_DURATION_MS = 2000;

export default function DevButtonsPanel(): React.ReactNode {
  const [isSaving, setIsSaving] = useState(false);

  function handleSave(): void {
    setIsSaving(true);
    setTimeout(() => setIsSaving(false), SAVE_DURATION_MS);
  }

  return (
    <Panel id="buttons" title="Buttons">
      <div className="flex flex-col gap-3 p-3">
        {VARIANTS.map((variant) => (
          <div key={variant} className="flex flex-wrap items-center gap-2">
            <span className="w-24 font-mono text-xs/4 text-fg-2 uppercase">
              {variant}
            </span>
            <Button variant={variant}>Idle</Button>
            <Button variant={variant} icon={Plus}>
              With icon
            </Button>
            <Button variant={variant} isPending pendingLabel="Saving…">
              Save
            </Button>
            <Button variant={variant} disabled>
              Disabled
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-24 font-mono text-xs/4 text-fg-2 uppercase">
            Interactive
          </span>
          <Button
            variant="primary"
            isPending={isSaving}
            pendingLabel="Saving…"
            onClick={handleSave}
          >
            Save
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-24 font-mono text-xs/4 text-fg-2 uppercase">
            Icon buttons
          </span>
          <IconButton label="Add" icon={Plus} />
          <IconButton label="Close" icon={X} size="touch" />
        </div>
      </div>
    </Panel>
  );
}
