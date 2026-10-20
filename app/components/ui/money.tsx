import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

type MoneyProps = {
  cents: number;
  className?: string;
};

// Size, weight and color inherit from the caller; negatives are not red.
export default function Money({
  cents,
  className,
}: MoneyProps): React.ReactNode {
  return (
    <span className={cn("font-mono whitespace-nowrap tabular-nums", className)}>
      {formatMoney(cents)}
    </span>
  );
}
