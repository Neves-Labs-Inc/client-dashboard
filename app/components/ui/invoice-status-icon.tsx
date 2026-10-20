import type { InvoiceDisplayStatus } from "@/components/ui/invoice-status-badge";
import { cn } from "@/lib/utils";

type InvoiceStatusIconProps = {
  status: InvoiceDisplayStatus;
  size?: 12 | 14 | 16;
  className?: string;
};

const INNER = "var(--color-bg)";

// Shapes differ per status, and none matches a health icon on the same screen.
const SHAPES: Record<InvoiceDisplayStatus, React.ReactNode> = {
  OPEN: (
    <circle
      cx="8"
      cy="8"
      r="6.2"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    />
  ),
  PAID: (
    <path
      d="M2.8 8.6l3.3 3.3 7.1-7.4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  OVERDUE: (
    <>
      <circle cx="8" cy="8" r="7" fill="currentColor" />
      <path
        d="M8 4.3v4.6"
        stroke={INNER}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="11.6" r="1" fill={INNER} />
    </>
  ),
  VOID: (
    <>
      <circle
        cx="8"
        cy="8"
        r="6.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M3.6 12.4L12.4 3.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
};

export default function InvoiceStatusIcon({
  status,
  size = 12,
  className,
}: InvoiceStatusIconProps): React.ReactNode {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      {SHAPES[status]}
    </svg>
  );
}
