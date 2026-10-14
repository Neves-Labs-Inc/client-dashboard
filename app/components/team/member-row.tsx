import { useId } from "react";
import Button from "@/components/ui/button";
import { SUBGRID_ROW_CLASS } from "@/components/ui/data-table";
import DataTableCell from "@/components/ui/data-table-cell";
import DataTableRow from "@/components/ui/data-table-row";
import { useMemberRow } from "@/hooks/use-member-row";
import type { TeamMember } from "@/lib/auth/auth";
import { ROLE_LABEL } from "@/lib/roles";
import { getRemovePrompt, ROSTER_COPY } from "@/lib/team-roster";
import { cn } from "@/lib/utils";

// The read-only table's tracks from md. Below md (every variant): name over
// email on the left, role on the right across both lines.
export const TABLE_GRID_CLASS =
  "md:grid-cols-[minmax(140px,1fr)_minmax(180px,1.4fr)_96px]";
export const MOBILE_GRID_CLASS =
  "grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-0.5 md:gap-x-3 md:gap-y-3";
// Shared with the Users skeleton, so its rows can't drift from these.
export const ROW_GRID_CLASS = `${MOBILE_GRID_CLASS} ${TABLE_GRID_CLASS}`;
// The managed table adds an actions column from lg, sized once for every
// row: the rows are subgrids of it. Between md and lg the sidebar leaves no
// room for it beside Name and Email at their minimums, so the actions take
// their own line under the row there, right-aligned.
export const MANAGED_TABLE_GRID_CLASS =
  "md:grid-cols-[minmax(140px,1fr)_minmax(180px,1.4fr)_96px] lg:grid-cols-[minmax(140px,1fr)_minmax(180px,1.4fr)_96px_auto]";
export const MANAGED_ROW_GRID_CLASS = `${MOBILE_GRID_CLASS} ${SUBGRID_ROW_CLASS}`;
// The actions column's header: out of the header's flow until lg.
export const ACTIONS_HEADER_CLASS = "md:max-lg:absolute";
// A squeezed actions cell wraps between its buttons, never inside a label.
const NO_WRAP = "whitespace-nowrap";
// Below md the actions take a third line, below lg their own line; from lg,
// a right-aligned column capped so an open confirm wraps instead of
// squeezing Name and Email.
export const ACTIONS_CELL_CLASS =
  "col-span-2 row-start-3 mt-1.5 md:col-span-full md:row-auto md:mt-0 lg:col-auto lg:max-w-64";

// self: the Owner's own row ("You", no actions). managed: an Owner's or the
// Admin's view of anyone else. read-only: a Member's view, no actions cell.
export type MemberRowVariant = "self" | "managed" | "read-only";

type MemberRowProps = {
  member: TeamMember;
  variant: MemberRowVariant;
  clientName: string;
  // A managed row's "Make Owner" / "Make Member" (not on an archived
  // Client).
  canChangeRole: boolean;
  // The route the row's actions post to.
  action: string;
  isHighlighted: boolean;
  isConfirming: boolean;
  onConfirmingChange: (isConfirming: boolean) => void;
  onNotice: (message: string | null) => void;
  onRoleChanged: (userId: string) => void;
  onRowGone: (userId: string) => void;
};

