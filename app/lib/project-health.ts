import type { Status } from "@/components/ui/status-icon";
import type { Health } from "@/lib/client-projects/client-project-rules";

// Named project-health.ts: lib/health.ts is the /healthz check.
export const HEALTH_LABEL: Record<Health, string> = {
  ON_TRACK: "On track",
  AT_RISK: "At risk",
  OFF_TRACK: "Off track",
  COMPLETE: "Complete",
  INACTIVE: "Inactive",
};

export const HEALTH_TONE: Record<Health, Status> = {
  ON_TRACK: "ok",
  AT_RISK: "risk",
  OFF_TRACK: "off",
  COMPLETE: "done",
  INACTIVE: "idle",
};

// A Project with no Status Update has no health: it reads as idle.
export function getHealthTone(health: Health | null): Status {
  return health === null ? "idle" : HEALTH_TONE[health];
}
