/**
 * Day or night, and which one the doctor asked for.
 *
 * Three states, not two. "Follow my system" is a real answer and the one most
 * people want — a laptop that dims itself at dusk should dim this too — but
 * once someone has explicitly chosen, that choice has to survive a reload and
 * must not be quietly overridden at sunset.
 *
 * Module-level for the same reason the dock and the conversation are: the rail
 * renders the control, the document owns the class, and neither should have to
 * pass state through the tree to find the other.
 */

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";
/** What the interface actually ends up looking like. */
export type Resolved = "light" | "dark";

const KEY = "medley-theme";
const listeners = new Set<() => void>();
let current: Theme = "system";
/**
 * Until `initTheme` runs, every read reports the light default.
 *
 * The server has no `matchMedia`, so it renders light. If the client read the
 * real preference on its very first render it would disagree with the markup
 * it is hydrating and React would warn — and on a dark-mode laptop the toggle
 * would visibly flip from Day to Night a frame later. The class on `<html>` is
 * already correct by then (the inline script saw to it); only this store waits.
 */
let ready = false;

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolve(theme: Theme = current): Resolved {
  if (theme === "system") return systemPrefersDark() ? "dark" : "light";
  return theme;
}

/**
 * Writes the class the tokens hang off.
 *
 * Both classes are explicit rather than relying on the absence of one: the
 * inline script in `__root.tsx` needs to distinguish "the doctor chose light"
 * from "nobody has chosen", and a bare `:root` cannot express that.
 */
function apply(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const next = resolve(theme);
  root.classList.toggle("dark", next === "dark");
  root.classList.toggle("light", next === "light");
  root.style.colorScheme = next;
}

/**
 * A brief colour crossfade, and only during the switch.
 *
 * The transition lives on a class that is added for one frame-length and then
 * removed, rather than sitting permanently on every element — a global
 * `transition: background-color` would make every hover in the product lag by
 * the same amount. Reduced motion is handled in the stylesheet, so nothing
 * here needs to know about it.
 */
function crossfade() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.add("theme-switching");
  window.setTimeout(() => root.classList.remove("theme-switching"), 220);
}

export function setTheme(theme: Theme) {
  current = theme;
  try {
    if (theme === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // Private browsing, or storage disabled. The choice still applies for this
    // session; losing it on reload is better than not switching at all.
  }
  crossfade();
  apply(theme);
  listeners.forEach((l) => l());
}

/** Day ⇄ night. Starts from what is currently on screen, not from the stored
 *  value, so the first press from "system" always visibly flips. */
export function toggleTheme() {
  setTheme(resolve() === "dark" ? "light" : "dark");
}

/** Reads what the inline script already decided, so the two never disagree. */
export function initTheme() {
  if (typeof window === "undefined") return;
  try {
    const stored = localStorage.getItem(KEY);
    current = stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    current = "system";
  }
  ready = true;
  apply(current);
  listeners.forEach((l) => l());

  // Only while following the system: once a doctor has chosen, a laptop
  // switching to night mode must not undo them.
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (current !== "system") return;
      apply(current);
      listeners.forEach((l) => l());
    });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme(): { theme: Theme; resolved: Resolved } {
  return useSyncExternalStore(
    subscribe,
    () => (ready ? snapshotFor(current) : LIGHT_SNAPSHOT),
    // The server has no window to ask, so it renders the light default and the
    // inline script has already corrected the class before React arrives.
    () => LIGHT_SNAPSHOT,
  );
}

/** `useSyncExternalStore` compares by reference, so the object must be stable
 *  between reads or it re-renders forever. */
const LIGHT_SNAPSHOT = { theme: "system" as Theme, resolved: "light" as Resolved };
let snapshot = LIGHT_SNAPSHOT;

function snapshotFor(theme: Theme) {
  const resolved = resolve(theme);
  if (snapshot.theme !== theme || snapshot.resolved !== resolved) {
    snapshot = { theme, resolved };
  }
  return snapshot;
}
