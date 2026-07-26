/**
 * Document Picture-in-Picture: Medley in a window that floats over everything.
 *
 * The only way a web page is allowed to draw above other tabs and other
 * applications. A normal popup is just another window in the stack; this one
 * stays on top of Chrome, the browser the doctor is reading in, and whatever
 * else is open — which is the whole point of a thing you talk to while looking
 * something up.
 *
 * Chrome and Edge on the desktop. Safari, Firefox and every mobile browser
 * return `supported: false` and keep the in-page dock, which is why the button
 * that calls this is conditional rather than the feature being conditional.
 */

import { useCallback, useEffect, useState } from "react";

/** Not in TypeScript's DOM lib yet. */
interface DocumentPiP {
  requestWindow(options?: {
    width?: number;
    height?: number;
    disallowReturnToOpener?: boolean;
    preferInitialWindowPlacement?: boolean;
  }): Promise<Window>;
  window: Window | null;
}

function api(): DocumentPiP | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { documentPictureInPicture?: DocumentPiP })
    .documentPictureInPicture ?? null;
}

/**
 * Stylesheets do not cross documents. Without this the window opens completely
 * unstyled — correct markup, no CSS — which looks like a crash rather than a
 * feature.
 *
 * Same-origin sheets can be read and inlined. Cross-origin ones (Google Fonts)
 * throw on `cssRules`, so they are re-linked by href instead and fetched again
 * by the new document.
 */
function cloneStyles(target: Window) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const css = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join("\n");
      const style = target.document.createElement("style");
      style.textContent = css;
      target.document.head.appendChild(style);
    } catch {
      if (!sheet.href) continue;
      const link = target.document.createElement("link");
      link.rel = "stylesheet";
      link.href = sheet.href;
      target.document.head.appendChild(link);
    }
  }
}

/**
 * The theme lives as a class on `<html>`, and the new document has its own.
 * Copied on open and kept in step, so switching to night while popped out
 * doesn't leave a white rectangle floating over a dark screen.
 */
function syncTheme(target: Window): () => void {
  const source = document.documentElement;
  const copy = () => {
    target.document.documentElement.className = source.className;
    target.document.documentElement.style.colorScheme = source.style.colorScheme;
    // The floating window is its own surface, not a page: it should be the
    // panel colour edge to edge rather than the app canvas.
    target.document.body.style.background = "var(--popover)";
    target.document.body.style.margin = "0";
    target.document.body.style.overflow = "hidden";
  };
  copy();
  const observer = new MutationObserver(copy);
  observer.observe(source, { attributes: true, attributeFilter: ["class", "style"] });
  return () => observer.disconnect();
}

export interface PipState {
  /** False on Safari, Firefox, and everything mobile. */
  supported: boolean;
  /** The floating window, once open. Portal target is `pipWindow.document.body`. */
  pipWindow: Window | null;
  open: () => Promise<void>;
  close: () => void;
}

export function usePipWindow(size: { width: number; height: number }): PipState {
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [supported, setSupported] = useState(false);

  // Checked in an effect, not at render: the server has no `window`, and a
  // button that appears only after hydration is better than a hydration
  // mismatch on every load.
  useEffect(() => setSupported(Boolean(api())), []);

  const open = useCallback(async () => {
    const pip = api();
    if (!pip || pipWindow) return;
    // Must be called from a user gesture; the button click is the gesture.
    const win = await pip.requestWindow({
      width: size.width,
      height: size.height,
      disallowReturnToOpener: true,
    });
    cloneStyles(win);
    const stopTheme = syncTheme(win);

    // Closing is the OS window's X, not ours, so the state has to follow it
    // rather than the other way round.
    win.addEventListener("pagehide", () => {
      stopTheme();
      setPipWindow(null);
    });
    setPipWindow(win);
  }, [pipWindow, size.width, size.height]);

  const close = useCallback(() => {
    pipWindow?.close();
    setPipWindow(null);
  }, [pipWindow]);

  // A floating window outliving the tab that owns it would be orphaned — its
  // React tree lives here, so it must go when this does.
  useEffect(() => {
    return () => {
      const open = api()?.window;
      if (open && !open.closed) open.close();
    };
  }, []);

  return { supported, pipWindow, open, close };
}
