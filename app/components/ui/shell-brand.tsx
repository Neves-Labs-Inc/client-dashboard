type ShellBrandProps = {
  title: string;
  subtitle: string;
  // "stacked": title over subtitle. "inline": one baseline-aligned line.
  layout: "stacked" | "inline";
};

// A shell's brand block. A long title (a Client name) truncates on its one
// line instead of pushing the layout.
export default function ShellBrand({
  title,
  subtitle,
  layout,
}: ShellBrandProps): React.ReactNode {
  const wrapperClass =
    layout === "inline"
      ? "flex min-w-0 items-baseline gap-2"
      : "flex min-w-0 flex-col";

  return (
    <div className={wrapperClass}>
      <span className="truncate text-sm/5 font-semibold text-fg">{title}</span>
      <span className="shrink-0 font-mono text-xs/4 whitespace-nowrap text-fg-2 uppercase">
        {subtitle}
      </span>
    </div>
  );
}
