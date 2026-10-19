import { Eye } from "lucide-react";
import ExitPreviewLink from "@/components/preview/exit-preview-link";
import InfoBanner from "@/components/ui/info-banner";

type PreviewBannerProps = {
  clientName: string;
  isArchived: boolean;
  exitHref: string;
};

// On every preview page, above the page: whose pages these are, that they're
// read-only, and the way out. Not dismissible; the preview shell renders it
// once, so it isn't re-announced on navigation.
export default function PreviewBanner({
  clientName,
  isArchived,
  exitHref,
}: PreviewBannerProps): React.ReactNode {
  return (
    <InfoBanner
      icon={Eye}
      label="Admin preview"
      isAnimated={false}
      action={<ExitPreviewLink href={exitHref} />}
    >
      {/* The name wraps, never truncates: this is where it shows in full. */}
      <span className="block break-words">
        Previewing <span className="font-semibold">{clientName}</span> as an
        Owner · Read-only
      </span>
      {isArchived && (
        <span className="block text-fg-2">
          Archived: its users can&apos;t sign in
        </span>
      )}
    </InfoBanner>
  );
}
