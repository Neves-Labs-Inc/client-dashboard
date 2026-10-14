import TagBadge from "@/components/ui/tag-badge";
import { ARCHIVE_COPY } from "@/lib/team-archive";

type ArchivedBadgeProps = {
  // Fades in when the Client has just been archived; on a page load it's
  // simply there.
  isAnimated?: boolean;
};

// The text is in the DOM (inside the h1), so screen readers read it with
// the name.
export default function ArchivedBadge({
  isAnimated = false,
}: ArchivedBadgeProps): React.ReactNode {
  return <TagBadge isAnimated={isAnimated}>{ARCHIVE_COPY.badge}</TagBadge>;
}
