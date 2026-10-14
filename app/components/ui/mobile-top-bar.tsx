type MobileTopBarProps = {
  brand: React.ReactNode;
  action: React.ReactNode;
  nav: React.ReactNode;
};

export default function MobileTopBar({
  brand,
  action,
  nav,
}: MobileTopBarProps): React.ReactNode {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-surface pt-[env(safe-area-inset-top)]">
      <div className="flex h-14 items-center justify-between gap-2 pr-1.5 pl-3">
        <div className="min-w-0 flex-1 truncate">{brand}</div>
        {/* The brand gives way; the 44px action never shrinks. */}
        <div className="shrink-0">{action}</div>
      </div>
      {/* The tab row scrolls inside itself; the page never scrolls sideways. */}
      <nav
        aria-label="Main"
        className="flex [scrollbar-width:none] overflow-x-auto px-1 [&::-webkit-scrollbar]:hidden"
      >
        {nav}
      </nav>
    </header>
  );
}
