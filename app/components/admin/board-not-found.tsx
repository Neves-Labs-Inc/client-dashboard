import BoardBackLink from "@/components/admin/board-back-link";
import { CLIENTS_CRUMB } from "@/components/admin/client-workspace-header";
import PageHeader from "@/components/ui/page-header";
import { BOARD_DETAIL_COPY } from "@/lib/board-detail";
import { getProjectsPath } from "@/lib/link-board";

// The 404 in the main column. Nothing here confirms the Project exists
// under another Client.
export default function BoardNotFound({
  clientId,
}: {
  clientId: string;
}): React.ReactNode {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumb={[
          CLIENTS_CRUMB,
          { label: BOARD_DETAIL_COPY.back, href: getProjectsPath(clientId) },
        ]}
        title={BOARD_DETAIL_COPY.notFound}
      />
      <p className="text-[13px]/5 text-fg-2">
        {BOARD_DETAIL_COPY.notFoundDetail}
      </p>
      <BoardBackLink clientId={clientId} />
    </div>
  );
}
