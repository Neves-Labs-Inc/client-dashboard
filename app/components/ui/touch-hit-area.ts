// On touch (below md, or a coarse pointer at any width) a small text link
// gets an invisible hit area; how it looks never changes. Callers add the
// insets.
export const TOUCH_HIT_AREA_CLASS =
  "relative after:absolute after:content-[''] md:after:hidden pointer-coarse:after:block";

// A 20px-line text link in a fact row or panel body: 14px above and below
// (48px), 4px each side. inline-block, so a wrapped link's box (and so its
// hit area) covers every line; align-top keeps a wrapped link from dragging
// a baseline-aligned label down to its last line.
export const ROW_LINK_HIT_AREA_CLASS = `${TOUCH_HIT_AREA_CLASS} inline-block max-w-full align-top after:-inset-x-1 after:-inset-y-3.5`;
