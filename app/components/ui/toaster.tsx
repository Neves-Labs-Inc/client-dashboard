import { Toast as RadixToast } from "radix-ui";
import Toast from "@/components/ui/toast";
import { dismissToast, useToasts } from "@/lib/toast";

const TOAST_DURATION_MS = 4000;

// Mounted once in root.tsx. Radix pauses the timer on hover and focus.
export default function Toaster(): React.ReactNode {
  const toasts = useToasts();

  return (
    <RadixToast.Provider duration={TOAST_DURATION_MS} swipeDirection="right">
      {toasts.map((entry) => (
        <Toast
          key={entry.id}
          message={entry.message}
          onDismiss={() => dismissToast(entry.id)}
        />
      ))}
      <RadixToast.Viewport
        label="Notifications ({hotkey})"
        className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[100] flex flex-col gap-2 md:inset-x-auto md:right-4 md:bottom-4 md:w-[360px]"
      />
    </RadixToast.Provider>
  );
}
