import { Columns3 } from "lucide-react";
import { Link } from "react-router";
import Button from "@/components/ui/button";
import { buttonStyles } from "@/components/ui/button-styles";
import { getMapHref, MAP_COPY } from "@/lib/projects";
import { cn } from "@/lib/utils";

type MapColumnsButtonProps = {
  projectId: string;
  projectName: string;
  // Another action of the row is running: a disabled button stands in, as
  // a link can't be disabled.
  isDisabled?: boolean;
};

// A link, not a button: opening the drawer is a URL change. The data
// attribute lets the drawer find it again after a revalidation re-renders
// the row.
export default function MapColumnsButton({
  projectId,
  projectName,
  isDisabled = false,
}: MapColumnsButtonProps): React.ReactNode {
  const label = `${MAP_COPY.title} for ${projectName}`;
  if (isDisabled) {
    return (
      <Button
        icon={Columns3}
        className="whitespace-nowrap"
        disabled
        aria-label={label}
      >
        {MAP_COPY.title}
      </Button>
    );
  }

  return (
    <Link
      to={getMapHref(projectId)}
      preventScrollReset
      aria-label={label}
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
