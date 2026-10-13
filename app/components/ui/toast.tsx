import { X } from "lucide-react";
import { Toast as RadixToast } from "radix-ui";
import IconButton from "@/components/ui/icon-button";
import StatusIcon from "@/components/ui/status-icon";

type ToastProps = {
  message: string;
  onDismiss: () => void;
};

// Success only (DESIGN §9.13). "background" type: announced politely, as a
// status, without stealing focus.
export default function Toast({
  message,
  onDismiss,
}: ToastProps): React.ReactNode {
  return (
    <RadixToast.Root
      type="background"
      onOpenChange={(isOpen) => {
        if (!isOpen) onDismiss();
      }}
      className="flex items-start gap-2 rounded-[3px] border border-line-strong bg-surface py-1 pr-1 pl-3 text-[13px]/5 text-fg shadow-[0_10px_30px_rgb(0_0_0/0.18)] duration-(--dur-base) ease-out data-[state=closed]:animate-out data-[state=closed]:duration-(--dur-fast) data-[state=closed]:ease-in data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-2 data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x) motion-reduce:data-[state=closed]:duration-(--dur-instant) motion-reduce:data-[state=open]:duration-(--dur-instant) motion-reduce:data-[state=open]:slide-in-from-bottom-0"
    >
      <StatusIcon status="ok" size={14} className="mt-3.5" />
      <RadixToast.Description className="flex-1 py-3">
        {message}
      </RadixToast.Description>
      <RadixToast.Close asChild>
        <IconButton size="touch" label="Dismiss" icon={X} />
      </RadixToast.Close>
    </RadixToast.Root>
  );
}
