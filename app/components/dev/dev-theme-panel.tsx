import Panel from "@/components/ui/panel";
import ThemeToggle from "@/components/ui/theme-toggle";

export default function DevThemePanel(): React.ReactNode {
  return (
    <Panel id="theme" title="Theme">
      <div className="flex flex-col gap-4 p-3">
        <ThemeToggle />
        <div>
          <p className="mb-1.5 font-mono text-xs/4 text-fg-2 uppercase">
            Failure state
          </p>
          <ThemeToggle hasError />
        </div>
      </div>
    </Panel>
  );
}
