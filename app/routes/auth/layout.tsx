import { Outlet } from "react-router";

// The frame every sign-in screen shares: brand line over one centered card,
// no shell. Each child route renders its own h1 and content.
export default function AuthLayout(): React.ReactNode {
  return (
    <main className="grid min-h-dvh place-items-center p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-5 md:pt-[max(1rem,env(safe-area-inset-top))] md:pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-sm">
        <p className="mb-3 flex items-baseline gap-1.5">
          <span className="text-sm/5 font-semibold text-fg">Neves Labs</span>
          <span className="font-mono text-xs/4 text-fg-2 uppercase">
            · portal
          </span>
        </p>
        <div className="flex flex-col gap-4 rounded-[3px] border border-line bg-surface p-4 md:p-6">
          <Outlet />
        </div>
      </div>
    </main>
  );
}
