import { Download, LogOut, Settings } from "lucide-react";
import { useState } from "react";
import Button from "@/components/ui/button";
import Drawer from "@/components/ui/drawer";
import Field from "@/components/ui/field";
import Input from "@/components/ui/input";
import Menu from "@/components/ui/menu";
import MenuHeader from "@/components/ui/menu-header";
import MenuItem from "@/components/ui/menu-item";
import MenuSeparator from "@/components/ui/menu-separator";
import Panel from "@/components/ui/panel";
import { toast } from "@/lib/toast";

const SUBMIT_DURATION_MS = 1000;
const DRAWER_ERROR = "Couldn't create the Client. Try again.";

type DevOverlaysPanelProps = {
  onClientCreated: () => void;
};

export default function DevOverlaysPanel({
  onClientCreated,
}: DevOverlaysPanelProps): React.ReactNode {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function openDrawer(withError: boolean): void {
    setName("");
    setError(withError ? DRAWER_ERROR : null);
    setIsOpen(true);
  }

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault();
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setIsOpen(false);
      toast("Client created");
      onClientCreated();
    }, SUBMIT_DURATION_MS);
  }

  return (
    <Panel id="overlays" title="Overlays">
      <div className="flex flex-wrap items-start gap-2 p-3">
        <Button onClick={() => toast("Changes saved")}>Show toast</Button>
        <Button onClick={() => openDrawer(false)}>Open drawer</Button>
        <Button onClick={() => openDrawer(true)}>Open drawer with error</Button>
        <Menu side="bottom" trigger={<Button>Open menu</Button>}>
          <MenuHeader>
            <p className="text-[13px]/5 font-semibold text-fg">Menu</p>
          </MenuHeader>
          <MenuItem icon={Settings}>Settings</MenuItem>
          <MenuItem icon={Download}>Export</MenuItem>
          <MenuItem disabled>Disabled item</MenuItem>
          <MenuSeparator />
          <MenuItem icon={LogOut}>Sign out</MenuItem>
        </Menu>
      </div>

      <Drawer
        open={isOpen}
        onOpenChange={setIsOpen}
        title="New client"
        error={error}
        isDirty={name.trim() !== ""}
        dirtyConfirm={{
          message: "Discard this client?",
          confirmLabel: "Discard",
          cancelLabel: "Keep editing",
        }}
        footer={({ requestClose }) => (
          <>
            <Button onClick={requestClose}>Cancel</Button>
            <Button
              variant="primary"
              type="submit"
              form="dev-drawer-form"
              isPending={isSubmitting}
              pendingLabel="Creating…"
            >
              Create client
            </Button>
          </>
        )}
      >
        <form id="dev-drawer-form" onSubmit={handleSubmit}>
          <Field label="Name">
            {(control) => (
              <Input
                {...control}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </Field>
        </form>
      </Drawer>
    </Panel>
  );
}
