type SidebarProps = {
  brand: React.ReactNode;
  children: React.ReactNode;
  footer: React.ReactNode;
};

export default function Sidebar({
  brand,
  children,
  footer,
}: SidebarProps): React.ReactNode {
  return (
    <aside className="sticky top-0 flex h-dvh flex-col border-r border-line bg-surface">
      <div className="px-3 py-3">{brand}</div>
      <nav
        aria-label="Main"
        className="min-h-0 flex-1 overflow-y-auto px-2 py-2"
      >
        {children}
      </nav>
      <div className="border-t border-line p-2">{footer}</div>
    </aside>
  );
}
