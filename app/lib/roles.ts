import type { TeamMember } from "@/lib/auth/auth";

export const ROLE_LABEL: Record<TeamMember["role"], string> = {
  owner: "Owner",
  member: "Member",
};
