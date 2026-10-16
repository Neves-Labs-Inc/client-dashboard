import { Children } from "react";
import {
  getSummaryColumnsClass,
  getTileBorderClass,
} from "@/components/ui/summary-grid";

type SummaryRowProps = {
  label: string;
  // 2 or 4 SummaryTiles; the row places the hairlines itself.
  children: React.ReactNode;
};

export default function SummaryRow({
  label,
  children,
}: SummaryRowProps): React.ReactNode {
  const tiles = Children.toArray(children);

  return (
    <ul
      aria-label={label}
      className={`grid overflow-hidden rounded-[3px] border border-line bg-surface ${getSummaryColumnsClass(tiles.length)}`}
    >
      {tiles.map((tile, index) => (
        <li
          key={index}
          className={`min-w-0 ${getTileBorderClass(index, tiles.length)}`}
        >
          {tile}
        </li>
      ))}
    </ul>
  );
}
