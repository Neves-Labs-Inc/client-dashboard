import { cn } from "@/lib/utils";

const FOUR_TILES = 4;

// Two tiles stay side by side at every width; four wrap to 2x2 and become one
// row from md. Odd counts are not supported (the last row would be ragged).
export function getSummaryColumnsClass(count: number): string {
  return count === FOUR_TILES ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2";
}

// Hairlines are placed per position so a tile never knows where it sits: only
// edges between tiles get one (the strip's own border is the outer edge).
export function getTileBorderClass(index: number, count: number): string {
  const isFourUp = count === FOUR_TILES;
  const isRightColumn = index % 2 === 1;
  const isSecondRow = index >= 2;

  return cn(
    isRightColumn && "border-l border-line",
    isSecondRow && "border-t border-line",
    isFourUp && index > 0 && "md:border-l md:border-line",
    isFourUp && isSecondRow && "md:border-t-0",
  );
}
