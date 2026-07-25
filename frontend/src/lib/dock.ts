/**
 * Whether the floating Medley window is open.
 *
 * Module-level for the same reason the conversation is: the rail, the home
 * screen and the dock itself all need the answer, and it outlives any route.
 * It also decides which surface owns the microphone, so exactly one thing may
 * ever hold it.
 */

import { useSyncExternalStore } from "react";

let open = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function openDock() {
  if (open) return;
  open = true;
  emit();
}

export function closeDock() {
  if (!open) return;
  open = false;
  emit();
}

export function toggleDock() {
  open = !open;
  emit();
}

export function useDockOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => open,
    // The server has no dock; starting closed avoids a hydration mismatch.
    () => false,
  );
}
