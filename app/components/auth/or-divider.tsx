// Decorative: the buttons on either side already say what they do.
export default function OrDivider(): React.ReactNode {
  return (
    <div aria-hidden="true" className="flex items-center gap-3">
      <span className="h-px flex-1 bg-line" />
      <span className="text-xs/4 font-medium tracking-[0.06em] text-fg-2 uppercase">
        or
      </span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
