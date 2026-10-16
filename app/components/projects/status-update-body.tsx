import Markdown from "@/components/ui/markdown";
import { cn } from "@/lib/utils";

type StatusUpdateBodyProps = {
  body: string;
  className?: string;
};

// The note as Markdown, never truncated; "No note." when it's empty.
export default function StatusUpdateBody({
  body,
  className,
}: StatusUpdateBodyProps): React.ReactNode {
  if (body.trim() === "") {
    return <p className={cn("text-[13px]/5 text-fg-2", className)}>No note.</p>;
  }

  return (
    <Markdown className={cn("md:max-w-prose xl:max-w-none", className)}>
      {body}
    </Markdown>
  );
}
