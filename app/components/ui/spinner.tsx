import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type SpinnerProps = {
  className?: string;
};

// 12px; the label change carries the pending state when motion is reduced.
export default function Spinner({ className }: SpinnerProps): React.ReactNode {
  return (
    <LoaderCircle
      size={12}
      aria-hidden="true"
      className={cn(
        "shrink-0 animate-spin motion-reduce:animate-none",
        className,
      )}
    />
  );
}
