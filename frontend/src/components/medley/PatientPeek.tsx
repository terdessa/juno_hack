import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Patient } from "@/lib/types";

const CARD_W = 304;
const CARD_H = 268;
const GUTTER = 16;
/** Matches Tailwind's `lg`, which is the breakpoint the card renders at. */
const PEEK_MIN_WIDTH = 1024;

/**
 * A glance at the record without leaving the list. Opens after a beat so it
 * doesn't flicker while the doctor scans down the page, and never intercepts
 * the click — the row underneath still navigates.
 *
 * Anchored to the row rather than following the cursor: a card that chases the
 * pointer re-renders on every mouse frame and is unreachable by keyboard.
 *
 * **Deliberately invisible to assistive tech.** It used to set
 * `aria-describedby` at the wrapper, so every arrow-key move down the list read
 * out a paragraph — name, age, NHS number, condition, the whole medication
 * list and three lines of notes — before the row's own text. Worse, below
 * `lg` the card is `hidden`, so the description pointed at content that was
 * not rendered at all. A screen-reader user gains nothing from a hover
 * affordance whose entire content is one Enter press away on the record
 * itself, so it is now `aria-hidden` and purely visual.
 */
export function PatientPeek({ patient, children }: { patient: Patient; children: ReactNode }) {
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Never open below `lg`. Positioning ran and state was set even when the
  // card could not be seen, which was work for nothing on exactly the devices
  // with the least to spare.
  const wideEnough = () =>
    typeof window !== "undefined" && window.innerWidth >= PEEK_MIN_WIDTH;

  const open = () => {
    if (!wideEnough()) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const row = wrapper.current?.getBoundingClientRect();
      if (!row) return;
      setAt({
        top: Math.max(GUTTER, Math.min(row.top, window.innerHeight - CARD_H - GUTTER)),
        left: Math.max(GUTTER, Math.min(row.right - CARD_W, window.innerWidth - CARD_W - GUTTER)),
      });
    }, 220);
  };

  const close = () => {
    if (timer.current) clearTimeout(timer.current);
    setAt(null);
  };

  // A card anchored to a row is wrong the moment the row moves.
  useEffect(() => {
    if (!at) return;
    window.addEventListener("scroll", close, { passive: true });
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close);
      window.removeEventListener("resize", close);
    };
  }, [at]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <div
      ref={wrapper}
      onMouseEnter={open}
      onMouseLeave={close}
      onFocus={open}
      onBlur={close}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
    >
      {children}
      {at && (
        <div
          aria-hidden
          style={{ top: at.top, left: at.left, width: CARD_W, zIndex: "var(--z-peek)" }}
          className="pointer-events-none fixed hidden rounded-xl border border-border bg-popover p-4 shadow-float lg:block"
        >
          <div className="font-medium text-lg leading-tight">{patient.name}</div>
          <div className="mt-0.5 text-body text-muted-foreground">
            {patient.age} · NHS {patient.nhsNumber}
          </div>

          <div className="mt-3 text-micro font-medium">{patient.condition}</div>

          {patient.medications.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {patient.medications.map((m) => (
                <li key={m} className="text-micro text-muted-foreground">
                  {m}
                </li>
              ))}
            </ul>
          )}

          {patient.notes && (
            <p className="mt-3 line-clamp-3 border-t border-border pt-3 text-micro text-muted-foreground">
              {patient.notes}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
