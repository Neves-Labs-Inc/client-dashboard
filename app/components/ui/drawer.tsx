import { X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import Button from "@/components/ui/button";
import FormError from "@/components/ui/form-error";
import IconButton from "@/components/ui/icon-button";

const FOCUSABLE_SELECTOR =
  'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

type DirtyConfirm = {
  message: string;
  confirmLabel: string;
  cancelLabel: string;
};

type FooterApi = {
  // The caller's Cancel button calls this, so it honors the dirty confirm.
  requestClose: () => void;
};

type DrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  footer: React.ReactNode | ((api: FooterApi) => React.ReactNode);
  error?: string | null;
  isDirty?: boolean;
  dirtyConfirm?: DirtyConfirm;
  // False when the caller moves focus itself on close (e.g. navigating to a
  // page that focuses its heading), so the opener doesn't take it back.
  shouldReturnFocus?: boolean;
  // Where focus goes on close instead of the opener, asked at close time:
  // for a drawer opened without a click, or one whose opener goes away.
  getReturnFocusTarget?: () => HTMLElement | null;
};

export default function Drawer({
  open,
  onOpenChange,
  title,
  children,
  footer,
  error,
  isDirty = false,
  dirtyConfirm,
  shouldReturnFocus = true,
  getReturnFocusTarget,
}: DrawerProps): React.ReactNode {
  const [isConfirming, setIsConfirming] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  // Where focus was when the dirty confirm opened, restored on Keep editing.
  const editFocusRef = useRef<HTMLElement | null>(null);
  const isReturningToEditRef = useRef(false);
  // A close from the caller (submit success) must not leave the confirm up.
  if (!open && isConfirming) setIsConfirming(false);
  const shouldConfirm = isDirty && dirtyConfirm !== undefined;

  // Controlled drawers have no Dialog.Trigger, so remember the opener here;
  // layout effect runs before FocusScope moves focus into the body.
  useLayoutEffect(() => {
    if (open) returnFocusRef.current = document.activeElement as HTMLElement;
  }, [open]);

  // Runs after the confirm row unmounts (it held focus), so the restored focus
  // can't be lost with it. A footer button the confirm replaced is a new node
  // now, so it falls back to the first field.
  useEffect(() => {
    if (isConfirming || !isReturningToEditRef.current) return;

    isReturningToEditRef.current = false;
    const previous = editFocusRef.current;
    const body = bodyRef.current;
    const content = body?.closest<HTMLElement>('[role="dialog"]');
    const target =
      previous?.isConnected && content?.contains(previous)
        ? previous
        : body?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    target?.focus();
  }, [isConfirming]);

  // A new error scrolls into view without moving focus.
  useEffect(() => {
    if (error) bodyRef.current?.scrollTo({ top: 0 });
  }, [error]);

  function requestClose(): void {
    if (shouldConfirm) {
      editFocusRef.current = document.activeElement as HTMLElement | null;
      setIsConfirming(true);
    } else {
      onOpenChange(false);
    }
  }

  function handleOpenChange(next: boolean): void {
    if (next) {
      onOpenChange(true);
    } else {
      requestClose();
    }
  }

  function handleDiscard(): void {
    setIsConfirming(false);
    onOpenChange(false);
  }

  function handleKeepEditing(): void {
    isReturningToEditRef.current = true;
    setIsConfirming(false);
  }

  function handleOpenAutoFocus(event: Event): void {
    // Never the close button: the first body field (or [data-autofocus]).
    const body = bodyRef.current;
    const target =
      body?.querySelector<HTMLElement>("[data-autofocus]") ??
      body?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    if (target) {
      event.preventDefault();
      target.focus();
    }
  }

  function handleCloseAutoFocus(event: Event): void {
    if (!shouldReturnFocus) {
      event.preventDefault();
      return;
    }
    const opener = getReturnFocusTarget?.() ?? returnFocusRef.current;
    if (opener?.isConnected) {
      event.preventDefault();
      opener.focus();
    }
  }

  function handleEscapeKeyDown(event: KeyboardEvent): void {
    // Esc while confirming goes back to editing instead of dismissing.
    if (isConfirming) {
      event.preventDefault();
      handleKeepEditing();
    }
  }

  const renderedFooter =
    typeof footer === "function" ? footer({ requestClose }) : footer;

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/45 data-[state=closed]:animate-out data-[state=closed]:duration-(--dur-drawer-out) data-[state=closed]:ease-in data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:duration-(--dur-drawer-in) data-[state=open]:ease-out data-[state=open]:fade-in-0 motion-reduce:data-[state=closed]:duration-(--dur-instant) motion-reduce:data-[state=open]:duration-(--dur-instant)" />
        <Dialog.Content
          aria-modal="true"
          aria-describedby={undefined}
          onOpenAutoFocus={handleOpenAutoFocus}
          onEscapeKeyDown={handleEscapeKeyDown}
          onCloseAutoFocus={handleCloseAutoFocus}
          className="fixed inset-0 z-50 flex h-dvh flex-col rounded-none bg-surface data-[state=closed]:animate-out data-[state=closed]:duration-(--dur-drawer-out) data-[state=closed]:ease-in data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:duration-(--dur-drawer-in) data-[state=open]:ease-out data-[state=open]:slide-in-from-right motion-reduce:data-[state=closed]:duration-(--dur-instant) motion-reduce:data-[state=closed]:slide-out-to-right-0 motion-reduce:data-[state=open]:duration-(--dur-instant) motion-reduce:data-[state=open]:slide-in-from-right-0 md:inset-y-0 md:right-0 md:left-auto md:w-[420px] md:border-l md:border-line"
        >
          <div className="flex min-h-14 items-center justify-between gap-2 border-b border-line pr-1.5 pl-4">
            <Dialog.Title className="text-[13px]/[18px] font-semibold tracking-[0.06em] text-fg uppercase">
              {title}
            </Dialog.Title>
            <Dialog.Close asChild>
              <IconButton size="touch" label="Close" icon={X} />
            </Dialog.Close>
          </div>
          <div
            ref={bodyRef}
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4"
          >
            {/* Instant, per DESIGN: no motion or layout animation. */}
            {error && (
              <FormError variant="banner" isAnimated={false}>
                {error}
              </FormError>
            )}
            {children}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {isConfirming && dirtyConfirm ? (
              <div className="flex w-full animate-in flex-wrap items-center justify-end gap-2 duration-(--dur-fast) ease-out fade-in-0">
                <p className="w-full text-[13px]/5 text-fg md:mr-auto md:w-auto">
                  {dirtyConfirm.message}
                </p>
                <Button autoFocus onClick={handleKeepEditing}>
                  {dirtyConfirm.cancelLabel}
                </Button>
                <Button variant="destructive" onClick={handleDiscard}>
                  {dirtyConfirm.confirmLabel}
                </Button>
              </div>
            ) : (
              renderedFooter
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
