import { Columns3 } from "lucide-react";
import { Link } from "react-router";
import { buttonStyles } from "@/components/ui/button-styles";
import { getMapHref, MAP_COPY } from "@/lib/projects";
import { cn } from "@/lib/utils";

type MapColumnsButtonProps = {
  projectId: string;
  projectName: string;
};

// A link, not a button: opening the drawer is a URL change. The data
// attribute lets the drawer find it again after a revalidation re-renders
// the row.
export default function MapColumnsButton({
  projectId,
  projectName,
}: MapColumnsButtonProps): React.ReactNode {
  return (
    <Link
      to={getMapHref(projectId)}
      preventScrollReset
      aria-label={`${MAP_COPY.title} for ${projectName}`}
      data-map-trigger={projectId}
      className={cn(
        buttonStyles({ variant: "secondary" }),
        "h-11 px-4 text-sm whitespace-nowrap md:h-8 md:px-2.5 md:text-[13px] pointer-coarse:h-11 pointer-coarse:px-4",
      )}
    >
      <Columns3 size={14} aria-hidden="true" className="shrink-0" />
      {MAP_COPY.title}
    </Link>
  );
}
