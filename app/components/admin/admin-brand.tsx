type AdminBrandProps = {
  // "stacked" in the sidebar, "inline" in the mobile top bar.
  layout: "stacked" | "inline";
};

export default function AdminBrand({
  layout,
}: AdminBrandProps): React.ReactNode {
  const wrapperClass =
    layout === "inline" ? "flex items-baseline gap-2" : "flex flex-col";

  return (
    <div className={wrapperClass}>
      <span className="text-sm/5 font-semibold text-fg">Neves Labs</span>
      <span className="font-mono text-xs/4 text-fg-2 uppercase">Admin</span>
    </div>
  );
}
