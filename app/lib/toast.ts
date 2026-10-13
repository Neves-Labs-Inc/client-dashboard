import { useSyncExternalStore } from "react";

const MAX_TOASTS = 3;

export type ToastEntry = { id: number; message: string };

type Listener = () => void;

// A tiny module-level store so any code can call toast("...") without a
// provider. Newest last; the oldest drops past MAX_TOASTS.
let toasts: ToastEntry[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function toast(message: string): void {
  toasts = [...toasts, { id: nextId, message }].slice(-MAX_TOASTS);
  nextId += 1;
  emit();
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((entry) => entry.id !== id);
  emit();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const EMPTY: ToastEntry[] = [];

export function useToasts(): ToastEntry[] {
  return useSyncExternalStore(
    subscribe,
    () => toasts,
    () => EMPTY,
  );
}
