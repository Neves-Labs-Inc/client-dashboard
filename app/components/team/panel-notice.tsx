import StatusIcon from "@/components/ui/status-icon";

type PanelNoticeProps = {
  children: React.ReactNode;
};

// A Team panel's failure notice, under its header.
export default function PanelNotice({
  children,
}: PanelNoticeProps): React.ReactNode {
  return (
    <div
      role="alert"
      className="flex items-start gap-1.5 border-b border-line px-3 py-2 text-[13px]/5 text-fg"
    >
      <StatusIcon status="off" className="mt-1" />
      <p>{children}</p>
    </div>
  );
}
