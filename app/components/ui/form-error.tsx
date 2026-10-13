import { cn } from "@/lib/utils";
import StatusIcon from "@/components/ui/status-icon";

type FormErrorProps = {
  variant?: "field" | "banner";
  // Banner only: false shows it instantly (no fade or slide).
  isAnimated?: boolean;
  id?: string;
  children: React.ReactNode;
};

export default function FormError({
  variant = "field",
  isAnimated = true,
  id,
  children,
}: FormErrorProps): React.ReactNode {
  if (variant === "banner") {
    return (
      <div
        id={id}
        role="alert"
        className={cn(
          "flex items-start gap-2 rounded-[3px] border border-off bg-off-subtle px-3 py-2 text-[13px]/5 text-fg",
          isAnimated &&
            "animate-in duration-(--dur-base) ease-(--ease-out) fade-in-0 slide-in-from-top-1 motion-reduce:duration-(--dur-instant) motion-reduce:slide-in-from-top-0",
        )}
      >
        <StatusIcon status="off" size={16} className="mt-0.5" />
        <span>{children}</span>
      </div>
    );
  }

  return (
    <p
      id={id}
      className="mt-1.5 flex items-start gap-1.5 text-[13px]/5 text-off"
    >
      <StatusIcon status="off" className="mt-1" />
      <span>{children}</span>
    </p>
  );
}