// Long names and emails wrap: no truncation hides who you're about to
// remove.
export default function MemberRow({
  member,
  variant,
  ...actions
}: MemberRowProps): React.ReactNode {
  const name = member.name.trim();
  const isReadOnly = variant === "read-only";

  return (
    <DataTableRow
      gridClassName={isReadOnly ? ROW_GRID_CLASS : MANAGED_ROW_GRID_CLASS}
      isHighlighted={actions.isHighlighted}
    >
      {/* No name: the email stands in, once, in fg-2. */}
      <DataTableCell className="col-start-1 row-start-1 flex items-baseline text-[13px]/5 md:col-auto md:row-auto">
        <span
          className={cn(
            "min-w-0 wrap-anywhere",
            name ? "font-medium text-fg" : "text-fg-2",
          )}
        >
          {name || member.email}
        </span>
        {variant === "self" && (
          <span className="ml-1.5 shrink-0 font-mono text-xs/4 text-fg-2">
            You
          </span>
        )}
      </DataTableCell>
      <DataTableCell
        className={cn(
          "col-start-1 row-start-2 text-[13px]/5 wrap-anywhere text-fg-2 md:col-auto md:row-auto",
          !name && "max-md:sr-only",
        )}
      >
        {member.email}
      </DataTableCell>
      <DataTableCell className="col-start-2 row-span-2 row-start-1 self-start text-[13px]/5 text-fg md:col-auto md:row-auto md:self-auto">
        {ROLE_LABEL[member.role]}
      </DataTableCell>
      {/* Kept empty on the own row, so the grid and the cell count hold. */}
      {variant === "self" && (
        <DataTableCell className="max-lg:sr-only">{null}</DataTableCell>
      )}
      {variant === "managed" && <MemberActions member={member} {...actions} />}
    </DataTableRow>
  );
}

type MemberActionsProps = Omit<MemberRowProps, "variant" | "isHighlighted">;

function MemberActions({
  member,
  clientName,
  canChangeRole,
  action,
  isConfirming,
  onConfirmingChange,
  onNotice,
  onRoleChanged,
  onRowGone,
}: MemberActionsProps): React.ReactNode {
  const promptId = useId();
  const row = useMemberRow({
    member,
    clientName,
    action,
    isConfirming,
    onConfirmingChange,
    onNotice,
    onRoleChanged,
    onRowGone,
  });

  return (
    <DataTableCell className={ACTIONS_CELL_CLASS}>
      {isConfirming ? (
        <div
          role="group"
          aria-labelledby={promptId}
          onKeyDown={row.handleConfirmKeyDown}
          className="flex animate-in flex-wrap items-center gap-2 duration-(--dur-base) ease-out fade-in-0 motion-reduce:duration-(--dur-instant) md:justify-end"
        >
          <p
            id={promptId}
            className="w-full text-[13px]/5 wrap-anywhere text-fg md:text-right"
          >
            {getRemovePrompt(member)}
          </p>
          <Button
            variant="destructive"
            className={NO_WRAP}
            isPending={row.isRemoving}
            pendingLabel={ROSTER_COPY.removing}
            onClick={row.handleRemove}
          >
            {ROSTER_COPY.remove}
          </Button>
          <Button
            autoFocus
            className={NO_WRAP}
            disabled={row.isRemoving}
            onClick={row.handleKeep}
          >
            {ROSTER_COPY.keep}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 md:justify-end">
          {canChangeRole && (
            <Button
              className={NO_WRAP}
              isPending={row.isSaving}
              pendingLabel={ROSTER_COPY.saving}
              onClick={row.handleRoleChange}
            >
              <RoleLabel isOwner={member.role === "owner"} />
            </Button>
          )}
          <Button
            ref={row.removeRef}
            variant="destructive"
            className={NO_WRAP}
            disabled={row.isSaving}
            onClick={row.handleStartRemove}
          >
            {ROSTER_COPY.remove}
          </Button>
        </div>
      )}
    </DataTableCell>
  );
}

// Both labels share one grid cell, so the button keeps its width when a
// role change flips it, and lines up across rows.
function RoleLabel({ isOwner }: { isOwner: boolean }): React.ReactNode {
  return (
    <span className="grid *:[grid-area:1/1]">
      <span className={cn(isOwner && "invisible")} aria-hidden={isOwner}>
        {ROSTER_COPY.makeOwner}
      </span>
      <span className={cn(!isOwner && "invisible")} aria-hidden={!isOwner}>
        {ROSTER_COPY.makeMember}
      </span>
    </span>
  );
}
