type AppShellProps = {
  sidebar: React.ReactNode;
  mobileTopBar: React.ReactNode;
  children: React.ReactNode;
};

// Slots only: no Client-specific content, so the Admin and client shells both
// fill it.
export default function AppShell({
  sidebar,
  mobileTopBar,
  children,
}: AppShellProps): React.ReactNode {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[220px_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only rounded-[3px] border border-line-strong bg-surface-2 px-3 py-2 text-[13px]/5 font-medium text-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to content
      </a>
      <div className="md:hidden">{mobileTopBar}</div>
      <div className="hidden md:block">{sidebar}</div>
      <main id="main" className="min-w-0 p-3 md:px-5 md:py-4">
        <div className="flex max-w-[1280px] flex-col gap-4">{children}</div>
      </main>
    </div>
  );
}
