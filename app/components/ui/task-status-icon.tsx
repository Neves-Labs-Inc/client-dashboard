import { Circle, CircleCheck, CircleDot, type LucideIcon } from "lucide-react";
import type { ClientStatus } from "@/lib/board-sync/board-sync";
import { cn } from "@/lib/utils";

type TaskStatusIconProps = {
  status: ClientStatus;
  size?: 14 | 16;
  className?: string;
};

export const TASK_STATUS_LABEL: Record<ClientStatus, string> = {
  UP_NEXT: "Up next",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

const ICONS: Record<ClientStatus, LucideIcon> = {
  UP_NEXT: Circle,
  IN_PROGRESS: CircleDot,
  DONE: CircleCheck,
};

// Neutral on purpose: Task status isn't health, and `ok` green would read as
// "On track". Decorative: the status word always sits next to it.
export default function TaskStatusIcon({
  status,
  size = 14,
  className,
}: TaskStatusIconProps): React.ReactNode {
  const Icon = ICONS[status];

  return (
    <Icon
      size={size}
      strokeWidth={2}
      aria-hidden="true"
      className={cn("shrink-0 text-fg-2", className)}
    />
  );
}
